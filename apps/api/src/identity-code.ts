import { randomInt } from 'node:crypto';
import {
  formatIdentityPayload,
  IDENTITY_CODE_ALPHABET,
  IDENTITY_CODE_LENGTH,
  parseIdentityPayload,
} from '@edusync/contracts';
import { and, eq, inArray, isNull, student, studentIdentityCode, type Tx } from '@edusync/db';
import { classesOf } from './gate-manual';
import { HttpError } from './http-error';

/**
 * Kode identitas siswa (QR di kartu, `ES1.<kode>`). Kode hanya MENGIDENTIFIKASI siswa; menu tempat kode dipindai yang
 * menentukan tindakannya (absensi, kelak peminjaman), dan setiap pemindai tetap butuh login + izin fiturnya sendiri.
 * Modul ini tidak bergantung pada modul langganan mana pun.
 */

/** Kode acak 20 karakter Crockford base32 (100 bit) dari CSPRNG; `randomInt` tanpa bias modulo. */
export function newIdentityCode(): string {
  let out = '';
  for (let i = 0; i < IDENTITY_CODE_LENGTH; i++) {
    out += IDENTITY_CODE_ALPHABET.charAt(randomInt(IDENTITY_CODE_ALPHABET.length));
  }
  return out;
}

const existing = async (tx: Tx, studentIds: string[]) => {
  const map = new Map<string, string>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({ studentId: studentIdentityCode.studentId, code: studentIdentityCode.code })
    .from(studentIdentityCode)
    .where(inArray(studentIdentityCode.studentId, studentIds));
  for (const r of rows) map.set(r.studentId, r.code);
  return map;
};

/**
 * Kode (tanpa awalan) tiap siswa; yang belum punya dibuatkan. Idempoten dan aman dari balapan: penyisipan memakai
 * `ON CONFLICT DO NOTHING` (unique satu kode per siswa dan unique kode per sekolah), lalu hasil akhir dibaca ulang
 * sehingga dua permintaan bersamaan melihat kode yang sama. Mengembalikan juga jumlah kode yang baru dibuat.
 */
export async function ensureIdentityCodes(tx: Tx, schoolId: string, studentIds: string[]) {
  const ids = [...new Set(studentIds)];
  const codes = await existing(tx, ids);
  let created = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const missing = ids.filter((id) => !codes.has(id));
    if (missing.length === 0) break;
    const inserted = await tx
      .insert(studentIdentityCode)
      .values(missing.map((studentId) => ({ schoolId, studentId, code: newIdentityCode() })))
      .onConflictDoNothing()
      .returning({ studentId: studentIdentityCode.studentId });
    created += inserted.length;
    for (const [k, v] of await existing(tx, missing)) codes.set(k, v);
  }
  return { codes, created };
}

/** Isi QR yang dicetak (`ES1.<kode>`) untuk satu siswa, dibuat bila belum ada. */
export async function ensureIdentityPayload(tx: Tx, schoolId: string, studentId: string) {
  const { codes } = await ensureIdentityCodes(tx, schoolId, [studentId]);
  const code = codes.get(studentId);
  return code ? formatIdentityPayload(code) : null;
}

/**
 * Buat ulang kode siswa: isi kode diganti di tempat (kode lama langsung tidak berlaku untuk SEMUA fitur) dan
 * `rotated_at` diisi. Baris siswa dikunci agar dua pembuatan ulang bersamaan berjalan berurutan. Siswa yang belum
 * punya kode langsung mendapat kode baru. Mengembalikan null bila siswa tidak ada.
 */
export async function rotateIdentityCode(tx: Tx, schoolId: string, studentId: string) {
  const locked = await tx
    .select({ id: student.id })
    .from(student)
    .where(eq(student.id, studentId))
    .for('update');
  if (locked.length === 0) return null;
  const code = newIdentityCode();
  const updated = await tx
    .update(studentIdentityCode)
    .set({ code, rotatedAt: new Date() })
    .where(eq(studentIdentityCode.studentId, studentId))
    .returning({ id: studentIdentityCode.id });
  if (updated.length === 0) {
    await tx.insert(studentIdentityCode).values({ schoolId, studentId, code });
  }
  return code;
}

export interface ResolvedStudent {
  studentId: string;
  name: string;
  nis: string | null;
  status: string;
  /** Siswa berstatus aktif. Pemanggil memutuskan apa artinya untuk tindakannya sendiri. */
  active: boolean;
  classId: string | null;
  className: string | null;
}

/**
 * Terjemahkan isi QR hasil pindai menjadi siswa. Hanya mengidentifikasi: tidak memeriksa izin atau modul pemanggil
 * dan tidak mengubah data. 400 `invalid_qr` bila formatnya bukan kode identitas; 404 `unknown_qr` bila kode tidak
 * terdaftar di sekolah ini, sudah diganti, atau siswanya sudah dihapus.
 */
export async function resolveIdentityPayload(tx: Tx, payload: string): Promise<ResolvedStudent> {
  const code = parseIdentityPayload(payload);
  if (!code) {
    throw new HttpError(400, 'invalid_qr', 'Format QR tidak dikenali. Gunakan QR dari kartu siswa.');
  }
  const [found] = await tx
    .select({ id: student.id, name: student.name, nis: student.nis, status: student.status })
    .from(studentIdentityCode)
    .innerJoin(student, eq(student.id, studentIdentityCode.studentId))
    .where(and(eq(studentIdentityCode.code, code), isNull(student.deletedAt)));
  if (!found) throw new HttpError(404, 'unknown_qr', 'QR tidak dikenal atau sudah diganti.');
  const cls = (await classesOf(tx, [found.id])).get(found.id) ?? null;
  return {
    studentId: found.id,
    name: found.name,
    nis: found.nis,
    status: found.status,
    active: found.status === 'active',
    classId: cls?.id ?? null,
    className: cls?.name ?? null,
  };
}
