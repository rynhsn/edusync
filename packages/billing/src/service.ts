import { randomUUID } from 'node:crypto';
import {
  QuoteError,
  quoteUnits,
  type RegistrationInput,
  slugify,
  withRequirements,
} from '@edusync/contracts';
import {
  and,
  assignRoles,
  auditLog,
  type Db,
  entitlement,
  eq,
  foundation,
  foundationOwner,
  gt,
  inArray,
  invoice,
  loadBillingSettings,
  loadCatalog,
  lt,
  member,
  payment,
  registration,
  school,
  seedSchoolRoles,
  slugReservation,
  subscription,
  type Tx,
  user,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { DomainError } from './errors';
import { addMonths, applyRenewal } from './lifecycle';
import type { PaymentEvent, PaymentProvider } from './provider';

export type PaymentOutcome =
  | 'activated'
  | 'renewed'
  | 'duplicate'
  | 'unknown_invoice'
  | 'recorded'
  | 'failed'
  | 'amount_mismatch'
  | 'needs_review';

export type SlugStatus = 'available' | 'taken';

/** Subdomain tersedia bila belum dipakai sekolah dan tidak sedang dipesan pendaftaran lain. */
export async function slugStatus(
  db: Db | Tx,
  slug: string,
  exceptRegistrationId?: string,
): Promise<SlugStatus> {
  const [existing] = await db.select({ id: school.id }).from(school).where(eq(school.slug, slug));
  if (existing) return 'taken';
  const [held] = await db
    .select()
    .from(slugReservation)
    .where(and(eq(slugReservation.slug, slug), gt(slugReservation.expiresAt, new Date())));
  return held && held.registrationId !== exceptRegistrationId ? 'taken' : 'available';
}

/** Lepaskan pendaftaran tertunda: tandai kedaluwarsa, batalkan invoice terbuka, hapus pesanan subdomain. */
async function releaseRegistration(tx: Tx, registrationId: string) {
  await tx
    .update(registration)
    .set({ status: 'expired' })
    .where(and(eq(registration.id, registrationId), eq(registration.status, 'pending_payment')));
  await tx
    .update(invoice)
    .set({ status: 'void' })
    .where(and(eq(invoice.registrationId, registrationId), eq(invoice.status, 'open')));
  await tx.delete(slugReservation).where(eq(slugReservation.registrationId, registrationId));
}

export interface CreateRegistrationResult {
  registrationId: string;
  invoiceId: string;
  amount: number;
  paymentUrl: string;
  expiresAt: Date;
}

export async function createRegistration(
  db: Db,
  provider: PaymentProvider,
  account: { id: string; name: string; email: string },
  input: RegistrationInput,
): Promise<CreateRegistrationResult> {
  const catalog = await loadCatalog(db);
  const settings = await loadBillingSettings(db);
  let quote: ReturnType<typeof quoteUnits>;
  try {
    quote = quoteUnits(catalog, input.units, input.period, { yearlyMonths: settings.yearlyMonths });
  } catch (error) {
    if (error instanceof QuoteError) throw new DomainError(400, 'invalid_selection', error.message);
    throw error;
  }

  const slugs = input.units.map((u) => u.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new DomainError(400, 'slug_duplicate', 'Subdomain tiap unit harus berbeda.');
  }

  const expiresAt = new Date(Date.now() + settings.reservationHours * 3_600_000);
  const orderId = `edu-${randomUUID()}`;

  const created = await db.transaction(async (tx) => {
    // Pendaftaran tertunda sebelumnya dari pengguna yang sama digantikan oleh yang baru.
    const previous = await tx
      .select({ id: registration.id })
      .from(registration)
      .where(and(eq(registration.userId, account.id), eq(registration.status, 'pending_payment')));
    for (const p of previous) await releaseRegistration(tx, p.id);
    await tx.delete(slugReservation).where(lt(slugReservation.expiresAt, new Date()));

    for (const slug of slugs) {
      if ((await slugStatus(tx, slug)) === 'taken') {
        throw new DomainError(409, 'slug_taken', `Subdomain "${slug}" sudah dipakai.`);
      }
    }

    const [reg] = await tx
      .insert(registration)
      .values({
        userId: account.id,
        foundationName: input.foundationName,
        period: input.period,
        units: input.units.map((u) => ({ ...u, modules: withRequirements(u.modules, catalog) })),
        expiresAt,
      })
      .returning();
    const reserved = await tx
      .insert(slugReservation)
      .values(slugs.map((slug) => ({ slug, registrationId: reg!.id, expiresAt })))
      .onConflictDoNothing()
      .returning({ slug: slugReservation.slug });
    if (reserved.length !== slugs.length) {
      throw new DomainError(409, 'slug_taken', 'Salah satu subdomain baru saja dipakai orang lain.');
    }

    const [inv] = await tx
      .insert(invoice)
      .values({
        registrationId: reg!.id,
        amount: quote.total,
        provider: provider.name,
        providerRef: orderId,
        lines: quote.lines,
        dueAt: expiresAt,
      })
      .returning();
    return { registrationId: reg!.id, invoiceId: inv!.id };
  });

  let paymentUrl: string;
  try {
    ({ paymentUrl } = await provider.createCharge({
      orderId,
      amount: quote.total,
      customer: { name: account.name, email: account.email },
      description: `Langganan Edusync ${input.foundationName}`,
      returnPath: `/register/status/${created.registrationId}`,
    }));
  } catch (error) {
    await db.transaction((tx) => releaseRegistration(tx, created.registrationId));
    console.error('[billing] gagal membuat transaksi pembayaran', error);
    throw new DomainError(
      502,
      'payment_unavailable',
      'Pembayaran sedang tidak tersedia. Coba lagi sebentar.',
    );
  }
  await db.update(invoice).set({ paymentUrl }).where(eq(invoice.id, created.invoiceId));

  return { ...created, amount: quote.total, paymentUrl, expiresAt };
}

export async function getRegistration(db: Db, registrationId: string, userId: string) {
  const [reg] = await db.select().from(registration).where(eq(registration.id, registrationId));
  // Pendaftaran milik orang lain dijawab sama dengan yang tidak ada.
  if (!reg || reg.userId !== userId) throw new DomainError(404, 'not_found', 'Pendaftaran tidak ditemukan.');
  const [inv] = await db.select().from(invoice).where(eq(invoice.registrationId, reg.id));
  const schools = reg.foundationId
    ? await db
        .select({ id: school.id, slug: school.slug, name: school.name })
        .from(school)
        .where(eq(school.foundationId, reg.foundationId))
    : [];
  return { reg, invoice: inv, schools };
}

async function uniqueFoundationSlug(tx: Tx, base: string) {
  const root = base || 'yayasan';
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? root : `${root.slice(0, 35)}-${randomUUID().slice(0, 4)}`;
    const [taken] = await tx
      .select({ id: foundation.id })
      .from(foundation)
      .where(eq(foundation.slug, candidate));
    if (!taken) return candidate;
  }
  return `${root.slice(0, 30)}-${randomUUID().slice(0, 8)}`;
}

