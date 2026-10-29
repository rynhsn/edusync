import { randomUUID } from 'node:crypto';
import { quoteUnits, type UnitSelection } from '@edusync/contracts';
import {
  and,
  auditLog,
  type Db,
  entitlement,
  eq,
  inArray,
  invoice,
  isNull,
  loadCatalog,
  lt,
  registration,
  school,
  subscription,
  type Tx,
  user,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { PaymentProvider } from './provider';

export const GRACE_DAYS = 7;
export const RENEWAL_LEAD_DAYS = 7;

const DAY = 86_400_000;

export const addMonths = (from: Date, months: number) => {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

/**
 * Perpanjangan dibayar: periode berikutnya disambung dari akhir periode saat ini (bukan dari hari bayar,
 * agar membayar lebih awal tidak menghilangkan waktu), hak modul diperpanjang, dan unit yang
 * ditangguhkan karena tagihan dibuka kembali. Penangguhan oleh staf tidak disentuh.
 */
export async function applyRenewal(tx: Tx, inv: typeof invoice.$inferSelect, now = new Date()) {
  const foundationId = inv.foundationId as string;
  const [sub] = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.foundationId, foundationId))
    .for('update');
  if (!sub) throw new Error('Langganan tidak ditemukan untuk yayasan ini');

  const start = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const end = addMonths(start, sub.period === 'yearly' ? 12 : 1);
  await tx
    .update(subscription)
    .set({ status: 'active', currentPeriodStart: start, currentPeriodEnd: end })
    .where(eq(subscription.id, sub.id));
  await tx.update(invoice).set({ status: 'paid', paidAt: now }).where(eq(invoice.id, inv.id));

  const schools = await tx
    .select({ id: school.id })
    .from(school)
    .where(eq(school.foundationId, foundationId));
  const ids = schools.map((s) => s.id);
  if (ids.length > 0) {
    await tx.update(entitlement).set({ validUntil: end }).where(inArray(entitlement.schoolId, ids));
    await tx
      .update(school)
      .set({ status: 'active', suspendedReason: null })
      .where(and(inArray(school.id, ids), eq(school.suspendedReason, 'billing')));
  }
  await tx.insert(auditLog).values({
    action: 'subscription.renewed',
    entityType: 'subscription',
    entityId: sub.id,
    details: { invoiceId: inv.id, foundationId, periodEnd: end.toISOString() },
  });
}

/**
 * Buat invoice perpanjangan untuk langganan yang periodenya hampir habis dan belum punya invoice terbuka.
 * Aman dijalankan berulang dan oleh banyak worker sekaligus (SKIP LOCKED).
 */
