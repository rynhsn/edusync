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
 * - `reportDocumentSchema` / `ReportDocument`: bentuk v1 (`schema_version` = 1). Dipakai pembuat dokumen dan menjadi dasar v2.
 * - `reportDocumentV2Schema`: v1 ditambah bagian v2 yang semuanya OPSIONAL dan ditulis jarang (sparse): kunci yang tidak
 *   dipakai tidak ada sama sekali, sehingga dokumen tanpa fitur baru tetap sama persis dengan v1. Inilah bentuk yang disimpan
 *   sebagai snapshot jsonb.
 * - `reportDocumentResponseSchema`: skema RESPONS staf (`GET /v1/report-cards/:studentId`): v2 ditambah `schemaVersion` (hanya
 *   bila 2) dan `guardianResponses` (field respons, BUKAN isi jsonb; hanya bila ada tanggapan). Sejak tahap 3.2 rute staf memakai ini.
 * - `portalReportDocumentSchema`: skema respons portal. Sama dengan di atas, tetapi `final`, `predicate`, `kkm`, `belowKkm` per mapel
 *   dan `rank` opsional karena mode deskriptif Fase A memproyeksikan dokumen tanpa angka (keputusan K10).
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

/**
 * Kelompok mapel beku (tahap 5.2): kunci, label Indonesia, dan bagian rapor (`ref_subject_group.report_section`) saat dokumen disusun.
 * Hanya ada bila sekolah menyalakan sakelar `report_grouped` dan mapel punya kelompok.
 */
export const reportSubjectGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  section: z.string().nullable(),
});
export type ReportSubjectGroup = z.infer<typeof reportSubjectGroupSchema>;

/** Identitas keahlian di kop rapor (tahap 5.2): nama bidang, program, dan konsentrasi keahlian rombel. */
export const reportExpertiseSchema = z.object({
  field: z.string(),
  program: z.string(),
  concentration: z.string(),
});
export type ReportExpertise = z.infer<typeof reportExpertiseSchema>;

/**
 * Rincian PKL satu penempatan pada dokumen (tahap 5.4): tempat, tanggal, hari hadir menurut jurnal, nilai per aspek, nilai akhir,
 * predikat, dan nomor sertifikat. Nama dan nilai dibekukan saat dokumen disusun. Hanya ada bila murid punya penempatan non-batal
 * pada periode PKL yang ditautkan ke semester rapor itu.
 */
export const reportInternshipSchema = z.array(
  z.object({
    periodName: z.string(),
    partner: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    presentDays: z.number().int().describe('Hari hadir menurut jurnal PKL'),
    schoolSupervisor: z.string().nullable(),
    industrySupervisor: z.string().nullable(),
    aspects: z.array(z.object({ name: z.string(), value: z.number().nullable() })),
    final: z.number().nullable(),
    predicate: predicateEnum.nullable(),
    certificateNo: z.string().optional(),
  }),
);
export type ReportInternship = z.infer<typeof reportInternshipSchema>;

/**
 * Hasil UKK pada dokumen (tahap 5.6): percobaan terakhir yang bernilai per kegiatan pada semester rapor itu. Judul, konsentrasi, dan
 * label kategori dibekukan saat dokumen disusun. Hanya ada bila sekolah menyalakan `ukk_in_report` dan murid punya hasil.
 */
export const reportUkkSchema = z.array(
  z.object({
    title: z.string(),
    pattern: z.enum(['lsp', 'industry', 'independent']),
    concentration: z.string(),
    attempt: z.number().int(),
    finalScore: z.number(),
    band: z.object({ code: z.string(), label: z.string() }).nullable(),
    competent: z.boolean().nullable(),
    certificateNo: z.string().optional(),
    statementNo: z.string().optional(),
  }),
);
export type ReportUkk = z.infer<typeof reportUkkSchema>;

export const reportSubjectV2Schema = reportSubjectSchema.extend({
  /** Absen = deskripsi dari predikat (v1). */
  descriptionSource: z.enum(['manual', 'objectives']).optional(),
  group: reportSubjectGroupSchema.optional(),
  /** Baris ini nilai PKL (tahap 5.4), bukan nilai penilaian kelas; hanya pada mapel PKL dari periode tertaut. */
  source: z.literal('internship').optional(),
  objectives: reportSubjectObjectivesSchema.optional(),
});

/**
 * Penilaian kokurikuler terstruktur (tahap 4.4): per program, butir dengan tingkat rubrik dan/atau catatan. Label dan nama
 * dibekukan saat dokumen disusun. Hanya ada bila murid punya minimal satu penilaian pada program yang tampil di rapor.
 */
export const reportCocurricularSchema = z.array(
  z.object({
    programId: z.uuid(),
    title: z.string(),
    form: z.enum(['collaborative', 'g7kaih', 'other']),
    items: z.array(
      z.object({
        code: z.string(),
        label: z.string(),
        framework: z.string().describe('Kunci kerangka profil butir (mis. profil_lulusan_2025)'),
        level: z.object({ code: z.string(), label: z.string() }).nullable(),
        note: z.string().optional(),
      }),
    ),
  }),
);
export type ReportCocurricular = z.infer<typeof reportCocurricularSchema>;

