import { randomUUID } from 'node:crypto';
import {
  type CatalogItem,
  QuoteError,
  type QuoteLine,
  quoteUnit,
  slugSchema,
  withRequirements,
} from '@edusync/contracts';
import {
  and,
  assignRoles,
  auditLog,
  changeOrder,
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
  member,
  registration,
  school,
  seedSchoolRoles,
  slugReservation,
  sql,
  subscription,
  type Tx,
  user,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { DomainError } from './errors';
import { createRenewalInvoice } from './lifecycle';
import type { PaymentProvider } from './provider';
import { assertEducationProfiles, assertNpsnsFree, requireNpsn, slugStatus } from './service';

/** Pecahan sisa periode berjalan (0..1) untuk hitung prorata. */
export function remainingFraction(start: Date, end: Date, now = new Date()) {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (end.getTime() - now.getTime()) / total));
}

async function ownedFoundationSub(db: Db | Tx, userId: string, foundationId: string) {
  const [owner] = await db
    .select({ userId: foundationOwner.userId })
    .from(foundationOwner)
    .where(and(eq(foundationOwner.foundationId, foundationId), eq(foundationOwner.userId, userId)));
  // Yayasan milik orang lain dijawab sama dengan yang tidak ada.
  if (!owner) throw new DomainError(404, 'not_found', 'Yayasan tidak ditemukan.');
  const [sub] = await db.select().from(subscription).where(eq(subscription.foundationId, foundationId));
  if (!sub) throw new DomainError(404, 'not_found', 'Langganan tidak ditemukan.');
  if (sub.status !== 'active') {
    throw new DomainError(
      409,
      'subscription_inactive',
      'Langganan belum aktif. Bayar tagihan perpanjangan dulu.',
    );
  }
  return sub;
}

const priceOf = (catalog: readonly CatalogItem[], kind: CatalogItem['kind'], key: string) =>
  catalog.find((c) => c.kind === kind && c.key === key)?.priceMonthly ?? 0;
const nameOf = (catalog: readonly CatalogItem[], kind: CatalogItem['kind'], key: string) =>
  catalog.find((c) => c.kind === kind && c.key === key)?.name ?? key;

function validate(catalog: readonly CatalogItem[], modules: string[], tier: string) {
  try {
    quoteUnit(catalog, { modules, tier }, 'monthly');
  } catch (error) {
    if (error instanceof QuoteError) throw new DomainError(400, 'invalid_selection', error.message);
    throw error;
  }
}

export interface ChangePreview {
  schoolId: string;
  foundationId: string;
  addModules: string[];
  /** Berlaku di periode berikutnya. */
  removeModules: string[];
  tier: string;
  currentTier: string;
  /** Kenaikan tingkat berlaku sekarang; penurunan dijadwalkan. */
  tierNow: boolean;
  tierNext: boolean;
  lines: QuoteLine[];
  total: number;
  fraction: number;
  periodEnd: Date;
}

/** Hitung perubahan paket satu unit tanpa menyimpan apa pun. Harga selalu dari katalog server. */
export async function previewChange(
  db: Db | Tx,
  userId: string,
  schoolId: string,
  input: { modules: string[]; tier: string },
  now = new Date(),
): Promise<ChangePreview> {
  const [sch] = await db.select().from(school).where(eq(school.id, schoolId));
  if (!sch) throw new DomainError(404, 'not_found', 'Unit tidak ditemukan.');
  const sub = await ownedFoundationSub(db, userId, sch.foundationId);

  const active = await loadCatalog(db);
  const all = await loadCatalog(db, { includeInactive: true });
  const settings = await loadBillingSettings(db);
  const target = [...new Set(withRequirements(input.modules, active))];
  validate(active, target, input.tier);

  const current = (
    await db
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(and(eq(entitlement.schoolId, schoolId), gt(entitlement.validUntil, now)))
  ).map((e) => e.key);
  const addModules = target.filter((m) => !current.includes(m)).sort();
  const removeModules = current.filter((m) => !target.includes(m)).sort();

  const months = sub.period === 'yearly' ? settings.yearlyMonths : 1;
  const fraction = remainingFraction(sub.currentPeriodStart, sub.currentPeriodEnd, now);
  const delta = priceOf(all, 'tier', input.tier) - priceOf(all, 'tier', sch.studentTier);
  const tierDiffers = input.tier !== sch.studentTier;
  const tierNow = tierDiffers && delta >= 0;
  const tierNext = tierDiffers && delta < 0;

  if (addModules.length === 0 && removeModules.length === 0 && !tierDiffers) {
    throw new DomainError(400, 'no_change', 'Tidak ada perubahan paket.');
  }

  const prorate = (monthly: number) => Math.round(monthly * months * fraction);
  const lines: QuoteLine[] = addModules.map((m) => ({
    key: m,
    name: nameOf(all, 'module', m),
    amount: prorate(priceOf(all, 'module', m)),
  }));
  if (tierNow && delta > 0) {
    lines.push({ key: input.tier, name: nameOf(all, 'tier', input.tier), amount: prorate(delta) });
  }
  return {
    schoolId,
    foundationId: sch.foundationId,
    addModules,
    removeModules,
    tier: input.tier,
    currentTier: sch.studentTier,
    tierNow,
    tierNext,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    fraction,
    periodEnd: sub.currentPeriodEnd,
  };
}

