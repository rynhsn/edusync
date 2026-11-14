import { z } from 'zod';

/**
 * UKK (Uji Kompetensi Keahlian) SMK, fase 5 tahap 5.5 dan 5.6. Rancangan: docs/rancangan-fase-5-smk-penuh.md.
 *
 * Isi regulasi yang dikutip di sini (tiga pola, dua tabel konversi) berasal dari Pedoman UKK SMK TA 2025/2026 (Direktorat SMK) dan
 * HANYA menjadi bawaan berlabel sumber yang dapat ditimpa sekolah per pola; bukan konstanta aturan. Skala pola `industry` tidak
 * disebut eksplisit di sumber: bawaannya memakai skala `lsp` dan ditandai `verified: false` ("periksa Pedoman").
 */

export const UKK_PATTERNS = ['lsp', 'industry', 'independent'] as const;
export type UkkPattern = (typeof UKK_PATTERNS)[number];

export const UKK_EVENT_STATUSES = ['draft', 'active', 'closed'] as const;
export type UkkEventStatus = (typeof UKK_EVENT_STATUSES)[number];

export const UKK_ASSESSOR_KINDS = ['internal', 'external'] as const;
export type UkkAssessorKind = (typeof UKK_ASSESSOR_KINDS)[number];

/** Batas percobaan per (kegiatan, murid) dan butir per permintaan simpan hasil. */
export const UKK_MAX_ATTEMPTS = 5;
export const UKK_MAX_RESULT_ITEMS = 500;

/** Kode galat tahap 5.5. */
export const UKK_ERROR_CODES = [
  'ukk_assessed',
  'event_closed',
  'report_final',
  'student_not_in_concentration',
  'too_many_items',
  'invalid_bands',
  'invalid_weights',
  'invalid_pattern',
  'invalid_attempt',
  'max_attempts',
  'certificate_taken',
  'not_vocational',
  'invalid_reference',
] as const;

/* ---------- Skala kategori ---------- */

export interface UkkBand {
  code: string;
  label: string;
  /** Batas bawah nilai (inklusif); kategori berlaku sampai batas bawah kategori berikutnya. */
  min: number;
  /** Kategori ini berarti kompeten (dasar sertifikat dan syarat kelulusan opsional). */
  competent: boolean;
}

export const ukkBandSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung.'),
  label: z.string().trim().min(1).max(60),
  min: z.number().min(0).max(100),
  competent: z.boolean(),
});

/**
 * Skala sah: 1 sampai 8 kategori, kategori pertama berbatas bawah 0 (tanpa celah), batas bawah naik tegas (tanpa tumpang tindih),
 * kode unik, dan minimal satu kategori berstatus kompeten.
 */
export function validUkkBands(bands: readonly UkkBand[]): boolean {
  if (bands.length < 1 || bands.length > 8) return false;
  if (bands[0]?.min !== 0) return false;
  for (let i = 1; i < bands.length; i++) {
    if ((bands[i] as UkkBand).min <= (bands[i - 1] as UkkBand).min) return false;
  }
  if (new Set(bands.map((b) => b.code)).size !== bands.length) return false;
  return bands.some((b) => b.competent);
}

const LSP_BANDS: readonly UkkBand[] = [
  { code: 'bk', label: 'Belum Kompeten', min: 0, competent: false },
  { code: 'k', label: 'Kompeten', min: 75, competent: true },
];

/**
 * Skala bawaan per pola. Sumber: Pedoman UKK SMK TA 2025/2026 (lsp: biner 75; independent: empat kategori). `industry` tidak disebut
 * eksplisit di sumber, memakai skala `lsp`. Hanya bawaan: sekolah dapat menimpanya.
 */
