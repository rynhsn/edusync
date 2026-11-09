import {
  and,
  auditLog,
  count,
  type Db,
  desc,
  entitlement,
  eq,
  foundation,
  ilike,
  inArray,
  invoice,
  or,
  payment,
  platformStaff,
  registration,
  school,
  subscription,
  user,
} from '@edusync/db';
import { DomainError } from './errors';
import { activateRegistration } from './service';

export type StaffRole = 'admin' | 'read_only';

export async function staffRoleOf(db: Db, userId: string): Promise<StaffRole | null> {
  const [row] = await db
    .select({ role: platformStaff.role })
    .from(platformStaff)
    .where(eq(platformStaff.userId, userId));
  return row?.role ?? null;
}

export async function listFoundations(
  db: Db,
  options: { q?: string | undefined; limit?: number | undefined; id?: string | undefined } = {},
) {
  const limit = Math.min(options.limit ?? 50, 200);
  const q = options.q?.trim();
  const rows = await db
    .select()
    .from(foundation)
    .where(
      options.id
        ? eq(foundation.id, options.id)
        : q
          ? or(ilike(foundation.name, `%${q}%`), ilike(foundation.slug, `%${q}%`))
          : undefined,
    )
    .orderBy(desc(foundation.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((f) => f.id);
  const schools = await db.select().from(school).where(inArray(school.foundationId, ids));
  const subs = await db.select().from(subscription).where(inArray(subscription.foundationId, ids));
  const unpaid = await db
    .select({ foundationId: invoice.foundationId })
    .from(invoice)
    .where(and(inArray(invoice.foundationId, ids), eq(invoice.status, 'open')));
  // Staf pelaku penangguhan terakhir per sekolah; hanya untuk konsol platform, tidak pernah dikirim ke panel sekolah.
  const suspendedIds = schools.filter((s) => s.suspendedReason === 'staff').map((s) => s.id);
  const actors = new Map<string, string>();
  if (suspendedIds.length > 0) {
    const logs = await db
      .select({ schoolId: auditLog.schoolId, name: user.name })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.actorId))
      .where(and(inArray(auditLog.schoolId, suspendedIds), eq(auditLog.action, 'school.suspended')))
      .orderBy(desc(auditLog.createdAt));
    for (const l of logs) if (l.schoolId && !actors.has(l.schoolId)) actors.set(l.schoolId, l.name);
  }
  return rows.map((f) => {
    const sub = subs.find((s) => s.foundationId === f.id);
    return {
      id: f.id,
      name: f.name,
      slug: f.slug,
      createdAt: f.createdAt,
      subscription: sub
        ? { status: sub.status, period: sub.period, currentPeriodEnd: sub.currentPeriodEnd }
        : null,
      openInvoices: unpaid.filter((u) => u.foundationId === f.id).length,
      schools: schools
        .filter((s) => s.foundationId === f.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          npsn: s.npsn,
          status: s.status,
          suspendedReason: s.suspendedReason,
          suspendedNote: s.suspendedNote,
          suspendedAt: s.suspendedAt,
          suspendedBy: actors.get(s.id) ?? null,
        })),
    };
  });
}

export async function foundationDetail(db: Db, foundationId: string) {
  const [f] = await db.select().from(foundation).where(eq(foundation.id, foundationId));
  if (!f) throw new DomainError(404, 'not_found', 'Yayasan tidak ditemukan.');
  const [summary] = await listFoundations(db, { limit: 1, id: foundationId });
  const invoices = await db
    .select()
    .from(invoice)
    .where(eq(invoice.foundationId, foundationId))
    .orderBy(desc(invoice.createdAt))
    .limit(20);
  const payments =
    invoices.length > 0
      ? await db
          .select()
          .from(payment)
          .where(
            inArray(
              payment.invoiceId,
              invoices.map((i) => i.id),
            ),
          )
      : [];
  const schoolIds = summary?.schools.map((s) => s.id) ?? [];
  const modules =
    schoolIds.length > 0
      ? await db.select().from(entitlement).where(inArray(entitlement.schoolId, schoolIds))
      : [];
  return { summary, invoices, payments, modules };
}

/** Tangguhkan atau aktifkan unit oleh staf. Penangguhan staf tidak dilepas oleh pembayaran. */
export async function setSchoolSuspended(
  db: Db,
  staffUserId: string,
  schoolId: string,
  suspended: boolean,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(school).where(eq(school.id, schoolId)).for('update');
    if (!s) throw new DomainError(404, 'not_found', 'Sekolah tidak ditemukan.');
    await tx
      .update(school)
      .set(
        suspended
          ? { status: 'suspended', suspendedReason: 'staff', suspendedNote: reason, suspendedAt: new Date() }
          : { status: 'active', suspendedReason: null, suspendedNote: null, suspendedAt: null },
      )
      .where(eq(school.id, schoolId));
    await tx.insert(auditLog).values({
      schoolId,
      actorId: staffUserId,
      action: suspended ? 'school.suspended' : 'school.reactivated',
      entityType: 'school',
      entityId: schoolId,
      details: { reason, previousStatus: s.status, previousReason: s.suspendedReason },
    });
  });
}