/** Terapkan bagian "sekarang" (modul tambahan dan tingkat naik) ke unit. Idempoten. */
async function applyNow(
  tx: Tx,
  sub: typeof subscription.$inferSelect,
  schoolId: string,
  addModules: string[],
  tier: string | undefined,
) {
  for (const moduleKey of addModules) {
    await tx
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub.id, validUntil: sub.currentPeriodEnd })
      .onConflictDoUpdate({
        target: [entitlement.schoolId, entitlement.moduleKey],
        set: { validUntil: sub.currentPeriodEnd, subscriptionId: sub.id },
      });
  }
  if (tier) await tx.update(school).set({ studentTier: tier }).where(eq(school.id, schoolId));
}

export interface ChangeResult {
  /** Ada tagihan untuk dibayar; null bila tidak ada biaya sekarang. */
  invoiceId: string | null;
  amount: number;
  paymentUrl: string | null;
  /** Perubahan yang sudah berlaku tanpa pembayaran (gratis). */
  appliedNow: boolean;
  /** Ada penurunan yang dijadwalkan ke periode berikutnya. */
  scheduled: boolean;
}

export async function createChange(
  db: Db,
  provider: PaymentProvider,
  account: { id: string; name: string; email: string },
  schoolId: string,
  input: { modules: string[]; tier: string },
): Promise<ChangeResult> {
  const settings = await loadBillingSettings(db);
  const orderId = `upg-${randomUUID()}`;
  const dueAt = new Date(Date.now() + settings.reservationHours * 3_600_000);

  const created = await db.transaction(async (tx) => {
    const preview = await previewChange(tx, account.id, schoolId, input);
    const [sub] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.foundationId, preview.foundationId))
      .for('update');
    // Permintaan baru menggantikan jadwal penurunan dan upgrade tertunda sebelumnya untuk unit ini.
    await tx
      .update(changeOrder)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(changeOrder.schoolId, schoolId),
          inArray(changeOrder.status, ['scheduled', 'pending_payment']),
          inArray(changeOrder.kind, ['upgrade', 'downgrade']),
        ),
      );
    await tx
      .update(invoice)
      .set({ status: 'void' })
      .where(
        and(
          eq(invoice.status, 'open'),
          sql`${invoice.id} in (select invoice_id from change_order where school_id = ${schoolId} and kind = 'upgrade' and status = 'canceled')`,
        ),
      );

    const nextTier = preview.tierNext ? preview.tier : undefined;
    const scheduled = preview.removeModules.length > 0 || nextTier !== undefined;
    if (scheduled) {
      await tx.insert(changeOrder).values({
        foundationId: preview.foundationId,
        userId: account.id,
        kind: 'downgrade',
        schoolId,
        payload: { removeModules: preview.removeModules, ...(nextTier ? { tier: nextTier } : {}) },
        status: 'scheduled',
      });
      // Tagihan perpanjangan yang sudah terbit memuat paket lama; batalkan agar diterbitkan ulang.
      await tx
        .update(invoice)
        .set({ status: 'void' })
        .where(
          and(
            eq(invoice.foundationId, preview.foundationId),
            eq(invoice.status, 'open'),
            sql`${invoice.registrationId} is null`,
            sql`not exists (select 1 from change_order c where c.invoice_id = ${invoice.id})`,
          ),
        );
    }

    const nowTier = preview.tierNow ? preview.tier : undefined;
    if (preview.addModules.length === 0 && !nowTier) {
      return { scheduled, invoiceId: null, amount: 0, appliedNow: false };
    }
    if (preview.total === 0) {
      await applyNow(tx, sub!, schoolId, preview.addModules, nowTier);
      return { scheduled, invoiceId: null, amount: 0, appliedNow: true };
    }
    const [inv] = await tx
      .insert(invoice)
      .values({
        foundationId: preview.foundationId,
        amount: preview.total,
        provider: provider.name,
        providerRef: orderId,
        lines: preview.lines,
        dueAt,
      })
      .returning();
    await tx.insert(changeOrder).values({
      foundationId: preview.foundationId,
      userId: account.id,
      kind: 'upgrade',
      schoolId,
      payload: { addModules: preview.addModules, ...(nowTier ? { tier: nowTier } : {}) },
      status: 'pending_payment',
      invoiceId: inv!.id,
    });
    return { scheduled, invoiceId: inv!.id, amount: preview.total, appliedNow: false };
  });

  if (!created.invoiceId) return { ...created, paymentUrl: null };
  const paymentUrl = await chargeOrVoid(db, provider, created.invoiceId, {
    orderId,
    amount: created.amount,
    customer: { name: account.name, email: account.email },
    description: 'Peningkatan paket Edusync',
    returnPath: '/account/billing',
  });
  return { ...created, paymentUrl };
}

