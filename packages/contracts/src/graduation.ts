import { z } from 'zod';

/**
 * Kelulusan (tahap 3C.4). Kelulusan ditetapkan satuan pendidikan setelah ujian satuan pendidikan dan pertimbangan nilai rapor;
 * tidak ada rumus nasional, jadi komponen, bobot, dan ambang sepenuhnya konfigurasi sekolah (tidak ada angka bawaan di sini).
 * Edusync hanya menghitung SARAN angka; manusia yang menetapkan. Fungsi di berkas ini murni (tanpa DB) dan dipakai API dan web.
 */

export const GRADUATION_RESULTS = ['graduated', 'not_graduated', 'deferred'] as const;
export type GraduationResult = (typeof GRADUATION_RESULTS)[number];

export const GRADUATION_STATUSES = ['draft', 'final'] as const;
export type GraduationStatus = (typeof GRADUATION_STATUSES)[number];

/** Bentuk ujian satuan pendidikan; tanpa CHECK di DB (daftar boleh bertambah tanpa migrasi). */
export const SCHOOL_EXAM_FORMS = [
  'written',
  'practical',
  'portfolio',
  'assignment',
  'project',
  'other',
] as const;
export type SchoolExamForm = (typeof SCHOOL_EXAM_FORMS)[number];

/** `final_level`: rapor tahun terakhir saja; `all_levels`: semua rapor final murid; `levels`: tingkat yang disebut di `reportLevels`. */
export const GRADUATION_REPORT_SCOPES = ['final_level', 'all_levels', 'levels'] as const;
export type GraduationReportScope = (typeof GRADUATION_REPORT_SCOPES)[number];

export const GRADUATION_ROUNDINGS = ['integer', 'one_decimal', 'two_decimals'] as const;
export type GraduationRounding = (typeof GRADUATION_ROUNDINGS)[number];

/** Kode galat: penetapan kelulusan tahun itu sudah final. */
export const GRADUATION_FINAL_CODE = 'graduation_final';

const weight = z.number().min(0).max(100);

/** Isi `graduation_policy.config` (jsonb tervalidasi). Bobot dinormalkan: yang dipakai adalah porsinya terhadap jumlah bobot. */
export const graduationConfigSchema = z
  .object({
    reportWeight: weight.describe('Bobot nilai rapor (rata-rata nilai akhir dari snapshot rapor final)'),
    examWeights: z
      .record(z.uuid(), weight)
      .describe('Bobot tiap ujian satuan pendidikan (id ujian pada tahun ajaran itu)'),
    reportScope: z.enum(GRADUATION_REPORT_SCOPES),
    reportLevels: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .default([])
      .describe('Tingkat yang rapornya dipakai; hanya bermakna bila `reportScope` = `levels`'),
    rounding: z.enum(GRADUATION_ROUNDINGS),
    minAverage: z
      .number()
      .min(0)
      .max(100)
      .nullable()
      .describe('Ambang rata-rata nilai kelulusan (saran); null = tanpa ambang'),
    minSubjectScore: z
      .number()
      .min(0)
      .max(100)
      .nullable()
      .describe('Ambang nilai per mapel wajib (saran); null = tanpa ambang'),
    requiredSubjectIds: z
      .array(z.uuid())
      .max(100)
      .default([])
      .describe('Mapel wajib; kosong = semua mapel yang punya nilai'),
    criteriaText: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .describe('Teks kriteria untuk dokumen dan murid'),
    requireUkkCompetent: z
      .boolean()
      .optional()
      .describe(
        'Hanya SMK (5.6): saran kelulusan menandai murid yang belum kompeten UKK atau belum punya hasil UKK. Absen = tidak dipakai. Pedoman UKK tidak menyatakan UKK menentukan kelulusan, jadi hanya saran, bukan penolakan',
      ),
  })
  .refine((c) => c.reportWeight + Object.values(c.examWeights).reduce((a, b) => a + b, 0) > 0, {
    message: 'Jumlah bobot harus lebih dari 0',
    path: ['reportWeight'],
  })
  .refine((c) => c.reportScope !== 'levels' || c.reportLevels.length > 0, {
    message: 'Pilih minimal satu tingkat',
    path: ['reportLevels'],
  });

