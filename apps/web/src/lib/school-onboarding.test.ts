import { describe, expect, it } from 'vitest';
import { buildSchoolSteps, hasIdentity, type SchoolCounts } from './school-onboarding';

const empty: SchoolCounts = {
  identity: false,
  levels: 0,
  years: 0,
  semesters: 0,
  subjects: 0,
  classes: 0,
  teachers: 0,
  students: 0,
  examTypes: 0,
};

describe('buildSchoolSteps', () => {
  it('sekolah baru: semua langkah belum selesai, berurutan sesuai ketergantungan', () => {
    const steps = buildSchoolSteps(empty, { examsEnabled: true });
    expect(steps.map((s) => s.id)).toEqual([
      'identity',
      'levels',
      'year',
      'subjects',
      'classes',
      'teachers',
      'students',
      'examTypes',
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it('langkah jenis ujian hilang bila modul ujian tidak aktif', () => {
    const steps = buildSchoolSteps(empty, { examsEnabled: false });
    expect(steps.some((s) => s.id === 'examTypes')).toBe(false);
  });

  it('tahun ajaran tanpa semester belum dianggap selesai', () => {
    const noSem = buildSchoolSteps({ ...empty, years: 1 }, { examsEnabled: false });
    expect(noSem.find((s) => s.id === 'year')?.done).toBe(false);
    const withSem = buildSchoolSteps({ ...empty, years: 1, semesters: 2 }, { examsEnabled: false });
    expect(withSem.find((s) => s.id === 'year')?.done).toBe(true);
  });
});

describe('hasIdentity', () => {
  it('kosong atau hanya spasi berarti belum diisi', () => {
    expect(hasIdentity(null)).toBe(false);
    expect(hasIdentity({ name: 'SMP Contoh', city: '  ', phone: null, logoUrl: null })).toBe(false);
  });
  it('satu kolom terisi cukup', () => {
    expect(hasIdentity({ city: 'Bandung', phone: null })).toBe(true);
  });
});