export const UKK_DEFAULT_BANDS: Record<UkkPattern, readonly UkkBand[]> = {
  lsp: LSP_BANDS,
  industry: LSP_BANDS,
  independent: [
    { code: 'bk', label: 'Belum Kompeten', min: 0, competent: false },
    { code: 'ck', label: 'Cukup Kompeten', min: 61, competent: false },
    { code: 'k', label: 'Kompeten', min: 75, competent: true },
    { code: 'sk', label: 'Sangat Kompeten', min: 91, competent: true },
  ],
};

/** Label sumber bawaan skala; `verified: false` = tidak disebut eksplisit di sumber (tampilkan "periksa"). */
export const UKK_BAND_SOURCES: Record<UkkPattern, { source: string; verified: boolean }> = {
  lsp: { source: 'Pedoman UKK SMK TA 2025/2026', verified: true },
  industry: {
    source:
      'Pedoman UKK SMK TA 2025/2026 tidak menyebut skala pola industri; memakai skala LSP, periksa Pedoman',
    verified: false,
  },
  independent: { source: 'Pedoman UKK SMK TA 2025/2026', verified: true },
};

/** Skala yang berlaku untuk satu pola: timpaan sekolah bila ada, selain itu bawaan. */
export function ukkEffectiveBands(
  custom: Partial<Record<UkkPattern, readonly UkkBand[] | null>> | null | undefined,
  pattern: UkkPattern,
): readonly UkkBand[] {
  return custom?.[pattern] ?? UKK_DEFAULT_BANDS[pattern];
}

/** Kategori untuk nilai: kategori dengan batas bawah terbesar yang <= nilai. Skala harus sah (`validUkkBands`). */
export function ukkBandOf(bands: readonly UkkBand[], score: number): UkkBand {
  let hit = bands[0] as UkkBand;
  for (const b of bands) if (score >= b.min) hit = b;
  return hit;
}

/* ---------- Nilai akhir ---------- */

export interface UkkWeights {
  practice: number;
  theory: number;
}

export function validUkkWeights(w: UkkWeights): boolean {
  return (
    Number.isInteger(w.practice) &&
    Number.isInteger(w.theory) &&
    w.practice >= 0 &&
    w.theory >= 0 &&
    w.practice + w.theory === 100
  );
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Nilai akhir dari praktik dan teori menurut bobot sekolah. Keduanya harus ada, selain itu null (belum lengkap). Tanpa bobot, nilai
 * akhir diisi langsung dan fungsi ini tidak dipakai.
 */
export function ukkFinalScore(
  practice: number | null,
  theory: number | null,
  weights: UkkWeights,
): number | null {
  if (practice === null || theory === null) return null;
  return round2((practice * weights.practice + theory * weights.theory) / 100);
}

/** Percobaan terakhir yang bernilai akhir (dasar rapor, kelulusan, dan penomoran); null bila belum ada nilai. */
export function ukkLatestScored<T extends { attemptNo: number; finalScore: number | null }>(
  attempts: readonly T[],
): T | null {
  let best: T | null = null;
  for (const a of attempts) {
    if (a.finalScore !== null && (best === null || a.attemptNo > best.attemptNo)) best = a;
  }
  return best;
}

/** Pola bawaan nomor sertifikat/surat keterangan UKK: usulan, bukan aturan (format resmi tidak ditemukan). */
export const DEFAULT_UKK_CERTIFICATE_PATTERN = 'UKK/{seq}/{code}/{year}';

/* ---------- Badan permintaan ---------- */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const dateField = z.iso.date();
const score = z.number().min(0).max(100);

export const ukkEventBodySchema = z
  .object({
    academicYearId: z.uuid(),
    semesterId: z.uuid().describe('Semester yang rapornya memuat hasil UKK (bila diaktifkan di pengaturan)'),
    concentrationId: z.uuid().describe('Konsentrasi keahlian peserta'),
    pattern: z.enum(UKK_PATTERNS),
    title: z.string().trim().min(1).max(200),
    schemeName: text(200).describe('Skema sertifikasi LSP atau paket soal'),
    kkniLevel: z
      .union([z.literal(2), z.literal(3)])
      .nullish()
      .transform((v) => v ?? null)
      .describe('Level KKNI (2 atau 3)'),
    lspName: text(200),
    lspLicenseRef: text(200).describe('Rujukan lisensi LSP (isian bebas)'),
    partnerId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null)
      .describe('Mitra dunia kerja (mitra PKL) penyelenggara/pengampu pola industri'),
    tukName: text(200).describe('Tempat Uji Kompetensi'),
    startsOn: dateField.nullish().transform((v) => v ?? null),
    endsOn: dateField.nullish().transform((v) => v ?? null),
    status: z.enum(UKK_EVENT_STATUSES).default('draft'),
  })
  .refine((b) => !b.startsOn || !b.endsOn || b.startsOn <= b.endsOn, {
    message: 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai.',
    path: ['endsOn'],
  });
