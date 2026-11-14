import { z } from 'zod';

/**
 * Struktur keahlian SMK (fase 5, tahap 5.1). Bidang -> Program -> Konsentrasi Keahlian diisi sekolah (tanpa seed: daftar resmi
 * berbeda antarsumber dan lampiran 244/M/2024 belum terbaca). `program` tetap unit operasional (kelas, JP, KKTP); satu program
 * ditautkan ke paling banyak satu konsentrasi lewat `program_concentration`.
 */

/** Kode galat tahap 5.1/5.2. */
export const VOCATIONAL_ERROR_CODES = ['not_vocational', 'in_use', 'invalid_reference'] as const;

const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung.');
const name = z.string().trim().min(1).max(160);
const dapodikCode = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((v) => (v ? v : null));
const common = {
  code,
  name,
  dapodikCode: dapodikCode.describe('Kode Dapodik (opsional, isi sesuai SK Dinas/Dapodik)'),
  sort: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
};

export const vocationalFieldBodySchema = z.object({
  ...common,
  sourceRef: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v ? v : null))
    .describe("Rujukan sumber informatif (mis. '244/M/2024')"),
});
export const vocationalProgramBodySchema = z.object({ ...common, fieldId: z.uuid() });
export const vocationalConcentrationBodySchema = z.object({ ...common, vocationalProgramId: z.uuid() });

/** Pengaturan kejuruan yang memengaruhi rapor (5.2). Tanpa baris tersimpan = semua mati. */
export const vocationalReportSettingSchema = z.object({
  reportGrouped: z
    .boolean()
    .describe('Rapor dikelompokkan menurut kelompok mapel (Umum/Kejuruan) dan kop memuat identitas keahlian'),
});
export type VocationalReportSetting = z.infer<typeof vocationalReportSettingSchema>;
