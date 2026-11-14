import { describe, expect, it } from 'vitest';
import { duplicateKeys, rubricLevelInputSchema, schoolProfileItemInputSchema } from './cocurricular';

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
