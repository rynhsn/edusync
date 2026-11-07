import { randomInt } from 'node:crypto';
import { ATTENDANCE_QR_ALPHABET, ATTENDANCE_QR_CODE_LENGTH, formatAttendanceQr } from '@edusync/contracts';
import { and, attendanceCard, eq, inArray, student, type Tx } from '@edusync/db';

/** Kode acak 20 karakter Crockford base32 (100 bit) dari CSPRNG; `randomInt` tanpa bias modulo. */
export function newQrCode(): string {
  let out = '';
  for (let i = 0; i < ATTENDANCE_QR_CODE_LENGTH; i++) {
    out += ATTENDANCE_QR_ALPHABET.charAt(randomInt(ATTENDANCE_QR_ALPHABET.length));
  }
  return out;
}

const existing = async (tx: Tx, studentIds: string[]) => {
  const map = new Map<string, string>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({ studentId: attendanceCard.studentId, code: attendanceCard.code })
    .from(attendanceCard)
    .where(
      and(
        inArray(attendanceCard.studentId, studentIds),
        eq(attendanceCard.kind, 'qr'),
        eq(attendanceCard.active, true),
      ),
    );
  for (const r of rows) map.set(r.studentId, r.code);
  return map;
};

/**
 * Kode QR (tanpa awalan) tiap siswa; yang belum punya dibuatkan. Idempoten dan aman dari balapan: penyisipan memakai
 * `ON CONFLICT DO NOTHING` (unique satu QR per siswa dan unique kode per sekolah), lalu hasil akhir dibaca ulang
 * sehingga dua permintaan bersamaan melihat kode yang sama. Mengembalikan juga jumlah kode yang baru dibuat.
 */
export async function ensureQrCodes(tx: Tx, schoolId: string, studentIds: string[]) {
  const ids = [...new Set(studentIds)];
  const codes = await existing(tx, ids);
  let created = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const missing = ids.filter((id) => !codes.has(id));
    if (missing.length === 0) break;
    const inserted = await tx
      .insert(attendanceCard)
      .values(missing.map((studentId) => ({ schoolId, studentId, kind: 'qr' as const, code: newQrCode() })))
      .onConflictDoNothing()
      .returning({ studentId: attendanceCard.studentId });
    created += inserted.length;
    for (const [k, v] of await existing(tx, missing)) codes.set(k, v);
  }
  return { codes, created };
}

/** Isi QR yang dicetak (`ES1.<kode>`) untuk satu siswa, dibuat bila belum ada. */
export async function ensurePrintedQr(tx: Tx, schoolId: string, studentId: string) {
  const { codes } = await ensureQrCodes(tx, schoolId, [studentId]);
  const code = codes.get(studentId);
  return code ? formatAttendanceQr(code) : null;
}

/**
 * Buat ulang QR siswa: kode lama dihapus (QR cetak lama langsung tidak berlaku) lalu kode baru dibuat. Baris siswa
 * dikunci agar dua pembuatan ulang bersamaan berjalan berurutan. Mengembalikan null bila siswa tidak ada.
 */
export async function rotateQrCode(tx: Tx, schoolId: string, studentId: string) {
  const locked = await tx
    .select({ id: student.id })
    .from(student)
    .where(eq(student.id, studentId))
    .for('update');
  if (locked.length === 0) return null;
  await tx
    .delete(attendanceCard)
    .where(and(eq(attendanceCard.studentId, studentId), eq(attendanceCard.kind, 'qr')));
  const code = newQrCode();
  await tx.insert(attendanceCard).values({ schoolId, studentId, kind: 'qr', code });
  return code;
}
