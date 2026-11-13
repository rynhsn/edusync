import { describe, expect, it } from 'vitest';
import {
  assessmentTags,
  averageOf,
  belowKkmApplies,
  categoryOf,
  componentBadgeKind,
  componentBody,
  componentFormFrom,
  countedWeightTotal,
  scopeKey,
  scopeValue,
  splitComponents,
  TECHNIQUE_OPTIONS,
  techniqueKey,
  techniqueValue,
  weightInputDisabled,
} from './assessment-category';
import { weightsTotal } from './calc-mode';

const summative = { weight: 30, category: undefined };
const formative = { weight: 0, category: 'formative' as const, includeInFinal: false as const };
const excluded = { weight: 10, category: undefined, includeInFinal: false as const };

describe('kategori komponen', () => {
  it('tanpa kategori = sumatif yang ikut nilai akhir (klien dan data lama)', () => {
    expect(categoryOf({})).toBe('summative');
    expect(componentBadgeKind(summative)).toBe('summative');
    expect(categoryOf(formative)).toBe('formative');
    expect(componentBadgeKind(formative)).toBe('formative');
  });
  it('sumatif yang dikeluarkan dari nilai akhir ditandai tersendiri', () => {
    expect(componentBadgeKind(excluded)).toBe('excluded');
  });
});

describe('jumlah bobot', () => {
  it('hanya menghitung sumatif yang ikut nilai akhir', () => {
    const items = [
      { weight: 40, category: undefined },
      { weight: 60, category: undefined },
      { ...formative, weight: 25 },
      excluded,
    ];
    expect(countedWeightTotal(items)).toBe(100);
    expect(weightsTotal(items)).toBe(100);
  });
  it('tanpa komponen formatif sama dengan penjumlahan biasa', () => {
    expect(weightsTotal([{ weight: 20 }, { weight: 30 }])).toBe(50);
    expect(weightsTotal([])).toBe(0);
  });
  it('semua formatif menghasilkan 0', () => {
    expect(weightsTotal([formative, formative])).toBe(0);
  });
});

describe('pemisahan komponen rekap dan statistik', () => {
  const comps = [
    { id: 'a', ...summative },
    { id: 'b', ...formative },
    { id: 'c', ...excluded },
  ];
  it('memisahkan yang dihitung dari umpan balik', () => {
    const { counted, feedback } = splitComponents(comps);
    expect(counted.map((c) => c.id)).toEqual(['a']);
    expect(feedback.map((c) => c.id)).toEqual(['b', 'c']);
  });
  it('umpan balik tidak pernah diwarnai di bawah KKM', () => {
    expect(belowKkmApplies(comps[0] as never, 60, 75)).toBe(true);
    expect(belowKkmApplies(comps[1] as never, 10, 75)).toBe(false);
    expect(belowKkmApplies(comps[2] as never, 10, 75)).toBe(false);
    expect(belowKkmApplies(comps[0] as never, null, 75)).toBe(false);
    expect(belowKkmApplies(comps[0] as never, 75, 75)).toBe(false);
  });
  it('rata-rata umpan balik mengabaikan nilai kosong', () => {
    expect(averageOf([80, null, 70, undefined])).toBe(75);
    expect(averageOf([null, undefined])).toBeNull();
    expect(averageOf([])).toBeNull();
    expect(averageOf([66.66, 70])).toBe(68.3);
  });
});

describe('formulir komponen', () => {
  it('bobot dinonaktifkan hanya untuk formatif', () => {
    expect(weightInputDisabled('formative')).toBe(true);
    expect(weightInputDisabled('summative')).toBe(false);
  });
  it('formatif tidak mengirim bobot', () => {
    expect(componentBody({ name: ' Kuis ', category: 'formative', weight: 30, sort: 2 })).toEqual({
      name: 'Kuis',
      sort: 2,
      category: 'formative',
    });
  });
  it('sumatif mengirim bobot dan tidak mengirim includeInFinal', () => {
    const body = componentBody({ name: 'UTS', category: 'summative', weight: 30, sort: 3 });
    expect(body).toEqual({ name: 'UTS', sort: 3, category: 'summative', weight: 30 });
    expect('includeInFinal' in body).toBe(false);
  });
  it('isian awal dari komponen yang ada', () => {
    expect(componentFormFrom({ weight: 30 })).toEqual({ category: 'summative', weight: '30' });
    expect(componentFormFrom(formative)).toEqual({ category: 'formative', weight: '' });
  });
});

describe('tanda penilaian', () => {
  it('formatif: hanya tujuan yang dikirim, lingkup dikosongkan', () => {
    expect(
      assessmentTags({ category: 'formative', initial: true, scope: 'material', technique: 'test' }),
    ).toEqual({ purpose: 'initial', summativeScope: null, technique: 'test' });
    expect(assessmentTags({ category: 'formative', initial: false, scope: '', technique: '' })).toEqual({
      purpose: null,
      summativeScope: null,
      technique: null,
    });
  });
  it('sumatif: hanya lingkup yang dikirim, tujuan dikosongkan', () => {
    expect(
      assessmentTags({ category: 'summative', initial: true, scope: 'end_of_semester', technique: '' }),
    ).toEqual({ purpose: null, summativeScope: 'end_of_semester', technique: null });
    expect(
      assessmentTags({ category: 'summative', initial: false, scope: '', technique: 'project' }),
    ).toEqual({
      purpose: null,
      summativeScope: null,
      technique: 'project',
    });
  });
});

describe('label teknik dan lingkup', () => {
  it('setiap teknik punya kunci terjemahan sendiri; nilai asing jatuh ke other', () => {
    for (const tq of TECHNIQUE_OPTIONS) expect(techniqueKey(tq)).toBe(`technique_${tq}`);
    expect(techniqueKey('hologram')).toBe('technique_other');
    expect(techniqueKey(null)).toBe('technique_other');
  });
  it('nilai asing dari server dibersihkan di formulir', () => {
    expect(techniqueValue('portfolio')).toBe('portfolio');
    expect(techniqueValue('hologram')).toBe('');
    expect(techniqueValue(null)).toBe('');
    expect(scopeValue('material')).toBe('material');
    expect(scopeValue('x')).toBe('');
    expect(scopeKey('end_of_semester')).toBe('scope_end_of_semester');
  });
});
