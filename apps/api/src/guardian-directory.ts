import {
  academicYear,
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  gt,
  guardian,
  inArray,
  isNull,
  member,
  portalInvite,
  portalLink,
  student,
  studentGuardian,
  type Tx,
  user,
} from '@edusync/db';
import { nikView } from './person-fields';

/** Data induk wali: daftar berhalaman untuk halaman "Data wali" (pencarian, saringan, anak, status akun portal). */

export const CHILD_CAP = 10;

export type PortalStatus = 'active' | 'invited' | 'none';

export interface DirectoryQuery {
  q?: string | undefined;
  missingNik?: boolean | undefined;
  portal?: PortalStatus | 'has' | undefined;
  studentId?: string | undefined;
  page: number;
  limit: number;
}

/** `budi@contoh.id` menjadi `b***@contoh.id`; bentuk yang tak dikenali menjadi `***`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

interface SearchableGuardian {
  name: string;
  nik: string | null;
  phone: string | null;
  email: string | null;
  childNames: string[];
}

/**
 * Pencarian wali: nama, email, nama anak (tanpa membedakan huruf besar/kecil); angka (spasi, titik, strip, plus
 * diabaikan) dicocokkan ke NIK dan telepon, dan 0812… juga cocok dengan 62812… yang tersimpan.
 */
export function matchesGuardianQuery(g: SearchableGuardian, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (g.name.toLowerCase().includes(q)) return true;
  if (g.email?.toLowerCase().includes(q)) return true;
  if (g.childNames.some((n) => n.toLowerCase().includes(q))) return true;
  if (/^[+\d][\d\s.+-]*$/.test(q)) {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      if (g.nik?.includes(digits)) return true;
      if (g.phone?.includes(digits)) return true;
      if (digits.startsWith('0') && g.phone?.includes(`62${digits.slice(1)}`)) return true;
    }
  }
  return false;
}

/** Kelas tahun ajaran aktif untuk sekumpulan siswa. */
async function classesOf(tx: Tx, studentIds: string[]) {
  const map = new Map<string, string>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({ studentId: enrollment.studentId, className: classRoom.name })
    .from(enrollment)
    .innerJoin(
      academicYear,
      and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
    )
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .where(inArray(enrollment.studentId, studentIds));
  for (const r of rows) map.set(r.studentId, r.className);
  return map;
}

export async function guardianDirectory(tx: Tx, canManage: boolean, query: DirectoryQuery) {
  const guardians = await tx.select().from(guardian).orderBy(asc(guardian.name), asc(guardian.id));

  const links = await tx
    .select({
      guardianId: studentGuardian.guardianId,
      studentId: student.id,
      studentName: student.name,
      relation: studentGuardian.relation,
      isPrimary: studentGuardian.isPrimary,
    })
    .from(studentGuardian)
    .innerJoin(student, eq(student.id, studentGuardian.studentId))
    .where(isNull(student.deletedAt))
    .orderBy(asc(student.name), asc(student.id));
  const childrenOf = new Map<string, typeof links>();
  for (const l of links) {
    const list = childrenOf.get(l.guardianId);
    if (list) list.push(l);
    else childrenOf.set(l.guardianId, [l]);
  }

  const accounts = await tx
    .select({ guardianId: portalLink.guardianId, email: user.email })
    .from(portalLink)
    .innerJoin(member, eq(member.id, portalLink.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(portalLink.kind, 'guardian'));
  const accountOf = new Map(
    accounts.flatMap((a) => (a.guardianId ? [[a.guardianId, a.email] as const] : [])),
  );

  const invites = await tx
    .select({ guardianId: portalInvite.guardianId })
    .from(portalInvite)
    .where(
      and(
        eq(portalInvite.kind, 'guardian'),
        isNull(portalInvite.usedAt),
        gt(portalInvite.expiresAt, new Date()),
      ),
    );
  const invited = new Set(invites.flatMap((i) => (i.guardianId ? [i.guardianId] : [])));

  const statusOf = (id: string): PortalStatus =>
    accountOf.has(id) ? 'active' : invited.has(id) ? 'invited' : 'none';

  const totals = {
    total: guardians.length,
    withoutNik: guardians.filter((g) => !g.nik).length,
    withoutPortal: guardians.filter((g) => statusOf(g.id) === 'none').length,
    invited: guardians.filter((g) => statusOf(g.id) === 'invited').length,
  };

  const matched = guardians.filter((g) => {
    const status = statusOf(g.id);
    if (query.missingNik && g.nik) return false;
    if (query.portal === 'has' && status !== 'active') return false;
    if (query.portal === 'none' && status !== 'none') return false;
    if (query.portal === 'invited' && status !== 'invited') return false;
    const kids = childrenOf.get(g.id) ?? [];
    if (query.studentId && !kids.some((k) => k.studentId === query.studentId)) return false;
    return matchesGuardianQuery(
      {
        name: g.name,
        nik: g.nik,
        phone: g.phone,
        email: g.email,
        childNames: kids.map((k) => k.studentName),
      },
      query.q ?? '',
    );
  });

  const start = (query.page - 1) * query.limit;
  const pageRows = matched.slice(start, start + query.limit);
  const shown = pageRows.flatMap((g) =>
    (childrenOf.get(g.id) ?? []).slice(0, CHILD_CAP).map((k) => k.studentId),
  );
  const classes = await classesOf(tx, [...new Set(shown)]);

  const items = pageRows.map((g) => {
    const kids = childrenOf.get(g.id) ?? [];
    return {
      id: g.id,
      name: g.name,
      ...nikView(canManage, g.nik),
      phone: g.phone,
      email: g.email,
      occupation: g.occupation,
      address: g.address,
      childCount: kids.length,
      children: kids.slice(0, CHILD_CAP).map((k) => ({
        studentId: k.studentId,
        name: k.studentName,
        className: classes.get(k.studentId) ?? null,
        relation: k.relation,
        isPrimary: k.isPrimary,
      })),
      portalStatus: statusOf(g.id),
      portalEmailMasked: maskEmail(accountOf.get(g.id)),
    };
  });

  return { items, total: matched.length, page: query.page, limit: query.limit, totals };
}
