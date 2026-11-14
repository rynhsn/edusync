import { z } from 'zod';

/**
 * Ekspor akademik generik (tahap 3C.5). Ini BUKAN format impor e-Rapor, Dapodik, atau EMIS: formatnya milik Edusync
 * (`edusync-academic-v1`) dan hanya memudahkan pemetaan manual lewat kode identitas (NPSN, NISN, NIS, kode mapel sekolah, kode mapel
 * acuan). Format berkas yang benar-benar diterima aplikasi pelaporan resmi belum diverifikasi.
 *
 * Satu daftar dataset dan kamus kolom di sini dipakai API (penyusun berkas), tes (kolom stabil), dan web (keterangan kolom). Mengubah,
 * menambah, atau menghapus kolom = versi baru (`edusync-academic-v2`), bukan perubahan diam-diam.
 */

export const EXPORT_FORMAT_NAME = 'edusync-academic-v1';
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_DATASETS = [
  'rombel',
  'class_subjects',
  'subject_choices',
  'final_grades',
  'descriptions',
] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

/** Dataset yang memerlukan modul `grades` aktif (isinya nilai/deskripsi dari rapor); selebihnya modul inti. */
export const EXPORT_GRADE_DATASETS: readonly ExportDataset[] = ['final_grades', 'descriptions'];
/** Dataset yang harus menyebut semester (nilai, deskripsi, dan pilihan mapel per semester). */
export const EXPORT_SEMESTER_DATASETS: readonly ExportDataset[] = [
  'subject_choices',
  'final_grades',
  'descriptions',
];

/** Kode galat tahap 3C.5. */
export const EXPORT_DATASET_REQUIRES_MODULE_CODE = 'dataset_requires_module';

/** Kolom dikenal: kunci tetap (huruf kecil, bahasa Inggris), keterangan untuk kamus kolom. */
export interface ExportColumn {
  key: string;
  description: string;
}

const school = [
  { key: 'school_npsn', description: 'NPSN sekolah (kosong bila belum diisi)' },
  { key: 'academic_year', description: 'Nama tahun ajaran' },
] as const satisfies readonly ExportColumn[];

const studentIds = [
  { key: 'student_nisn', description: 'NISN murid' },
  { key: 'student_nis', description: 'NIS murid (nomor induk sekolah)' },
  { key: 'student_name', description: 'Nama murid' },
] as const satisfies readonly ExportColumn[];

const subjectIds = [
  { key: 'subject_code', description: 'Kode mapel di sekolah' },
  {
    key: 'ref_subject_code',
    description: 'Kode mapel acuan platform bila mapel diadopsi dari acuan (selain itu kosong)',
  },
  { key: 'subject_name', description: 'Nama mapel' },
] as const satisfies readonly ExportColumn[];

/** Kamus kolom per dataset, urutan = urutan kolom berkas. NIK tidak pernah menjadi kolom. */
export const EXPORT_COLUMNS = {
  rombel: [
    ...school,
    { key: 'class_name', description: 'Nama rombel (kelas)' },
    { key: 'level', description: 'Tingkat' },
    { key: 'program_code', description: 'Kode program/jurusan (kosong bila tanpa program)' },
    { key: 'program_name', description: 'Nama program/jurusan' },
    { key: 'homeroom_teacher', description: 'Nama wali kelas' },
    { key: 'homeroom_teacher_nip', description: 'NIP wali kelas' },
    ...studentIds,
    { key: 'gender', description: 'Jenis kelamin murid: L atau P' },
    { key: 'birth_date', description: 'Tanggal lahir (YYYY-MM-DD)' },
    { key: 'student_status', description: 'Status murid: active, graduated, transferred, atau dropped' },
  ],
  class_subjects: [
    ...school,
    { key: 'class_name', description: 'Nama rombel (kelas)' },
    { key: 'level', description: 'Tingkat' },
    { key: 'program_code', description: 'Kode program/jurusan (kosong bila tanpa program)' },
    ...subjectIds,
    { key: 'subject_group', description: 'Kunci kelompok mapel' },
    {
      key: 'subject_kind',
      description: 'Jenis mapel: compulsory, elective, local_content, project, atau internship',
    },
    { key: 'teacher_name', description: 'Nama guru pengampu di rombel itu' },
    { key: 'teacher_nip', description: 'NIP guru pengampu' },
    {
      key: 'weekly_periods',
      description:
        'Alokasi jam pelajaran per minggu menurut kurikulum tingkat itu (kosong bila belum diatur)',
    },
    {
      key: 'participation',
      description:
        '`all` = semua murid rombel mengambil; `selected` = hanya murid yang terdaftar (mapel pilihan)',
    },
  ],
  subject_choices: [
    ...school,
    {
      key: 'scope',
      description: '`year` = berlaku setahun penuh; `semester` = hanya semester pada kolom `semester`',
    },
    { key: 'semester', description: 'Nama semester (kosong untuk `year`)' },
    { key: 'class_name', description: 'Nama rombel murid pada tahun ajaran itu' },
    ...studentIds,
    ...subjectIds,
    { key: 'source', description: 'Asal pilihan: choice, religion, arts, atau admin' },
  ],
  final_grades: [
    ...school,
    { key: 'semester', description: 'Nama semester' },
    { key: 'class_name', description: 'Nama rombel saat rapor difinalkan' },
    { key: 'level', description: 'Tingkat saat rapor difinalkan' },
    ...studentIds,
    ...subjectIds,
    {
      key: 'final_grade',
      description: 'Nilai akhir mapel (kosong bila belum ada nilai saat rapor difinalkan)',
    },
    { key: 'predicate', description: 'Predikat A, B, C, atau D' },
    { key: 'kkm', description: 'KKM mapel saat rapor difinalkan' },
    { key: 'below_kkm', description: '`true` bila nilai di bawah KKM, selain itu `false`' },
    { key: 'finalized_at', description: 'Waktu rapor difinalkan (ISO 8601, UTC)' },
  ],
  descriptions: [
    ...school,
    { key: 'semester', description: 'Nama semester' },
    { key: 'class_name', description: 'Nama rombel saat rapor difinalkan' },
    { key: 'level', description: 'Tingkat saat rapor difinalkan' },
    ...studentIds,
    ...subjectIds,
    { key: 'description', description: 'Deskripsi capaian pada rapor final' },
    { key: 'finalized_at', description: 'Waktu rapor difinalkan (ISO 8601, UTC)' },
  ],
} as const satisfies Record<ExportDataset, readonly ExportColumn[]>;

/** Kunci kolom satu dataset, berurutan. */
export function exportColumnKeys(dataset: ExportDataset): string[] {
  return EXPORT_COLUMNS[dataset].map((c) => c.key);
}

export const exportQuerySchema = z.object({
  academicYearId: z.uuid().describe('Tahun ajaran sumber data'),
  semesterId: z
    .uuid()
    .optional()
    .describe('Semester; wajib untuk `subject_choices`, `final_grades`, dan `descriptions`'),
  dataset: z.enum(EXPORT_DATASETS),
  format: z.enum(EXPORT_FORMATS).default('csv'),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
