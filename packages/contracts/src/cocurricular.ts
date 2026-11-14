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

/* ---------- Program kokurikuler (tahap 4.2) ---------- */

export const COCURRICULAR_FORMS = ['collaborative', 'g7kaih', 'other'] as const;
export const COCURRICULAR_PROGRAM_STATUSES = ['draft', 'active', 'closed'] as const;
export const COCURRICULAR_FACILITATOR_ROLES = ['coordinator', 'facilitator'] as const;

/** Batas daftar anak program (rombel, butir, fasilitator) per permintaan. */
export const PROGRAM_CHILD_LIMIT = 200;

export const cocurricularProgramFieldsSchema = z.object({
  semesterId: z.uuid().nullable().describe('null = sepanjang tahun ajaran'),
  form: z.enum(COCURRICULAR_FORMS),
  title: z.string(),
  theme: z.string().nullable(),
  description: z.string().nullable(),
  plannedPeriods: z
    .number()
    .int()
    .nullable()
    .describe('JP yang direncanakan; hanya dibandingkan dengan alokasi'),
  showInReport: z.boolean(),
  status: z.enum(COCURRICULAR_PROGRAM_STATUSES),
});

export const cocurricularProgramSummarySchema = cocurricularProgramFieldsSchema.extend({
  id: z.uuid(),
  academicYearId: z.uuid(),
  classCount: z.number().int(),
  targetCount: z.number().int(),
  facilitatorCount: z.number().int(),
  createdAt: z.string(),
});

export const cocurricularProgramClassSchema = z.object({
  classId: z.uuid(),
  name: z.string(),
  level: z.string(),
});

export const cocurricularProgramTargetSchema = z.object({
  profileItemId: z.uuid(),
  frameworkKey: z.string(),
  code: z.string(),
  label: z.string(),
  active: z.boolean(),
});

export const cocurricularFacilitatorSchema = z.object({
  teacherId: z.uuid(),
  teacherName: z.string(),
  classId: z.uuid().nullable().describe('null = koordinator seluruh rombel program'),
  role: z.enum(COCURRICULAR_FACILITATOR_ROLES),
});

export const cocurricularProgramDetailSchema = cocurricularProgramSummarySchema.extend({
  classes: z.array(cocurricularProgramClassSchema),
  targets: z.array(cocurricularProgramTargetSchema),
  facilitators: z.array(cocurricularFacilitatorSchema),
});

export const cocurricularProgramInputSchema = z.object({
  semesterId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  form: z.enum(COCURRICULAR_FORMS),
  title: z.string().trim().min(1).max(200),
  theme: optionalText(200),
  description: optionalText(4000),
  plannedPeriods: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  showInReport: z.boolean().default(true),
  status: z.enum(COCURRICULAR_PROGRAM_STATUSES).default('draft'),
});

export const cocurricularFacilitatorInputSchema = z.object({
  teacherId: z.uuid(),
  classId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  role: z.enum(COCURRICULAR_FACILITATOR_ROLES),
});

export const cocurricularProgramCreateSchema = cocurricularProgramInputSchema.extend({
  academicYearId: z.uuid(),
  classIds: z.array(z.uuid()).max(PROGRAM_CHILD_LIMIT).default([]),
  profileItemIds: z.array(z.uuid()).max(PROGRAM_CHILD_LIMIT).default([]),
  facilitators: z.array(cocurricularFacilitatorInputSchema).max(PROGRAM_CHILD_LIMIT).default([]),
});

/** Ringkasan rencana JP vs alokasi per tingkat (peringatan saja, tidak menolak). */
export const cocurricularPeriodsLevelSchema = z.object({
  levelCode: z.string(),
  programCount: z.number().int(),
  plannedPeriods: z.number().int().describe('Jumlah JP rencana program yang memuat rombel tingkat ini'),
  allocatedPeriods: z
    .number()
    .int()
    .nullable()
    .describe('JP kokurikuler tahunan pada alokasi kurikulum; null = belum ada alokasi'),
  exceeds: z.boolean().describe('Rencana melebihi alokasi (hanya bila alokasi ada)'),
});

/** Aturan koordinator/fasilitator: fasilitator wajib punya rombel; koordinator tidak. Dipakai API dan layar. */
export function facilitatorShapeValid(f: { role: string; classId: string | null }): boolean {
  return f.role === 'coordinator' ? f.classId === null : f.classId !== null;
}

/* ---------- Penilaian dan bukti kokurikuler (tahap 4.3) ---------- */

/** Kode galat tahap 4.2-4.3 (selain `report_final` milik penjaga rapor). */
export const COCURRICULAR_ASSESSMENT_ERROR_CODES = [
  'cocurricular_assessed',
  'program_closed',
  'student_not_in_class',
  'too_many_items',
  'invalid_url',
] as const;

/** Batas sel penilaian per permintaan simpan (satu sel = butir x murid). */
export const ASSESSMENT_BATCH_LIMIT = 500;
export const EVIDENCE_URL_MAX = 500;

/** Bukti hanya tautan https dengan nama host, tanpa spasi, maks. 500 karakter. Dipakai API dan layar. */
export function isEvidenceUrl(value: string): boolean {
  const v = value.trim();
  return v.length <= EVIDENCE_URL_MAX && /^https:\/\/[^\s/?#]+\S*$/i.test(v);
}

/** Satu sel penilaian. Tingkat dan catatan kosong dua-duanya = hapus penilaian sel itu. */
export const assessmentCellInputSchema = z.object({
  profileItemId: z.uuid(),
  studentId: z.uuid(),
  rubricLevelId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  note: optionalText(1000),
});

/** Jumlah sel tidak dibatasi di skema supaya kelebihan menjadi 400 `too_many_items`, bukan galat validasi umum. */
export const assessmentsSaveSchema = z.object({
  semesterId: z.uuid(),
  classId: z.uuid(),
  cells: z.array(assessmentCellInputSchema),
});

export const assessmentCellSchema = z.object({
  profileItemId: z.uuid(),
  studentId: z.uuid(),
  rubricLevelId: z.uuid().nullable(),
  note: z.string().nullable(),
});

export const assessmentStudentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
});

export const assessmentSheetSchema = z.object({
  programId: z.uuid(),
  semesterId: z.uuid(),
  classId: z.uuid(),
  students: z.array(assessmentStudentSchema),
  cells: z.array(assessmentCellSchema),
  canAssess: z
    .boolean()
    .describe(
      'Pengguna boleh menyimpan penilaian rombel ini (pengelola, fasilitator rombel, atau koordinator)',
    ),
  locked: z
    .boolean()
    .describe('Rapor rombel ini pada semester itu sudah final: baca saja sampai dibuka kembali'),
  programClosed: z.boolean().describe('Program berstatus selesai: baca saja'),
});

export const evidenceInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  classId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  studentId: z
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export const evidenceSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  classId: z.uuid().nullable(),
  studentId: z.uuid().nullable(),
  studentName: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
});

/** Pilihan layar penilaian: semester yang boleh dinilai dan rombel yang boleh dilihat pengguna (guru tanpa izin tahun ajaran tetap bisa memilih). */
export const assessmentOptionsSchema = z.object({
  semesters: z.array(z.object({ id: z.uuid(), name: z.string(), startsOn: z.string(), endsOn: z.string() })),
  classes: z.array(cocurricularProgramClassSchema),
});