async function chargeOrVoid(
  db: Db,
  provider: PaymentProvider,
  invoiceId: string,
  request: Parameters<PaymentProvider['createCharge']>[0],
) {
  try {
    const { paymentUrl } = await provider.createCharge(request);
    await db.update(invoice).set({ paymentUrl }).where(eq(invoice.id, invoiceId));
    return paymentUrl;
  } catch (error) {
    console.error('[billing] gagal membuat transaksi pembayaran', error);
    await db.transaction(async (tx) => {
      await tx.update(invoice).set({ status: 'void' }).where(eq(invoice.id, invoiceId));
      await tx
        .update(changeOrder)
        .set({ status: 'canceled' })
        .where(and(eq(changeOrder.invoiceId, invoiceId), eq(changeOrder.status, 'pending_payment')));
      await tx
        .update(registration)
        .set({ status: 'expired' })
        .where(
          and(
            eq(registration.status, 'pending_payment'),
            sql`${registration.id} in (select registration_id from invoice where id = ${invoiceId})`,
          ),
        );
      await tx
        .delete(slugReservation)
        .where(
          sql`${slugReservation.registrationId} in (select registration_id from invoice where id = ${invoiceId})`,
        );
    });
    throw new DomainError(
      502,
      'payment_unavailable',
      'Pembayaran sedang tidak tersedia. Coba lagi sebentar.',
    );
  }
}

/** Pembayaran upgrade terkonfirmasi: perbarui hak modul dan tingkat unit. Aman diulang. */
export async function applyUpgradeOrder(
  tx: Tx,
  order: typeof changeOrder.$inferSelect,
  inv: typeof invoice.$inferSelect,
): Promise<'upgraded' | 'duplicate' | 'needs_review'> {
  if (order.status === 'applied') return 'duplicate';
  if (order.status !== 'pending_payment' || !order.schoolId) return 'needs_review';
  const [sub] = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.foundationId, order.foundationId))
    .for('update');
  if (!sub) return 'needs_review';

  await applyNow(tx, sub, order.schoolId, order.payload.addModules ?? [], order.payload.tier);
  await tx.update(invoice).set({ status: 'paid', paidAt: new Date() }).where(eq(invoice.id, inv.id));
  await tx.update(changeOrder).set({ status: 'applied' }).where(eq(changeOrder.id, order.id));
  await tx.insert(auditLog).values({
    schoolId: order.schoolId,
    actorId: order.userId,
    action: 'subscription.upgraded',
    entityType: 'school',
    entityId: order.schoolId,
    details: { invoiceId: inv.id, ...order.payload },
  });
  return 'upgraded';
}

/* ---------- Unit baru ---------- */

export interface NewUnitInput {
  name: string;
  slug: string;
  /** NPSN 8 angka (wajib; spasi/titik/strip dibuang di createNewUnit). */
  npsn: string;
  /** Jenjang unit (`ref_education_profile.key`, wajib). */
  educationProfile: string;
  modules: string[];
  tier: string;
}