export type UkkEventBody = z.infer<typeof ukkEventBodySchema>;

export const ukkAssessorsBodySchema = z.object({
  assessors: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('internal'), teacherId: z.uuid() }),
        z.object({
          kind: z.literal('external'),
          name: z.string().trim().min(1).max(160),
          institution: text(200),
          qualification: text(300),
        }),
      ]),
    )
    .max(20),
});
export type UkkAssessorsBody = z.infer<typeof ukkAssessorsBodySchema>;

export const ukkResultItemSchema = z.object({
  studentId: z.uuid(),
  attemptNo: z.number().int().min(1).max(UKK_MAX_ATTEMPTS).default(1),
  practiceScore: score.nullish().describe('Nilai praktik 0-100; dihilangkan = tidak berubah, null = hapus'),
  theoryScore: score.nullish().describe('Nilai teori 0-100; dihilangkan = tidak berubah, null = hapus'),
  finalScore: score
    .nullish()
    .describe(
      'Nilai akhir 0-100, hanya dipakai bila bobot praktik/teori belum diatur; dengan bobot nilai akhir dihitung server dan isian ini diabaikan',
    ),
  passportUnits: z
    .array(z.string().trim().min(1).max(160))
    .max(40)
    .nullish()
    .describe('Unit kompetensi yang dinyatakan kompeten (paspor keterampilan)'),
  note: z.string().trim().max(1000).nullish(),
});
export const ukkResultsBodySchema = z.object({
  items: z.array(ukkResultItemSchema).min(1),
});
export type UkkResultsBody = z.infer<typeof ukkResultsBodySchema>;

export const ukkReportingBodySchema = z.object({
  reportedToDinasAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .describe('Penanda manual sudah dilaporkan ke Dinas'),
  pushedToEraporAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .describe('Penanda manual sudah diunggah ke e-Rapor'),
});
export type UkkReportingBody = z.infer<typeof ukkReportingBodySchema>;

/**
 * Pengaturan UKK kejuruan: skala per pola (null = bawaan), bobot praktik:teori (null = nilai akhir diisi langsung), sakelar tampil di
 * rapor, dan pola nomor (null = bawaan).
 */
export const vocationalUkkSettingSchema = z.object({
  bands: z
    .object({
      lsp: z.array(ukkBandSchema).max(8).nullish(),
      industry: z.array(ukkBandSchema).max(8).nullish(),
      independent: z.array(ukkBandSchema).max(8).nullish(),
    })
    .describe('Skala per pola; null/dihilangkan = bawaan kontrak'),
  practiceWeight: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .describe('Bobot nilai praktik; null = nilai akhir diisi langsung'),
  theoryWeight: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .describe('Bobot nilai teori; null = nilai akhir diisi langsung'),
  inReport: z.boolean().describe('Tampilkan blok UKK di rapor'),
  certificatePattern: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v ? v : null))
    .describe('Pola nomor: {seq}, {code}, {roman}, {month}, {year}; kosong = bawaan'),
});
export type VocationalUkkSetting = z.infer<typeof vocationalUkkSettingSchema>;
