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
 * Pemilik NIK: pengguna yang terhubung ke siswa ber-NIK itu lewat tautan portal (akun siswa). NIK hanya ada di
 * data siswa; wali dan guru tidak punya kolom NIK. Hasilnya dipakai hanya bila tepat satu pengguna berbeda.
 */
async function usersByNik(db: Db, nik: string): Promise<string[]> {
  const students = await db
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.nik, nik), isNull(student.deletedAt)));
  if (students.length === 0) return [];
  const rows = await db
    .select({ userId: member.userId })
    .from(portalLink)
    .innerJoin(member, eq(member.id, portalLink.memberId))
    .where(
      and(
        eq(portalLink.kind, 'student'),
        inArray(
          portalLink.studentId,
          students.map((s) => s.id),
        ),
        eq(member.status, 'active'),
      ),
    );
  return [...new Set(rows.map((r) => r.userId))];
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
 * akun belum punya nomor. Guru tidak punya kolom nomor. Hasil sudah dinormalisasi (digit berawalan 62) atau null.
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
  for (const l of links) {
    const phone = normalizePhone(l.guardianPhone) ?? normalizePhone(l.studentPhone);
    if (phone) return phone;
  }
  return null;
}