export async function previewNewUnit(
  db: Db | Tx,
  userId: string,
  foundationId: string,
  input: NewUnitInput,
  now = new Date(),
) {
  const sub = await ownedFoundationSub(db, userId, foundationId);
  const catalog = await loadCatalog(db);
  const settings = await loadBillingSettings(db);
  if (!slugSchema.safeParse(input.slug).success) {
    throw new DomainError(400, 'invalid_selection', 'Subdomain tidak valid.');
  }
  let quote: ReturnType<typeof quoteUnit>;
  try {
    quote = quoteUnit(catalog, input, sub.period, undefined, { yearlyMonths: settings.yearlyMonths });
  } catch (error) {
    if (error instanceof QuoteError) throw new DomainError(400, 'invalid_selection', error.message);
    throw error;
  }
  const fraction = remainingFraction(sub.currentPeriodStart, sub.currentPeriodEnd, now);
  const lines = quote.lines.map((l) => ({ ...l, amount: Math.round(l.amount * fraction) }));
  return {
    sub,
    fraction,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    modules: withRequirements(input.modules, catalog),
  };
}

export async function createNewUnit(
  db: Db,
  provider: PaymentProvider,
  account: { id: string; name: string; email: string },
  foundationId: string,
  rawInput: NewUnitInput,
) {
  const input = { ...rawInput, npsn: requireNpsn(rawInput.npsn) };
  const settings = await loadBillingSettings(db);
  const expiresAt = new Date(Date.now() + settings.reservationHours * 3_600_000);
  const orderId = `unit-${randomUUID()}`;

  const created = await db.transaction(async (tx) => {
    const preview = await previewNewUnit(tx, account.id, foundationId, input);
    if (preview.total <= 0) throw new DomainError(400, 'invalid_selection', 'Biaya unit baru tidak valid.');
    const [f] = await tx.select().from(foundation).where(eq(foundation.id, foundationId));

    // Pesanan unit baru tertunda sebelumnya dari yayasan ini digantikan.
    const previous = await tx
      .select({ id: registration.id })
      .from(registration)
      .where(
        and(
          eq(registration.userId, account.id),
          eq(registration.foundationId, foundationId),
          eq(registration.status, 'pending_payment'),
        ),
      );
    for (const p of previous) {
      await tx.update(registration).set({ status: 'expired' }).where(eq(registration.id, p.id));
      await tx
        .update(invoice)
        .set({ status: 'void' })
        .where(and(eq(invoice.registrationId, p.id), eq(invoice.status, 'open')));
      await tx
        .update(changeOrder)
        .set({ status: 'canceled' })
        .where(
          and(
            eq(changeOrder.status, 'pending_payment'),
            sql`${changeOrder.invoiceId} in (select id from invoice where registration_id = ${p.id})`,
          ),
        );
      await tx.delete(slugReservation).where(eq(slugReservation.registrationId, p.id));
    }
    await tx.delete(slugReservation).where(sql`${slugReservation.expiresAt} < now()`);

    if ((await slugStatus(tx, input.slug)) === 'taken') {
      throw new DomainError(409, 'slug_taken', `Subdomain "${input.slug}" sudah dipakai.`);
    }
    await assertNpsnsFree(tx, [input.npsn]);
    await assertEducationProfiles(tx, [input.educationProfile]);
    const [reg] = await tx
      .insert(registration)
      .values({
        userId: account.id,
        foundationName: f!.name,
        period: preview.sub.period,
        units: [
          {
            name: input.name,
            slug: input.slug,
            npsn: input.npsn,
            educationProfile: input.educationProfile,
            modules: preview.modules,
            tier: input.tier,
          },
        ],
        expiresAt,
        foundationId,
      })
      .returning();
    const reserved = await tx
      .insert(slugReservation)
      .values({ slug: input.slug, registrationId: reg!.id, expiresAt })
      .onConflictDoNothing()
      .returning({ slug: slugReservation.slug });
    if (reserved.length !== 1) {
      throw new DomainError(409, 'slug_taken', 'Subdomain baru saja dipakai orang lain.');
    }
    const [inv] = await tx
      .insert(invoice)
      .values({
        registrationId: reg!.id,
        foundationId,
        amount: preview.total,
        provider: provider.name,
        providerRef: orderId,
        lines: preview.lines.map((l) => ({ ...l, key: l.key })),
        dueAt: expiresAt,
      })
      .returning();
    await tx.insert(changeOrder).values({
      foundationId,
      userId: account.id,
      kind: 'new_unit',
      payload: {},
      status: 'pending_payment',
      invoiceId: inv!.id,
    });
    return { registrationId: reg!.id, invoiceId: inv!.id, amount: preview.total };
  });

  const paymentUrl = await chargeOrVoid(db, provider, created.invoiceId, {
    orderId,
    amount: created.amount,
    customer: { name: account.name, email: account.email },
    description: `Unit baru ${input.name}`,
    returnPath: '/account/units',
  });
  return { ...created, paymentUrl, expiresAt };
}