/** Buat yayasan, unit, keanggotaan admin, langganan, dan hak modul. Dipanggil dalam satu transaksi. */
export async function activateRegistration(
  tx: Tx,
  reg: typeof registration.$inferSelect,
  inv: typeof invoice.$inferSelect,
) {
  const [owner] = await tx.select().from(user).where(eq(user.id, reg.userId));
  if (!owner) throw new Error('Pemilik pendaftaran tidak ditemukan');
  const now = new Date();
  const end = addMonths(now, reg.period === 'yearly' ? 12 : 1);

  const [f] = await tx
    .insert(foundation)
    .values({ name: reg.foundationName, slug: await uniqueFoundationSlug(tx, slugify(reg.foundationName)) })
    .returning();
  await tx.insert(foundationOwner).values({ foundationId: f!.id, userId: owner.id });
  const [sub] = await tx
    .insert(subscription)
    .values({
      foundationId: f!.id,
      status: 'active',
      period: reg.period,
      currentPeriodStart: now,
      currentPeriodEnd: end,
    })
    .returning();

  for (const unit of reg.units) {
    const [s] = await tx
      .insert(school)
      .values({ foundationId: f!.id, slug: unit.slug, name: unit.name, studentTier: unit.tier })
      .returning();
    await seedSchoolRoles(tx, s!.id);
    const [m] = await tx.insert(member).values({ userId: owner.id, schoolId: s!.id }).returning();
    await assignRoles(tx, m!.id, s!.id, ['school_admin']);
    if (unit.modules.length > 0) {
      await tx.insert(entitlement).values(
        unit.modules.map((moduleKey) => ({
          schoolId: s!.id,
          moduleKey,
          subscriptionId: sub!.id,
          validUntil: end,
        })),
      );
    }
    await tx.insert(auditLog).values({
      schoolId: s!.id,
      actorId: owner.id,
      action: 'school.activated',
      entityType: 'school',
      entityId: s!.id,
      details: { registrationId: reg.id, invoiceId: inv.id, modules: unit.modules },
    });
  }

  await tx
    .update(invoice)
    .set({ status: 'paid', paidAt: now, foundationId: f!.id })
    .where(eq(invoice.id, inv.id));
  await tx
    .update(registration)
    .set({ status: 'paid', foundationId: f!.id })
    .where(eq(registration.id, reg.id));
  await tx.delete(slugReservation).where(eq(slugReservation.registrationId, reg.id));

  const list = reg.units.map((u) => `- ${u.name}: ${u.slug}`).join('\n');
  await enqueue(tx, QUEUES.emailSend, {
    to: owner.email,
    subject: 'Selamat datang di Edusync',
    text: `Halo ${owner.name},\n\nPembayaran diterima dan ${reg.foundationName} sudah aktif di Edusync.\n\nUnit Anda:\n${list}\n\nMasuk dengan email ini untuk mulai mengatur sekolah Anda.`,
  });
}

