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
  subjects: {
    subjectId: string;
    name: string;
    kkm: number;
    final: number | null;
    predicate: Predicate | null;
    description: string | null;
    belowKkm: boolean;
  }[];
  extracurriculars: { name: string; predicate: Predicate | null; note: string | null }[];
  attendance: { sick: number; excused: number; absent: number };
  homeroomNote: string | null;
  homeroomTeacher: { name: string; nip: string | null } | null;
  principal: { name: string; nip: string | null } | null;
  rank: { position: number; of: number } | null;
  /** ISO 8601; dipakai untuk tanggal pada tanda tangan. */
  generatedAt: string;
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
