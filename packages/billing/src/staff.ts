import {
  and,
  auditLog,
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
  options: { q?: string | undefined; limit?: number | undefined } = {},
) {
  const limit = Math.min(options.limit ?? 50, 200);
  const q = options.q?.trim();
  const rows = await db
    .select()
    .from(foundation)
    .where(q ? or(ilike(foundation.name, `%${q}%`), ilike(foundation.slug, `%${q}%`)) : undefined)
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
          status: s.status,
          suspendedReason: s.suspendedReason,
        })),
    };
  });
}

export async function foundationDetail(db: Db, foundationId: string) {
  const [f] = await db.select().from(foundation).where(eq(foundation.id, foundationId));
  if (!f) throw new DomainError(404, 'not_found', 'Yayasan tidak ditemukan.');
  const [summary] = await listFoundations(db, { limit: 1, q: f.slug });
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
          ? { status: 'suspended', suspendedReason: 'staff' }
          : { status: 'active', suspendedReason: null },
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
