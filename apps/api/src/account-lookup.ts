import { classifyIdentifier, normalizePhone } from '@edusync/contracts';
import {
  and,
  type Db,
  eq,
  guardian,
  inArray,
  isNull,
  member,
  portalLink,
  sql,
  student,
  teacher,
  user,
} from '@edusync/db';

export interface ResolvedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const userCols = { id: user.id, name: user.name, email: user.email, phone: user.phone };

/**
 * Pemilik NIK: pengguna (akun) yang tertaut ke orang ber-NIK itu, dari tiga sumber: siswa (portal_link siswa),
 * wali (portal_link wali), dan guru (teacher.member_id). Orang yang sekaligus guru dan wali boleh punya NIK sama di
 * dua tabel; yang dihitung adalah pengguna yang berbeda. Hasilnya dipakai hanya bila tepat satu pengguna berbeda.
 */
async function usersByNik(db: Db, nik: string): Promise<string[]> {
  const students = await db
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.nik, nik), isNull(student.deletedAt)));
  const guardians = await db.select({ id: guardian.id }).from(guardian).where(eq(guardian.nik, nik));
  const userIds = new Set<string>();

  const portalUsers = async (kind: 'student' | 'guardian', ids: string[]) => {
    if (ids.length === 0) return;
    const rows = await db
      .select({ userId: member.userId })
      .from(portalLink)
      .innerJoin(member, eq(member.id, portalLink.memberId))
      .where(
        and(
          eq(portalLink.kind, kind),
          inArray(kind === 'student' ? portalLink.studentId : portalLink.guardianId, ids),
          eq(member.status, 'active'),
        ),
      );
    for (const r of rows) userIds.add(r.userId);
  };
  await portalUsers(
    'student',
    students.map((s) => s.id),
  );
  await portalUsers(
    'guardian',
    guardians.map((g) => g.id),
  );

  const teachers = await db
    .select({ userId: member.userId })
    .from(teacher)
    .innerJoin(member, eq(member.id, teacher.memberId))
    .where(and(eq(teacher.nik, nik), eq(member.status, 'active')));
  for (const t of teachers) userIds.add(t.userId);

  return [...userIds];
}

/**
 * Isian "email atau NIK" menjadi satu pengguna, atau null bila tidak ada, ambigu (NIK dipakai
 * beberapa akun), atau bentuknya tidak sah. Pemanggil tidak boleh membedakan penyebab null kepada pengguna.
 */
export async function resolveUser(db: Db, raw: string): Promise<ResolvedUser | null> {
  const id = classifyIdentifier(raw);
  if (id.kind === 'invalid') return null;
  if (id.kind === 'email') {
    const [row] = await db.select(userCols).from(user).where(sql`lower(${user.email}) = ${id.value}`);
    return row ?? null;
  }
  const ids = await usersByNik(db, id.value);
  if (ids.length !== 1) return null;
  const [row] = await db
    .select(userCols)
    .from(user)
    .where(eq(user.id, ids[0] as string));
  return row ?? null;
}

/** Email yang dipakai untuk masuk bagi isian ini, atau null. Hanya dipanggil di server (tidak pernah dikirim ke klien). */
export async function resolveLoginEmail(db: Db, raw: string): Promise<string | null> {
  return (await resolveUser(db, raw))?.email ?? null;
}

/**
 * Nomor WhatsApp pengguna: nomor di akunnya, atau nomor orang yang tertaut (wali/siswa lewat portal_link) bila
 * akun belum punya nomor (urutan: akun, guru, wali, siswa). Hasil sudah dinormalisasi (digit berawalan 62) atau null.
 */
export async function phoneFor(db: Db, found: Pick<ResolvedUser, 'id' | 'phone'>): Promise<string | null> {
  const own = normalizePhone(found.phone);
  if (own) return own;
  const links = await db
    .select({ guardianPhone: guardian.phone, studentPhone: student.phone })
    .from(portalLink)
    .innerJoin(member, eq(member.id, portalLink.memberId))
    .leftJoin(guardian, eq(guardian.id, portalLink.guardianId))
    .leftJoin(student, eq(student.id, portalLink.studentId))
    .where(and(eq(member.userId, found.id), eq(member.status, 'active')));
  const teachers = await db
    .select({ phone: teacher.phone })
    .from(teacher)
    .innerJoin(member, eq(member.id, teacher.memberId))
    .where(and(eq(member.userId, found.id), eq(member.status, 'active')));
  for (const t of teachers) {
    const phone = normalizePhone(t.phone);
    if (phone) return phone;
  }
  for (const l of links) {
    const phone = normalizePhone(l.guardianPhone) ?? normalizePhone(l.studentPhone);
    if (phone) return phone;
  }
  return null;
}
