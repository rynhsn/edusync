import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_PURPOSES,
  ASSESSMENT_TECHNIQUES,
  assessmentCounts,
  componentCounts,
  countedWeightSum,
  normalizeComponentInput,
  SUMMATIVE_SCOPES,
  validateAssessmentTags,
} from './assessment-category';
import { finalGrade } from './grading';
import { gradingConfigVersionOf, sparseFrozenComponent } from './grading-config';

describe('daftar nilai yang sah', () => {
  it('purpose hanya initial, lingkup sumatif dua nilai, teknik sembilan nilai', () => {
    expect(ASSESSMENT_PURPOSES).toEqual(['initial']);
    expect(SUMMATIVE_SCOPES).toEqual(['material', 'end_of_semester']);
    expect(ASSESSMENT_TECHNIQUES).toContain('observation');
    expect(new Set(ASSESSMENT_TECHNIQUES).size).toBe(ASSESSMENT_TECHNIQUES.length);
  });
});

describe('componentCounts', () => {
  it('bawaan (kunci hilang) = sumatif dan ikut nilai akhir', () => {
    expect(componentCounts({})).toBe(true);
    expect(componentCounts({ category: 'summative', includeInFinal: true })).toBe(true);
  });
  it('formatif atau dikeluarkan tidak dihitung', () => {
    expect(componentCounts({ category: 'formative' })).toBe(false);
    expect(componentCounts({ category: 'formative', includeInFinal: true })).toBe(false);
    expect(componentCounts({ category: 'summative', includeInFinal: false })).toBe(false);
  });
});

describe('assessmentCounts', () => {
  it('asesmen awal tidak dihitung walau komponennya sumatif', () => {
    expect(assessmentCounts({ purpose: null }, {})).toBe(true);
    expect(assessmentCounts({ purpose: 'initial' }, {})).toBe(false);
    expect(assessmentCounts({}, { category: 'formative' })).toBe(false);
  });
});

describe('countedWeightSum', () => {
  it('hanya menjumlah komponen yang dihitung', () => {
    expect(
      countedWeightSum([
        { weight: 40 },
        { weight: 60, category: 'summative' },
        { weight: 50, category: 'formative' },
        { weight: 20, includeInFinal: false },
      ]),
    ).toBe(100);
  });
});

describe('normalizeComponentInput', () => {
  it('bawaan: sumatif, ikut nilai akhir, bobot wajib 1..100', () => {
    expect(normalizeComponentInput({ weight: 30 })).toEqual({
      ok: true,
      value: { category: 'summative', includeInFinal: true, weight: 30 },
    });
    for (const weight of [undefined, 0, 101, 2.5]) {
      const r = normalizeComponentInput({ weight });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid_component_category');
    }
  });
  it('formatif: includeInFinal dipaksa false dan bobot disimpan 0', () => {
    expect(normalizeComponentInput({ category: 'formative', includeInFinal: true, weight: 40 })).toEqual({
      ok: true,
      value: { category: 'formative', includeInFinal: false, weight: 0 },
    });
    expect(normalizeComponentInput({ category: 'formative' })).toEqual({
      ok: true,
      value: { category: 'formative', includeInFinal: false, weight: 0 },
    });
  });
  it('sumatif yang dikeluarkan boleh berbobot 0', () => {
    expect(normalizeComponentInput({ includeInFinal: false })).toEqual({
      ok: true,
      value: { category: 'summative', includeInFinal: false, weight: 0 },
    });
  });
  it('mengubah komponen: kunci yang dihilangkan dipertahankan; formatif ke sumatif mengembalikan bawaan', () => {
    const sum = { category: 'summative' as const, includeInFinal: true, weight: 25 };
    expect(normalizeComponentInput({}, sum)).toEqual({ ok: true, value: sum });
    expect(normalizeComponentInput({ weight: 35 }, sum)).toEqual({ ok: true, value: { ...sum, weight: 35 } });
    const f = { category: 'formative' as const, includeInFinal: false, weight: 0 };
    expect(normalizeComponentInput({ weight: 70 }, f)).toEqual({ ok: true, value: f });
    expect(normalizeComponentInput({ category: 'summative' }, f).ok).toBe(false);
    expect(normalizeComponentInput({ category: 'summative', weight: 10 }, f)).toEqual({
      ok: true,
      value: { category: 'summative', includeInFinal: true, weight: 10 },
    });
  });
  it('kategori tak dikenal ditolak', () => {
    const r = normalizeComponentInput({ category: 'lain' as never, weight: 5 });
    expect(r.ok).toBe(false);
  });
});

describe('validateAssessmentTags', () => {
  it('initial hanya formatif; scope hanya sumatif', () => {
    expect(validateAssessmentTags({ purpose: 'initial' }, 'formative')).toBeNull();
    expect(validateAssessmentTags({ purpose: 'initial' }, 'summative')?.code).toBe(
      'initial_requires_formative',
    );
    expect(validateAssessmentTags({ summativeScope: 'material' }, 'summative')).toBeNull();
    expect(validateAssessmentTags({ summativeScope: 'end_of_semester' }, 'formative')?.code).toBe(
      'scope_requires_summative',
    );
    expect(validateAssessmentTags({ purpose: null, summativeScope: null }, 'summative')).toBeNull();
    expect(validateAssessmentTags({}, 'formative')).toBeNull();
  });
});

describe('penyaringan tidak mengubah rumus nilai akhir', () => {
  const scores = (v: number) => [{ value: v, max: 100 }];
  const summative = [
    { weight: 40, scores: scores(80) },
    { weight: 60, scores: scores(90) },
  ];
  for (const mode of ['weighted_average', 'percentage', 'simple_average'] as const) {
    it(`mode ${mode}: nilai akhir dari komponen yang dihitung saja sama dengan tanpa formatif`, () => {
      const all = [
        { weight: 40, scores: scores(80), category: 'summative' as const },
        { weight: 60, scores: scores(90), category: 'summative' as const },
        { weight: 0, scores: scores(0), category: 'formative' as const },
      ];
      const counted = all.filter(componentCounts);
      expect(finalGrade(counted, mode)).toBe(finalGrade(summative, mode));
    });
  }
});

describe('salinan beku sparse dan versi', () => {
  const base = { id: 'a', name: 'Tugas', weight: 40, sort: 0 };
  it('komponen bawaan tidak membawa kunci kategori', () => {
    expect(sparseFrozenComponent({ ...base, category: 'summative', includeInFinal: true })).toEqual(base);
    expect(
      Object.keys(sparseFrozenComponent({ ...base, category: 'summative', includeInFinal: true })),
    ).toEqual(['id', 'name', 'weight', 'sort']);
  });
  it('formatif membawa kategori dan includeInFinal; versi 2 hanya bila ada isi v2', () => {
    const f = sparseFrozenComponent({
      id: 'b',
      name: 'Kuis',
      weight: 0,
      sort: 1,
      category: 'formative',
      includeInFinal: false,
    });
    expect(f).toEqual({
      id: 'b',
      name: 'Kuis',
      weight: 0,
      sort: 1,
      category: 'formative',
      includeInFinal: false,
    });
    expect(gradingConfigVersionOf([base])).toBe(1);
    expect(gradingConfigVersionOf([base, f])).toBe(2);
    expect(gradingConfigVersionOf([])).toBe(1);
  });
});
