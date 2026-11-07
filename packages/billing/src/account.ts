import {
  changeOrder,
  type Db,
  desc,
  entitlement,
  eq,
  foundation,
  foundationOwner,
  inArray,
  invoice,
  school,
  subscription,
} from '@edusync/db';

/** Yayasan yang dimiliki pengguna, lengkap dengan langganan, unit beserta modulnya, dan tagihan terbaru. */
export async function ownedFoundations(db: Db, userId: string) {
  const owned = await db
    .select({ id: foundation.id, name: foundation.name, slug: foundation.slug })
    .from(foundationOwner)
    .innerJoin(foundation, eq(foundation.id, foundationOwner.foundationId))
    .where(eq(foundationOwner.userId, userId))
    .orderBy(foundation.name);
  if (owned.length === 0) return [];

  const ids = owned.map((f) => f.id);
  const [subs, schools, invoices, orders] = await Promise.all([
    db.select().from(subscription).where(inArray(subscription.foundationId, ids)),
    db.select().from(school).where(inArray(school.foundationId, ids)),
    db.select().from(invoice).where(inArray(invoice.foundationId, ids)).orderBy(desc(invoice.createdAt)),
    db.select().from(changeOrder).where(inArray(changeOrder.foundationId, ids)),
  ]);
  const ents =
    schools.length > 0
      ? await db
          .select({ schoolId: entitlement.schoolId, moduleKey: entitlement.moduleKey })
          .from(entitlement)
          .where(
            inArray(
              entitlement.schoolId,
              schools.map((s) => s.id),
            ),
          )
      : [];

  return owned.map((f) => {
    const sub = subs.find((s) => s.foundationId === f.id);
    return {
      ...f,
      subscription: sub
        ? {
            status: sub.status,
            period: sub.period,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      schools: schools
        .filter((s) => s.foundationId === f.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          status: s.status,
          suspendedReason: s.suspendedReason,
          suspendedNote: s.suspendedNote,
          suspendedAt: s.suspendedAt,
          tier: s.studentTier,
          scheduled: (() => {
            const o = orders.find((x) => x.schoolId === s.id && x.status === 'scheduled');
            return o ? { removeModules: o.payload.removeModules ?? [], tier: o.payload.tier ?? null } : null;
          })(),
          modules: ents
            .filter((e) => e.schoolId === s.id)
            .map((e) => e.moduleKey)
            .sort(),
        })),
      invoices: invoices
        .filter((i) => i.foundationId === f.id)
        .slice(0, 20)
        .map((i) => ({
          id: i.id,
          kind: (orders.find((o) => o.invoiceId === i.id)?.kind ??
            (i.registrationId ? 'registration' : 'renewal')) as
            | 'registration'
            | 'renewal'
            | 'upgrade'
            | 'new_unit',
          amount: i.amount,
          currency: i.currency,
          status: i.status,
          paymentUrl: i.status === 'open' ? i.paymentUrl : null,
          dueAt: i.dueAt,
          paidAt: i.paidAt,
          createdAt: i.createdAt,
        })),
    };
  });
}