/**
 * Proses kabar pembayaran yang sudah diverifikasi. Aman dipanggil berulang: (provider, event_id) unik
 * dan aktivasi hanya berjalan sekali per pendaftaran, dalam satu transaksi.
 */
export async function handlePaymentEvent(
  db: Db,
  providerName: string,
  event: PaymentEvent,
  raw: Record<string, unknown>,
): Promise<PaymentOutcome> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoice).where(eq(invoice.providerRef, event.orderId)).for('update');
    if (!inv) return 'unknown_invoice';

    const recorded = await tx
      .insert(payment)
      .values({
        invoiceId: inv.id,
        provider: providerName,
        eventId: event.eventId,
        status: event.status,
        amount: event.amount,
        raw,
      })
      .onConflictDoNothing()
      .returning({ id: payment.id });
    if (recorded.length === 0) return 'duplicate';

    if (event.status === 'pending') return 'recorded';

    if (event.status === 'failed') {
      if (inv.status === 'open') {
        await tx.update(invoice).set({ status: 'expired' }).where(eq(invoice.id, inv.id));
        if (inv.registrationId) await releaseRegistration(tx, inv.registrationId);
      }
      return 'failed';
    }

    // Dibayar. Jumlah harus sama persis dengan invoice; selisih ditahan untuk ditinjau staf.
    if (event.amount !== inv.amount) return 'amount_mismatch';
    if (inv.status === 'paid') return 'duplicate';
    if (!inv.registrationId) {
      if (!inv.foundationId) return 'recorded';
      await applyRenewal(tx, inv);
      return 'renewed';
    }

    const [reg] = await tx
      .select()
      .from(registration)
      .where(eq(registration.id, inv.registrationId))
      .for('update');
    if (!reg) return 'unknown_invoice';
    if (reg.status === 'paid') return 'duplicate';

    // Pembayaran yang datang setelah pesanan kedaluwarsa tetap diterima bila subdomainnya masih bebas.
    const slugs = reg.units.map((u) => u.slug);
    const taken = await tx.select({ id: school.id }).from(school).where(inArray(school.slug, slugs));
    const heldByOthers = await tx
      .select()
      .from(slugReservation)
      .where(and(inArray(slugReservation.slug, slugs), gt(slugReservation.expiresAt, new Date())));
    if (taken.length > 0 || heldByOthers.some((h) => h.registrationId !== reg.id)) return 'needs_review';

    await activateRegistration(tx, reg, inv);
    return 'activated';
  });
}