/** Dokumen rapor bentuk v2: semua bagian tambahan opsional (ditulis hanya bila dipakai). */
export const reportDocumentV2Schema = reportDocumentSchema.extend({
  /** Hanya bila tingkat kelas bermode deskriptif (Fase A). */
  reportMode: z.literal('descriptive').optional(),
  cocurricularNote: z.string().optional(),
  cocurricular: reportCocurricularSchema.optional(),
  developmentNote: z.string().optional(),
  /** NSM madrasah (tahap 4.5) untuk kop; kunci tingkat atas, hanya ada bila NSM terisi. */
  schoolNsm: z.string().optional(),
  /** Identitas keahlian SMK (tahap 5.2); hanya bila rombel bertaut ke konsentrasi dan sakelar `report_grouped` menyala. */
  expertise: reportExpertiseSchema.optional(),
  /** Rincian PKL (tahap 5.4); hanya bila murid punya penempatan pada periode PKL yang ditautkan ke semester ini. */
  internship: reportInternshipSchema.optional(),
  /** Hasil UKK (tahap 5.6); hanya bila `ukk_in_report` menyala dan murid punya hasil pada kegiatan semester ini. */
  ukk: reportUkkSchema.optional(),
  subjects: z.array(reportSubjectV2Schema),
});

export type ReportSubjectV2 = z.infer<typeof reportSubjectV2Schema>;
export type ReportDocumentV2 = z.infer<typeof reportDocumentV2Schema>;

/** Tanggapan orang tua/wali atas rapor final. Field respons, tidak pernah masuk snapshot. */
export const reportGuardianResponseSchema = z.object({
  id: z.uuid(),
  guardianId: z.uuid(),
  guardianName: z.string(),
  text: z.string(),
  recordedByKind: z
    .enum(['guardian', 'staff'])
    .describe('guardian = ditulis wali lewat portal; staff = disalin staf dari rapor kertas'),
  snapshotVersion: z
    .number()
    .int()
    .nullable()
    .describe('Versi riwayat snapshot (finalisasi) saat tanggapan ditulis'),
  outdated: z
    .boolean()
    .describe(
      'true bila rapor sudah difinalkan ulang sesudah tanggapan ini ditulis (tanggapan atas versi sebelumnya)',
    ),
  updatedAt: z.string(),
});

const responseExtras = {
  schemaVersion: z.literal(2).optional().describe('Hanya ada bila dokumen berbentuk v2; dihilangkan = v1'),
  guardianResponses: z
    .array(reportGuardianResponseSchema)
    .optional()
    .describe('Hanya ada bila ada tanggapan yang boleh dilihat pembaca ini'),
};

/** Respons dokumen rapor staf: v2 + `schemaVersion` + `guardianResponses`. */
export const reportDocumentResponseSchema = reportDocumentV2Schema.extend(responseExtras);
export type ReportDocumentResponse = z.infer<typeof reportDocumentResponseSchema>;

/** Respons dokumen rapor portal: mode deskriptif membuang angka, predikat, dan peringkat. */
export const portalReportSubjectSchema = reportSubjectV2Schema.extend({
  kkm: z.number().optional(),
  final: z.number().nullable().optional(),
  predicate: predicateEnum.nullable().optional(),
  belowKkm: z.boolean().optional(),
});
export const portalReportDocumentSchema = reportDocumentV2Schema.extend({
  ...responseExtras,
  subjects: z.array(portalReportSubjectSchema),
  rank: reportDocumentSchema.shape.rank.optional(),
});
export type PortalReportDocument = z.infer<typeof portalReportDocumentSchema>;

/** Kunci bagian v2 tingkat dokumen dan tingkat mapel. Satu daftar supaya deteksi dan tes memakai sumber yang sama. */
export const REPORT_V2_DOCUMENT_KEYS = [
  'reportMode',
  'cocurricularNote',
  'cocurricular',
  'developmentNote',
  'schoolNsm',
  'expertise',
  'internship',
  'ukk',
] as const;
export const REPORT_V2_SUBJECT_KEYS = ['descriptionSource', 'objectives', 'group', 'source'] as const;

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

/**
 * Proyeksi portal untuk mode deskriptif (Fase A, K10): buang `final`, `predicate`, `kkm`, `belowKkm` tiap mapel dan `rank`.
 * Angka tetap ada di snapshot (leger, verifikasi, promosi); hanya tampilan portal yang tidak boleh memuatnya.
 */
export function projectDescriptiveForPortal<
  T extends { reportMode?: 'descriptive' | undefined; subjects: readonly object[] },
>(doc: T): T {
  if (doc.reportMode !== 'descriptive') return doc;
  // Skor UKK (5.6) juga angka: dibuang di mode deskriptif.
  const { rank: _rank, ukk: _ukk, ...rest } = doc as T & { rank?: unknown; ukk?: unknown };
  const subjects = doc.subjects.map((s) => {
    const { final: _f, predicate: _p, kkm: _k, belowKkm: _b, ...keep } = s as Record<string, unknown>;
    return keep;
  });
  // Blok PKL (5.4) memuat nilai dan predikat juga: buang agar mode deskriptif tidak membocorkan angka lewat jalur ini.
  const internship = (rest as { internship?: readonly Record<string, unknown>[] }).internship?.map((e) => {
    const { final: _f, predicate: _p, aspects, ...keep } = e;
    return {
      ...keep,
      aspects: (aspects as readonly { name: string }[]).map((a) => ({ name: a.name, value: null })),
      final: null,
      predicate: null,
    };
  });
  return { ...rest, subjects, ...(internship ? { internship } : {}) } as unknown as T;
}