export type GraduationConfig = z.infer<typeof graduationConfigSchema>;

/* ---------- Perhitungan saran ---------- */

export interface GraduationSubjectInput {
  subjectId: string;
  name: string;
  /** Nilai akhir mapel dari tiap snapshot rapor final yang dipakai (null = mapel tanpa angka pada rapor itu). */
  reportFinals: (number | null)[];
  /** Nilai ujian satuan pendidikan per ujian (null atau tidak ada = belum dinilai). */
  exams: { examId: string; value: number | null }[];
}

export interface GraduationSubjectResult {
  subjectId: string;
  name: string;
  /** Rata-rata nilai rapor mapel (dibulatkan menurut pengaturan); null bila tidak ada nilai rapor. */
  report: number | null;
  exams: { examId: string; value: number | null }[];
  /** Nilai kelulusan mapel; null bila tidak ada satu pun komponen berbobot yang punya nilai. */
  final: number | null;
  /** Komponen berbobot yang belum punya nilai: `report` atau id ujian. */
  missing: string[];
}

export type GraduationFailureCode =
  | 'below_average'
  | 'below_subject'
  | 'required_missing'
  | 'no_scores'
  | 'ukk_not_competent'
  | 'ukk_missing';

/** Status UKK murid untuk saran (5.6): `competent` bila hasil terakhir salah satu kegiatannya kompeten; `none` bila belum ada hasil bernilai. */
export type GraduationUkkStatus = 'competent' | 'not_competent' | 'none';

export interface GraduationFailure {
  code: GraduationFailureCode;
  subjectId?: string;
}

export interface GraduationSuggestion {
  subjects: GraduationSubjectResult[];
  average: number | null;
  meetsCriteria: boolean;
  failures: GraduationFailure[];
  /** Ada mapel dengan komponen berbobot yang belum bernilai. */
  incomplete: boolean;
}

const DECIMALS: Record<GraduationRounding, number> = { integer: 0, one_decimal: 1, two_decimals: 2 };

