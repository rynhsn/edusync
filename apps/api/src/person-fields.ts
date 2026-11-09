import { z } from 'zod';
import { HttpError } from './http-error';
import { isUniqueViolation } from './routes/helpers';

/**
 * Bidang data diri yang dipakai bersama siswa, guru, dan wali: NIK (sensitif), telepon, email.
 * Telepon dinormalkan ke digit berawalan 62 oleh `normalizePhone` (guardians.ts).
 */

/** Hapus spasi, titik, dan strip dari isian NIK sebelum diperiksa. */
export function cleanNik(input: string): string {
  return input.replace(/[\s.-]/g, '');
}

export const NIK_MESSAGE = 'NIK harus 16 digit angka.';

/** NIK opsional: kosong menjadi null; selain itu tepat 16 digit (spasi dan titik dibuang). */
export const nikField = z
  .string()
  .max(40)
  .nullable()
  .default(null)
  .transform((v, ctx) => {
    const cleaned = cleanNik(v ?? '');
    if (cleaned === '') return null;
    if (!/^\d{16}$/.test(cleaned)) {
      ctx.addIssue({ code: 'custom', message: NIK_MESSAGE });
      return z.NEVER;
    }
    return cleaned;
  });

/** 16 digit menjadi `************1234` (hanya empat digit terakhir); null tetap null. */
export function maskNik(nik: string | null | undefined): string | null {
  if (!nik) return null;
  return `${'*'.repeat(Math.max(nik.length - 4, 0))}${nik.slice(-4)}`;
}

/**
 * NIK untuk respons: NIK utuh hanya bagi yang boleh mengelola datanya; yang lain hanya melihat bentuk tersamar.
 * `nik` null berarti disembunyikan atau memang kosong; `nikMasked` menunjukkan NIK sudah terisi atau belum.
 */
export function nikView(canManage: boolean, nik: string | null) {
  return { nik: canManage ? nik : null, nikMasked: maskNik(nik) };
}

export const nikOut = {
  nik: z.string().nullable().describe('NIK utuh; null bila tidak punya izin kelola atau belum diisi'),
  nikMasked: z.string().nullable().describe('NIK tersamar (empat digit terakhir); null bila belum diisi'),
};

export const NUPTK_MESSAGE = 'NUPTK harus 16 digit angka.';

/** NUPTK opsional: kosong menjadi null; selain itu tepat 16 digit (spasi, titik, strip dibuang). Tidak pernah wajib. */
export const nuptkField = z
  .string()
  .max(40)
  .nullable()
  .default(null)
  .transform((v, ctx) => {
    const cleaned = cleanNik(v ?? '');
    if (cleaned === '') return null;
    if (!/^\d{16}$/.test(cleaned)) {
      ctx.addIssue({ code: 'custom', message: NUPTK_MESSAGE });
      return z.NEVER;
    }
    return cleaned;
  });

/** NUPTK untuk respons: utuh hanya bagi pengelola data guru; yang lain melihat bentuk tersamar (empat digit akhir). */
export function nuptkView(canManage: boolean, nuptk: string | null) {
  return { nuptk: canManage ? nuptk : null, nuptkMasked: maskNik(nuptk) };
}

export const nuptkOut = {
  nuptk: z.string().nullable().describe('NUPTK utuh; null bila tidak punya izin kelola atau belum diisi'),
  nuptkMasked: z.string().nullable().describe('NUPTK tersamar (empat digit terakhir); null bila belum diisi'),
};

const NIK_CONSTRAINTS = ['student_school_nik_uq', 'teacher_school_nik_uq', 'guardian_school_nik_uq'];

function violatedConstraint(error: unknown): string | undefined {
  const e = error as { constraint?: string; cause?: { constraint?: string } };
  return e?.constraint ?? e?.cause?.constraint;
}

export function isNuptkViolation(error: unknown): boolean {
  return isUniqueViolation(error) && violatedConstraint(error) === 'teacher_school_nuptk_uq';
}

export const nuptkTaken = () =>
  new HttpError(409, 'nuptk_taken', 'NUPTK itu sudah dipakai guru lain di sekolah ini.');

export function isNikViolation(error: unknown): boolean {
  return isUniqueViolation(error) && NIK_CONSTRAINTS.includes(violatedConstraint(error) ?? '');
}

export const nikTaken = () =>
  new HttpError(409, 'nik_taken', 'NIK itu sudah dipakai orang lain di sekolah ini.');

/**
 * Jalankan penulisan; pelanggaran keunikan NIK menjadi 409 `nik_taken`, pelanggaran unik lain menjadi 409 `conflict`
 * dengan pesan `fallback` (bila diberikan). Bungkus seluruh `withTenant`.
 */
export async function nikConflictAs409<T>(fallback: string | null, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isNikViolation(error)) throw nikTaken();
    if (isNuptkViolation(error)) throw nuptkTaken();
    if (fallback && isUniqueViolation(error)) throw new HttpError(409, 'conflict', fallback);
    throw error;
  }
}
