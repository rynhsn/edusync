/**
 * Tipe dokumen rapor dan rekap kelas. Bentuk mengikuti GET /v1/report-cards/{studentId} dan
 * GET /v1/grading/recap/class. Ganti dengan tipe turunan api-types begitu endpoint rapor tersedia di sana.
 */

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
