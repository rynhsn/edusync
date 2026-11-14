/**
 * Tipe dokumen rapor dan rekap kelas. Bentuk mengikuti GET /v1/report-cards/{studentId} dan
 * GET /v1/grading/recap/class. Ganti dengan tipe turunan api-types begitu endpoint rapor tersedia di sana.
 */

import type { CocurricularProgramLike } from '../../../../lib/report-v2';

export type Predicate = 'A' | 'B' | 'C' | 'D';

export interface ReportCardDoc {
  status: 'draft' | 'final';
  school: { name: string; address: string | null; city: string | null };
  semester: { id: string; name: string; academicYear: string };
  student: {
    id: string;
    name: string;
    nis: string | null;
    nisn: string | null;
    className: string;
    level: number | string | null;
  };
  /**
   * `kkm`, `final`, `predicate`, dan `belowKkm` tidak ada pada dokumen portal mode deskriptif (Fase A): angka tidak
   * pernah dikirim ke portal. Dokumen v1 selalu memuatnya.
   */
  subjects: {
    subjectId: string;
    name: string;
    kkm?: number;
    final?: number | null;
    predicate?: Predicate | null;
    description: string | null;
    belowKkm?: boolean;
    /** Ada (`manual`) bila deskripsi disunting guru; hilang = otomatis menurut predikat. */
    descriptionSource?: 'manual' | 'objectives';
    /** Kelompok mapel beku (5.2); hanya pada rapor SMK berkelompok. */
    group?: { key: string; label: string; section: string | null };
    /** Baris ini nilai PKL dari periode tertaut (5.4). */
    source?: 'internship';
  }[];
  extracurriculars: { name: string; predicate: Predicate | null; note: string | null }[];
  attendance: { sick: number; excused: number; absent: number };
  homeroomNote: string | null;
  homeroomTeacher: { name: string; nip: string | null } | null;
  principal: { name: string; nip: string | null } | null;
  rank?: { position: number; of: number } | null;
  /** ISO 8601; dipakai untuk tanggal pada tanda tangan. */
  generatedAt: string;
  /** Bagian v2 (semuanya opsional dan ditulis jarang): dokumen v1 tidak memuat satu pun. */
  schemaVersion?: 2;
  reportMode?: 'descriptive';
  cocurricularNote?: string | null;
  /** Penilaian kokurikuler terstruktur (4.4); hanya bila murid punya penilaian. */
  cocurricular?: CocurricularProgramLike[];
  /** NSM madrasah untuk kop (4.5); hanya bila terisi. */
  schoolNsm?: string;
  /** Identitas keahlian SMK untuk kop (5.2); hanya bila sakelar rapor berkelompok menyala dan jurusan tertaut. */
  expertise?: { field: string; program: string; concentration: string };
  /** Rincian PKL (5.4); hanya bila murid punya penempatan pada periode yang ditautkan ke semester ini. */
  internship?: {
    periodName: string;
    partner: string;
    startsOn: string;
    endsOn: string;
    presentDays: number;
    schoolSupervisor: string | null;
    industrySupervisor: string | null;
    aspects: { name: string; value: number | null }[];
    final: number | null;
    predicate: Predicate | null;
    certificateNo?: string;
  }[];
  /** Hasil UKK (5.6): percobaan terakhir bernilai per kegiatan; hanya bila sekolah menyalakan "tampilkan di rapor". */
  ukk?: {
    title: string;
    pattern: 'lsp' | 'industry' | 'independent';
    concentration: string;
    attempt: number;
    finalScore: number;
    band: { code: string; label: string } | null;
    competent: boolean | null;
    certificateNo?: string;
    statementNo?: string;
  }[];
  developmentNote?: string | null;
  guardianResponses?: ReportCardResponse[];
}

/** Tanggapan orang tua/wali yang ditumpangkan ke dokumen (bukan isi dokumen beku). */
export interface ReportCardResponse {
  id: string;
  guardianId: string;
  guardianName: string;
  text: string;
  recordedByKind: 'guardian' | 'staff';
  snapshotVersion: number | null;
  /** true bila rapor difinalkan ulang sesudah tanggapan ditulis. */
  outdated: boolean;
  updatedAt: string;
}

export interface RecapClass {
  subjects: { id: string; name: string }[];
  students: {
    studentId: string;
    name: string;
    nis: string | null;
    grades: { subjectId: string; final: number | null; predicate: Predicate | null }[];
  }[];
}