/** Pembayaran unit baru terkonfirmasi: buat unit lengkap dan sambungkan ke langganan yayasan. */
export async function activateNewUnit(
  tx: Tx,
  reg: typeof registration.$inferSelect,
  inv: typeof invoice.$inferSelect,
) {
  const foundationId = reg.foundationId as string;
  const [owner] = await tx.select().from(user).where(eq(user.id, reg.userId));
  const [sub] = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.foundationId, foundationId))
    .for('update');
  if (!owner || !sub) throw new Error('Pemilik atau langganan yayasan tidak ditemukan');

  for (const unit of reg.units) {
    const [s] = await tx
      .insert(school)
      .values({
        foundationId,
        slug: unit.slug,
        name: unit.name,
        studentTier: unit.tier,
        npsn: unit.npsn ?? null,
        educationProfile: unit.educationProfile ?? null,
      })
      .returning();
    await seedSchoolRoles(tx, s!.id);
    const [m] = await tx.insert(member).values({ userId: owner.id, schoolId: s!.id }).returning();
    await assignRoles(tx, m!.id, s!.id, ['school_admin']);
    if (unit.modules.length > 0) {
      await tx.insert(entitlement).values(
        unit.modules.map((moduleKey) => ({
          schoolId: s!.id,
          moduleKey,
          subscriptionId: sub.id,
          validUntil: sub.currentPeriodEnd,
        })),
      );
    }
    await tx.insert(auditLog).values({
      schoolId: s!.id,
      actorId: owner.id,
      action: 'school.activated',
      entityType: 'school',
      entityId: s!.id,
      details: { registrationId: reg.id, invoiceId: inv.id, modules: unit.modules, addedToFoundation: true },
    });
  }
  await tx.update(invoice).set({ status: 'paid', paidAt: new Date() }).where(eq(invoice.id, inv.id));
  await tx.update(registration).set({ status: 'paid' }).where(eq(registration.id, reg.id));
  await tx.update(changeOrder).set({ status: 'applied' }).where(eq(changeOrder.invoiceId, inv.id));
  await tx.delete(slugReservation).where(eq(slugReservation.registrationId, reg.id));
  await enqueue(tx, QUEUES.emailSend, {
    to: owner.email,
    subject: 'Unit sekolah baru aktif di Edusync',
    text: `Halo ${owner.name},\n\nPembayaran diterima dan unit berikut sudah aktif:\n${reg.units.map((u) => `- ${u.name}: ${u.slug}`).join('\n')}`,
  });
}

/** Daftar pemilik yayasan (hanya untuk sesama pemilik). */
export async function listOwners(db: Db, userId: string, foundationId: string) {
  const [self] = await db
    .select({ userId: foundationOwner.userId })
    .from(foundationOwner)
    .where(and(eq(foundationOwner.foundationId, foundationId), eq(foundationOwner.userId, userId)));
  if (!self) throw new DomainError(404, 'not_found', 'Yayasan tidak ditemukan.');
  return db
    .select({ userId: user.id, name: user.name, email: user.email, since: foundationOwner.createdAt })
    .from(foundationOwner)
    .innerJoin(user, eq(user.id, foundationOwner.userId))
    .where(eq(foundationOwner.foundationId, foundationId))
    .orderBy(foundationOwner.createdAt);
}

/** Perpanjang lebih awal: pakai invoice perpanjangan yang sudah terbuka, atau buat baru. */
export async function requestRenewal(
  db: Db,
  provider: PaymentProvider,
  account: { id: string; name: string; email: string },
  foundationId: string,
) {
  const [owner] = await db
    .select({ userId: foundationOwner.userId })
    .from(foundationOwner)
    .where(and(eq(foundationOwner.foundationId, foundationId), eq(foundationOwner.userId, account.id)));
  if (!owner) throw new DomainError(404, 'not_found', 'Yayasan tidak ditemukan.');
  const [sub] = await db.select().from(subscription).where(eq(subscription.foundationId, foundationId));
  if (!sub || sub.status === 'canceled' || sub.status === 'pending_payment') {
    throw new DomainError(409, 'subscription_inactive', 'Langganan tidak dapat diperpanjang.');
  }
  const result = await createRenewalInvoice(db, provider, sub.id, { payer: account });
  if (!result?.invoice.paymentUrl) {
    throw new DomainError(
      502,
      'payment_unavailable',
      'Pembayaran sedang tidak tersedia. Coba lagi sebentar.',
    );
  }
  return result.invoice;
}