/** Pembulatan setengah ke atas pada jumlah desimal yang dikonfigurasi (menghindari galat biner, mis. 1.005). */
export function roundScore(value: number, rounding: GraduationRounding): number {
  const f = 10 ** DECIMALS[rounding];
  return Math.round((value + Number.EPSILON) * f) / f;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Hitung saran nilai kelulusan satu murid. Nilai mapel = rata-rata tertimbang komponen BERBOBOT yang punya nilai
 * (rapor: bobot `reportWeight`; tiap ujian: bobotnya); komponen berbobot tanpa nilai dicatat di `missing` dan murid ditandai
 * `incomplete`. Rata-rata = rata-rata nilai mapel yang punya nilai. Kriteria hanya SARAN: `failures` menjelaskan penyebabnya.
 */
export function computeGraduationSuggestion(
  config: GraduationConfig,
  subjects: readonly GraduationSubjectInput[],
  ukk?: GraduationUkkStatus,
): GraduationSuggestion {
  const examWeight = (id: string) => config.examWeights[id] ?? 0;
  const results: GraduationSubjectResult[] = subjects.map((s) => {
    const reportVals = s.reportFinals.filter((v): v is number => v !== null);
    const reportRaw = reportVals.length > 0 ? mean(reportVals) : null;
    const parts: { w: number; v: number }[] = [];
    const missing: string[] = [];
    if (config.reportWeight > 0) {
      if (reportRaw === null) missing.push('report');
      else parts.push({ w: config.reportWeight, v: reportRaw });
    }
    const exams = Object.keys(config.examWeights)
      .filter((id) => examWeight(id) > 0)
      .map((examId) => {
        const value = s.exams.find((e) => e.examId === examId)?.value ?? null;
        if (value === null) missing.push(examId);
        else parts.push({ w: examWeight(examId), v: value });
        return { examId, value };
      });
    const totalW = parts.reduce((a, p) => a + p.w, 0);
    return {
      subjectId: s.subjectId,
      name: s.name,
      report: reportRaw === null ? null : roundScore(reportRaw, config.rounding),
      exams,
      final:
        totalW > 0 ? roundScore(parts.reduce((a, p) => a + p.w * p.v, 0) / totalW, config.rounding) : null,
      missing,
    };
  });

  const scored = results.filter((r) => r.final !== null);
  const average =
    scored.length > 0 ? roundScore(mean(scored.map((r) => r.final as number)), config.rounding) : null;
  const required = config.requiredSubjectIds.length > 0 ? new Set(config.requiredSubjectIds) : null;
  const failures: GraduationFailure[] = [];
  if (scored.length === 0) failures.push({ code: 'no_scores' });
  if (config.minAverage !== null && average !== null && average < config.minAverage) {
    failures.push({ code: 'below_average' });
  }
  for (const id of required ?? []) {
    const r = results.find((x) => x.subjectId === id);
    if (!r || r.final === null) failures.push({ code: 'required_missing', subjectId: id });
  }
  if (config.minSubjectScore !== null) {
    for (const r of results) {
      if (
        r.final !== null &&
        (required === null || required.has(r.subjectId)) &&
        r.final < config.minSubjectScore
      ) {
        failures.push({ code: 'below_subject', subjectId: r.subjectId });
      }
    }
  }
  // Syarat UKK opsional (5.6): hanya bila dinyalakan; `ukk` tidak diberikan = tidak diperiksa.
  if (config.requireUkkCompetent === true && ukk !== undefined && ukk !== 'competent') {
    failures.push({ code: ukk === 'none' ? 'ukk_missing' : 'ukk_not_competent' });
  }
  return {
    subjects: results,
    average,
    meetsCriteria: failures.length === 0,
    failures,
    incomplete: results.some((r) => r.missing.length > 0),
  };
}

/* ---------- Penomoran SKL ---------- */

const TEMPLATE_TOKEN = /\{(seq(?::(\d{1,2}))?|year)\}/g;
const TEMPLATE_ANY_BRACE = /\{[^}]*\}/g;

/**
 * Templat nomor SKL, mis. `{seq:3}/SKL/{year}`. `{seq}` = nomor urut (`{seq:3}` = diisi nol di depan hingga 3 angka), `{year}` = tahun
 * tanggal kelulusan. Wajib memuat `{seq}`; hanya token itu yang dikenal. Kembalikan null bila valid, selain itu kode galat.
 */
export function validateNumberTemplate(
  template: string,
): 'empty' | 'tooLong' | 'noSeq' | 'unknownToken' | null {
  const t = template.trim();
  if (t === '') return 'empty';
  if (t.length > 80) return 'tooLong';
  const braces = t.match(TEMPLATE_ANY_BRACE) ?? [];
  const known = t.match(TEMPLATE_TOKEN) ?? [];
  if (braces.length !== known.length) return 'unknownToken';
  if (!known.some((k) => k.startsWith('{seq'))) return 'noSeq';
  return null;
}

/** Isi templat dengan nomor urut dan tahun (empat angka). Templat tak valid dikembalikan apa adanya. */
export function renderNumberTemplate(template: string, vars: { seq: number; year: number }): string {
  return template
    .trim()
    .replace(TEMPLATE_TOKEN, (_m, token: string, pad?: string) =>
      token === 'year' ? String(vars.year) : String(vars.seq).padStart(pad ? Number(pad) : 0, '0'),
    );
}
