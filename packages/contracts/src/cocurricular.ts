import { z } from 'zod';

/**
 * Kerangka profil dan rubrik kokurikuler (fase 4, tahap 4.1). Kerangka acuan (delapan dimensi profil lulusan, Panca Cinta) bersifat
 * global dan hanya-baca; sekolah mengadopsinya ke butir sendiri (label dapat diubah, butir buatan sendiri boleh). Kokurikuler BUKAN
 * mapel: tidak memengaruhi nilai, peringkat, kenaikan, atau kelulusan. Tidak ada baris otomatis saat sekolah dibuat.
 */

export const PROFILE_FRAMEWORK_KINDS = ['dimension', 'value'] as const;
/** `official` = dari teks regulasi; `secondary` = sumber sekunder (mis. halaman kanwil), harus diperiksa sekolah. */
export const PROFILE_FRAMEWORK_VERIFICATIONS = ['official', 'secondary'] as const;

/** Kunci kerangka yang di-seed migrasi 0106. Versi kebijakan baru = kunci baru; kunci lama tetap untuk data historis. */
export const PROFILE_FRAMEWORK_KEYS = ['profil_lulusan_2025', 'panca_cinta_2025'] as const;

/** Kode galat tahap 4.1. */
export const COCURRICULAR_ERROR_CODES = ['framework_not_for_profile', 'item_in_use'] as const;

export const PROFILE_ITEM_LIMIT = 100;
export const RUBRIC_LEVEL_LIMIT = 12;

export const profileFrameworkItemSchema = z.object({
  code: z.string(),
  groupCode: z.string().nullable(),
  labelId: z.string(),
  labelEn: z.string(),
  labelSu: z.string(),
  sort: z.number().int(),
});

export const profileFrameworkSchema = z.object({
  key: z.string(),
  kind: z.enum(PROFILE_FRAMEWORK_KINDS),
  labelId: z.string(),
  labelEn: z.string(),
  labelSu: z.string(),
  profileKeys: z
    .array(z.string())
    .nullable()
    .describe('Profil jenjang yang boleh memakai kerangka; null = semua'),
  source: z.string().describe('Nomor regulasi sumber'),
  verification: z.enum(PROFILE_FRAMEWORK_VERIFICATIONS),
  sort: z.number().int(),
  items: z.array(profileFrameworkItemSchema),
});

export const schoolProfileItemSchema = z.object({
  id: z.uuid(),
  frameworkKey: z.string(),
  refCode: z.string().nullable().describe('Kode butir acuan asal; null = butir buatan sekolah'),
  code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const schoolProfileItemInputSchema = z.object({
  id: z.uuid().optional().describe('Kosong = butir baru buatan sekolah'),
  frameworkKey: z.string().min(1).max(60),
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  description: optionalText(1000),
  sort: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const rubricLevelSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean(),
});

export const rubricLevelInputSchema = z.object({
  id: z.uuid().optional().describe('Kosong = tingkat baru'),
  code: z.string().trim().min(1).max(10),
  label: z.string().trim().min(1).max(60),
  description: optionalText(500),
  sort: z.number().int().min(0).max(9999),
  active: z.boolean().default(true),
});

/** Kode ganda dalam satu daftar (kunci unik per sekolah). Dipakai API sebelum menulis. */
export function duplicateKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup];
}