/**
 * Aktifkan pendaftaran tanpa pembayaran (mis. sekolah pilot). Dicatat sebagai pembayaran penyedia
 * "complimentary" senilai 0 supaya tetap terlihat di riwayat dan audit.
 */
export async function activateComplimentary(
  db: Db,
  staffUserId: string,
  registrationId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const [reg] = await tx
      .select()
      .from(registration)
      .where(eq(registration.id, registrationId))
      .for('update');
    if (!reg) throw new DomainError(404, 'not_found', 'Pendaftaran tidak ditemukan.');
    if (reg.status === 'paid') throw new DomainError(409, 'conflict', 'Pendaftaran ini sudah aktif.');
    const [inv] = await tx.select().from(invoice).where(eq(invoice.registrationId, registrationId));
    if (!inv) throw new DomainError(404, 'not_found', 'Invoice tidak ditemukan.');
    await tx.insert(payment).values({
      invoiceId: inv.id,
      provider: 'complimentary',
      eventId: `comp-${registrationId}`,
      status: 'complimentary',
      amount: 0,
      raw: { staffUserId, reason },
    });
    await activateRegistration(tx, reg, inv);
    await tx.insert(auditLog).values({
      actorId: staffUserId,
      action: 'registration.complimentary',
      entityType: 'registration',
      entityId: registrationId,
      details: { reason, foundationName: reg.foundationName },
    });
  });
}

export async function listAudit(db: Db, options: { limit?: number | undefined } = {}) {
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(options.limit ?? 100, 500));
}

export async function listPendingRegistrations(db: Db, limit = 50) {
  return db
    .select()
    .from(registration)
    .where(eq(registration.status, 'pending_payment'))
    .orderBy(desc(registration.createdAt))
    .limit(limit);
}

/**
 * Ringkasan konsol: cacah yayasan, unit, tagihan terbuka, pendaftaran tertunda, dan MRR perkiraan.
 * MRR = tagihan terbayar terakhir tiap langganan aktif (setara bulanan; tahunan dibagi 12), tanpa yang
 * hanya dibayar komplimen. shortcut: tagihan terakhir sebagai proksi harga, belum memodelkan diskon/prorata.
 */
export async function platformOverview(db: Db) {
  const [foundations] = await db.select({ n: count() }).from(foundation);
  const schools = await db.select({ status: school.status, n: count() }).from(school).groupBy(school.status);
  const subs = await db
    .select({ status: subscription.status, n: count() })
    .from(subscription)
    .groupBy(subscription.status);
  const [open] = await db.select({ n: count() }).from(invoice).where(eq(invoice.status, 'open'));
  const [pending] = await db
    .select({ n: count() })
    .from(registration)
    .where(eq(registration.status, 'pending_payment'));

  const active = await db
    .select({ foundationId: subscription.foundationId, period: subscription.period })
    .from(subscription)
    .where(eq(subscription.status, 'active'));
  let mrr = 0;
  if (active.length > 0) {
    const paid = await db
      .select()
      .from(invoice)
      .where(
        and(
          inArray(
            invoice.foundationId,
            active.map((a) => a.foundationId),
          ),
          eq(invoice.status, 'paid'),
        ),
      )
      .orderBy(desc(invoice.paidAt));
    const pays =
      paid.length > 0
        ? await db
            .select()
            .from(payment)
            .where(
              inArray(
                payment.invoiceId,
                paid.map((i) => i.id),
              ),
            )
        : [];
    for (const a of active) {
      const last = paid.find((i) => i.foundationId === a.foundationId);
      if (!last || !pays.some((p) => p.invoiceId === last.id && p.amount > 0)) continue;
      mrr += Math.round(last.amount / (a.period === 'yearly' ? 12 : 1));
    }
  }
  const n = (rows: { status: string; n: number }[], s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    foundations: foundations?.n ?? 0,
    activeUnits: n(schools, 'active'),
    suspendedUnits: n(schools, 'suspended'),
    activeSubscriptions: n(subs, 'active'),
    pastDueSubscriptions: n(subs, 'past_due'),
    openInvoices: open?.n ?? 0,
    pendingRegistrations: pending?.n ?? 0,
    mrr,
  };
}