export async function createRenewalInvoices(db: Db, provider: PaymentProvider, now = new Date()) {
  const due = new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY);
  const candidates = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(
      and(
        inArray(subscription.status, ['active', 'past_due', 'suspended']),
        lt(subscription.currentPeriodEnd, due),
      ),
    );

  let created = 0;
  for (const { id: subscriptionId } of candidates) {
    const result = await db.transaction(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscription)
        .where(eq(subscription.id, subscriptionId))
        .for('update', { skipLocked: true });
      if (!sub) return null;

      const [open] = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(
          and(
            eq(invoice.foundationId, sub.foundationId),
            isNull(invoice.registrationId),
            eq(invoice.status, 'open'),
          ),
        );
      if (open) return null;

      const schools = await tx.select().from(school).where(eq(school.foundationId, sub.foundationId));
      const ents = await tx
        .select({ schoolId: entitlement.schoolId, moduleKey: entitlement.moduleKey })
        .from(entitlement)
        .where(
          inArray(
            entitlement.schoolId,
            schools.map((s) => s.id),
          ),
        );
      const units: (UnitSelection & { name: string })[] = schools.map((s) => ({
        name: s.name,
        tier: s.studentTier,
        modules: ents.filter((e) => e.schoolId === s.id).map((e) => e.moduleKey),
      }));
      const quote = quoteUnits(await loadCatalog(db), units, sub.period);

      const [reg] = await tx
        .select()
        .from(registration)
        .where(eq(registration.foundationId, sub.foundationId));
      const [owner] = reg ? await tx.select().from(user).where(eq(user.id, reg.userId)) : [];
      if (!owner) return null;

      const orderId = `ren-${randomUUID()}`;
      const [inv] = await tx
        .insert(invoice)
        .values({
          foundationId: sub.foundationId,
          amount: quote.total,
          provider: provider.name,
          providerRef: orderId,
          lines: quote.lines,
          dueAt: sub.currentPeriodEnd,
        })
        .returning();
      return { inv: inv!, owner, orderId, amount: quote.total, periodEnd: sub.currentPeriodEnd };
    });
    if (!result) continue;

    // Penyedia dipanggil di luar transaksi; bila gagal, invoice dibatalkan dan dicoba lagi pada putaran berikutnya.
    try {
      const { paymentUrl } = await provider.createCharge({
        orderId: result.orderId,
        amount: result.amount,
        customer: { name: result.owner.name, email: result.owner.email },
        description: 'Perpanjangan langganan Edusync',
        returnPath: '/dashboard',
      });
      await db.transaction(async (tx) => {
        await tx.update(invoice).set({ paymentUrl }).where(eq(invoice.id, result.inv.id));
        await enqueue(tx, QUEUES.emailSend, {
          to: result.owner.email,
          subject: 'Tagihan perpanjangan Edusync',
          text:
            `Halo ${result.owner.name},\n\nLangganan Edusync Anda berakhir pada ${result.periodEnd.toISOString().slice(0, 10)}.\n` +
            `Tagihan perpanjangan: Rp ${result.amount.toLocaleString('id-ID')}.\n\nBayar di: ${paymentUrl}\n\n` +
            `Bila terlambat lebih dari ${GRACE_DAYS} hari, akses sekolah akan dihentikan sementara dan dibuka lagi setelah dibayar.`,
        });
      });
      created++;
    } catch (error) {
      console.error('[billing] gagal membuat tagihan perpanjangan', error);
      await db.update(invoice).set({ status: 'void' }).where(eq(invoice.id, result.inv.id));
    }
  }
  return created;
}

/**
 * Perbarui status langganan menurut tanggal: lewat jatuh tempo menjadi past_due (masa tenggang, sekolah tetap
 * jalan), lewat masa tenggang menjadi suspended dan semua unit ditangguhkan karena tagihan.
 */
export async function sweepSubscriptions(db: Db, now = new Date()) {
  const pastDue = await db
    .update(subscription)
    .set({ status: 'past_due' })
    .where(and(eq(subscription.status, 'active'), lt(subscription.currentPeriodEnd, now)))
    .returning({ id: subscription.id });

  const cutoff = new Date(now.getTime() - GRACE_DAYS * DAY);
  const toSuspend = await db
    .update(subscription)
    .set({ status: 'suspended' })
    .where(and(eq(subscription.status, 'past_due'), lt(subscription.currentPeriodEnd, cutoff)))
    .returning({ foundationId: subscription.foundationId });

  let suspendedSchools = 0;
  for (const { foundationId } of toSuspend) {
    const rows = await db
      .update(school)
      .set({ status: 'suspended', suspendedReason: 'billing' })
      .where(and(eq(school.foundationId, foundationId), eq(school.status, 'active')))
      .returning({ id: school.id });
    suspendedSchools += rows.length;
    await db.insert(auditLog).values({
      action: 'subscription.suspended',
      entityType: 'foundation',
      entityId: foundationId,
      details: { reason: 'billing', schools: rows.length },
    });
  }
  return { pastDue: pastDue.length, suspendedFoundations: toSuspend.length, suspendedSchools };
}

/** Dipakai tes dan konsol staf: apakah modul masih berlaku pada waktu tertentu. */
export const entitlementActive = (validUntil: Date, now = new Date()) => validUntil > now;
