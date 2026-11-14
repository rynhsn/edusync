import { describe, expect, it } from 'vitest';
import {
  assessmentCellInputSchema,
  assessmentsSaveSchema,
  cocurricularProgramCreateSchema,
  duplicateKeys,
  evidenceInputSchema,
  facilitatorShapeValid,
  isEvidenceUrl,
  rubricLevelInputSchema,
  schoolProfileItemInputSchema,
} from './cocurricular';

describe('kontrak kerangka profil', () => {
  it('butir: memangkas teks, deskripsi kosong menjadi null, bawaan aktif dan urutan 0', () => {
    const v = schoolProfileItemInputSchema.parse({
      frameworkKey: 'profil_lulusan_2025',
      code: ' faith ',
      label: ' Iman ',
      description: '   ',
    });
    expect(v).toMatchObject({ code: 'faith', label: 'Iman', description: null, sort: 0, active: true });
  });
  it('butir: menolak label kosong atau lebih dari 120 karakter', () => {
    const base = { frameworkKey: 'x', code: 'a' };
    expect(schoolProfileItemInputSchema.safeParse({ ...base, label: '  ' }).success).toBe(false);
    expect(schoolProfileItemInputSchema.safeParse({ ...base, label: 'x'.repeat(121) }).success).toBe(false);
  });
  it('rubrik: kode maksimal 10, label maksimal 60, urutan wajib', () => {
    const ok = { code: 'SB', label: 'Sangat Baik', sort: 1 };
    expect(rubricLevelInputSchema.safeParse(ok).success).toBe(true);
    expect(rubricLevelInputSchema.safeParse({ ...ok, code: 'x'.repeat(11) }).success).toBe(false);
    expect(rubricLevelInputSchema.safeParse({ ...ok, label: 'x'.repeat(61) }).success).toBe(false);
    expect(rubricLevelInputSchema.safeParse({ code: 'SB', label: 'a' }).success).toBe(false);
  });
  it('duplicateKeys mengembalikan kunci yang berulang', () => {
    expect(duplicateKeys(['a', 'b', 'a', 'c', 'a', 'b'])).toEqual(['a', 'b']);
    expect(duplicateKeys(['a', 'b'])).toEqual([]);
  });
});

describe('kontrak program kokurikuler', () => {
  const base = {
    academicYearId: '019e0000-0000-7000-8000-000000000001',
    form: 'collaborative',
    title: ' Tema ',
  };
  it('bawaan: sepanjang tahun, draf, tampil di rapor, anak kosong; teks dipangkas', () => {
    const v = cocurricularProgramCreateSchema.parse(base);
    expect(v).toMatchObject({
      title: 'Tema',
      semesterId: null,
      theme: null,
      plannedPeriods: null,
      showInReport: true,
      status: 'draft',
      classIds: [],
      profileItemIds: [],
      facilitators: [],
    });
  });
  it('menolak bentuk/status tak dikenal, judul kosong, dan JP negatif', () => {
    expect(cocurricularProgramCreateSchema.safeParse({ ...base, form: 'x' }).success).toBe(false);
    expect(cocurricularProgramCreateSchema.safeParse({ ...base, status: 'x' }).success).toBe(false);
    expect(cocurricularProgramCreateSchema.safeParse({ ...base, title: ' ' }).success).toBe(false);
    expect(cocurricularProgramCreateSchema.safeParse({ ...base, plannedPeriods: -1 }).success).toBe(false);
  });
  it('koordinator tanpa rombel, fasilitator wajib rombel', () => {
    expect(facilitatorShapeValid({ role: 'coordinator', classId: null })).toBe(true);
    expect(facilitatorShapeValid({ role: 'coordinator', classId: 'c' })).toBe(false);
    expect(facilitatorShapeValid({ role: 'facilitator', classId: 'c' })).toBe(true);
    expect(facilitatorShapeValid({ role: 'facilitator', classId: null })).toBe(false);
  });
});

describe('kontrak penilaian dan bukti kokurikuler', () => {
  const id = '019e0000-0000-7000-8000-000000000001';
  it('sel: tingkat dan catatan opsional (dipangkas, kosong menjadi null)', () => {
    const v = assessmentCellInputSchema.parse({ profileItemId: id, studentId: id, note: '  ' });
    expect(v).toMatchObject({ rubricLevelId: null, note: null });
    expect(
      assessmentCellInputSchema.safeParse({ profileItemId: id, studentId: id, note: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
  });
  it('batas jumlah sel diperiksa API (400 too_many_items), bukan skema', () => {
    const cells = Array.from({ length: 501 }, () => ({ profileItemId: id, studentId: id }));
    expect(assessmentsSaveSchema.safeParse({ semesterId: id, classId: id, cells }).success).toBe(true);
  });
  it('bukti hanya tautan https tanpa spasi, maksimal 500 karakter', () => {
    expect(isEvidenceUrl('https://contoh.id/karya?x=1')).toBe(true);
    expect(isEvidenceUrl('  https://contoh.id  ')).toBe(true);
    for (const bad of [
      'http://contoh.id',
      'javascript:alert(1)',
      'https://',
      'https://a b',
      '',
      'ftp://x.id',
      `https://a.id/${'x'.repeat(500)}`,
    ]) {
      expect(isEvidenceUrl(bad), bad).toBe(false);
    }
    expect(evidenceInputSchema.parse({ title: ' Foto ', url: 'https://a.id' })).toMatchObject({
      title: 'Foto',
      classId: null,
      studentId: null,
    });
  });
});
