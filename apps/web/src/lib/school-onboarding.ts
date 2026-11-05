/** Logika murni panduan awal sekolah: dari hitungan data nyata menjadi daftar langkah berurutan. */

export interface SchoolCounts {
  /** Ada minimal satu kolom identitas sekolah yang terisi. */
  identity: boolean;
  levels: number;
  years: number;
  /** Jumlah semester di seluruh tahun ajaran. */
  semesters: number;
  subjects: number;
  classes: number;
  teachers: number;
  students: number;
  examTypes: number;
}

export type SchoolStepId =
  | 'identity'
  | 'levels'
  | 'year'
  | 'subjects'
  | 'classes'
  | 'teachers'
  | 'students'
  | 'examTypes';

export interface SchoolStepDef {
  id: SchoolStepId;
  done: boolean;
  href: string;
}

/**
 * Urutan mengikuti ketergantungan nyata: kelas butuh tahun ajaran dan tingkat, siswa baru berguna setelah
 * ada kelas, jenis ujian hanya bila modul ujian aktif.
 */
export function buildSchoolSteps(c: SchoolCounts, opts: { examsEnabled: boolean }): SchoolStepDef[] {
  const steps: SchoolStepDef[] = [
    { id: 'identity', done: c.identity, href: '/school-settings' },
    { id: 'levels', done: c.levels > 0, href: '/school-settings' },
    { id: 'year', done: c.years > 0 && c.semesters > 0, href: '/academic-years' },
    { id: 'subjects', done: c.subjects > 0, href: '/subjects' },
    { id: 'classes', done: c.classes > 0, href: '/classes' },
    { id: 'teachers', done: c.teachers > 0, href: '/teachers' },
    { id: 'students', done: c.students > 0, href: '/students' },
  ];
  if (opts.examsEnabled) steps.push({ id: 'examTypes', done: c.examTypes > 0, href: '/exams/types' });
  return steps;
}

/** True bila ada kolom identitas yang berisi teks; `name` (nama unit) selalu ada sehingga tidak dihitung. */
export function hasIdentity(identity: Record<string, unknown> | null | undefined): boolean {
  if (!identity) return false;
  return Object.entries(identity).some(([k, v]) => k !== 'name' && typeof v === 'string' && v.trim() !== '');
}
