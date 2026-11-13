import { z } from 'zod';

/**
 * Dokumen rapor satu siswa: SATU skema untuk pembuat dokumen, respons API staf (`GET /v1/report-cards/:studentId`), dan
 * respons portal (`GET /v1/portal/children/:id/report-cards/:semesterId`). Bentuk yang sama dikembalikan API dan disimpan
 * sebagai snapshot jsonb saat rapor difinalkan (`report_card.snapshot`, `schema_version`).
 *
 * Rancangan: docs/rancangan-fase-3-asesmen-rapor.md bagian 3.3 dan risiko R4. Serializer respons Fastify + zod membuang kunci
 * yang tidak dideklarasikan pada skema respons, jadi bagian dokumen yang tidak ada di skema ini hilang diam-diam dari API.
 * Karena itu bagian baru HARUS ditambahkan di sini (satu tempat), bukan di salah satu rute.
 *
 * - `reportDocumentSchema` / `ReportDocument`: bentuk v1 (`schema_version` = 1). Dipakai kedua rute dan pembuat dokumen.
 * - `reportDocumentV2Schema`: v1 ditambah bagian v2 yang semuanya OPSIONAL dan ditulis jarang (sparse): kunci yang tidak
 *   dipakai tidak ada sama sekali, sehingga dokumen tanpa fitur baru tetap sama persis dengan v1. Belum dipakai rute di tahap
 *   3.0 (respons API tidak berubah); tahap 3.2 mengganti skema respons ke sini bersama bagian v2 pertama.
 */

export const REPORT_PREDICATES = ['A', 'B', 'C', 'D'] as const;
const predicateEnum = z.enum(REPORT_PREDICATES);

/** Satu baris mata pelajaran pada rapor, bentuk v1. */
export const reportSubjectSchema = z.object({
  subjectId: z.uuid(),
  name: z.string(),
  kkm: z.number(),
  final: z.number().nullable(),
  predicate: predicateEnum.nullable(),
  description: z.string().nullable().describe('Deskripsi capaian otomatis menurut predikat'),
  belowKkm: z.boolean(),
});

/** Dokumen rapor, bentuk v1 (`schema_version` = 1). */
export const reportDocumentSchema = z.object({
  status: z.enum(['draft', 'final']),
  school: z.object({ name: z.string(), address: z.string().nullable(), city: z.string().nullable() }),
  semester: z.object({ id: z.uuid(), name: z.string(), academicYear: z.string() }),
  student: z.object({
    id: z.uuid(),
    name: z.string(),
    nis: z.string().nullable(),
    nisn: z.string().nullable(),
    className: z.string(),
    level: z.string(),
  }),
  subjects: z.array(reportSubjectSchema),
  extracurriculars: z.array(
    z.object({ name: z.string(), predicate: predicateEnum.nullable(), note: z.string().nullable() }),
  ),
  attendance: z.object({
    sick: z.number().int(),
    excused: z.number().int(),
    absent: z.number().int(),
    late: z.number().int(),
  }),
  homeroomNote: z.string().nullable(),
  homeroomTeacher: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  principal: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  rank: z
    .object({ position: z.number().int(), of: z.number().int() })
    .nullable()
    .describe('Hanya bila pengaturan menampilkan peringkat'),
  generatedAt: z.string().describe('Waktu dokumen disusun (saat final: waktu finalisasi)'),
});

export type ReportSubject = z.infer<typeof reportSubjectSchema>;
export type ReportDocument = z.infer<typeof reportDocumentSchema>;

/* ---------- Rangka v2 (opsional, sparse) ---------- */

/** Ringkasan ketercapaian TP satu mapel pada dokumen v2. Muncul hanya bila mapel punya TP terkait. */
export const reportSubjectObjectivesSchema = z.object({
  assessed: z.number().int(),
  achieved: z.number().int(),
  high: z.array(z.object({ id: z.uuid(), code: z.string().nullable(), text: z.string() })),
  low: z.array(z.object({ id: z.uuid(), code: z.string().nullable(), text: z.string() })),
});

export const reportSubjectV2Schema = reportSubjectSchema.extend({
  /** Absen = deskripsi dari predikat (v1). */
  descriptionSource: z.enum(['manual', 'objectives']).optional(),
  objectives: reportSubjectObjectivesSchema.optional(),
});

/** Dokumen rapor bentuk v2: semua bagian tambahan opsional (ditulis hanya bila dipakai). */
export const reportDocumentV2Schema = reportDocumentSchema.extend({
  /** Hanya bila tingkat kelas bermode deskriptif (Fase A). */
  reportMode: z.literal('descriptive').optional(),
  cocurricularNote: z.string().optional(),
  developmentNote: z.string().optional(),
  subjects: z.array(reportSubjectV2Schema),
});

export type ReportSubjectV2 = z.infer<typeof reportSubjectV2Schema>;
export type ReportDocumentV2 = z.infer<typeof reportDocumentV2Schema>;

/** Kunci bagian v2 tingkat dokumen dan tingkat mapel. Satu daftar supaya deteksi dan tes memakai sumber yang sama. */
export const REPORT_V2_DOCUMENT_KEYS = ['reportMode', 'cocurricularNote', 'developmentNote'] as const;
export const REPORT_V2_SUBJECT_KEYS = ['descriptionSource', 'objectives'] as const;

/**
 * Versi bentuk dokumen: 2 bila ada minimal satu bagian v2 (kunci hadir, nilai bukan `undefined`), selain itu 1.
 * Snapshot ditulis sparse: dokumen tanpa fitur baru berversi 1 dan jsonb-nya sama persis dengan v1.
 */
export function reportDocumentSchemaVersion(doc: {
  subjects?: readonly object[];
  [key: string]: unknown;
}): 1 | 2 {
  const has = (o: object, k: string) => (o as Record<string, unknown>)[k] !== undefined;
  if (REPORT_V2_DOCUMENT_KEYS.some((k) => has(doc, k))) return 2;
  const subjects = doc.subjects ?? [];
  return subjects.some((s) => REPORT_V2_SUBJECT_KEYS.some((k) => has(s, k))) ? 2 : 1;
}
