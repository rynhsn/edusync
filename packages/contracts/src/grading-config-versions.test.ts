import { describe, expect, it } from 'vitest';
import {
  assertReadableGradingConfigVersion,
  DEFAULT_OBJECTIVE_AGGREGATION,
  DEFAULT_REMEDIAL_POLICY,
  FROZEN_COMPONENT_DEFAULTS,
  frozenComponentsSchema,
  frozenGradingConfigSchema,
  GRADING_CONFIG_READABLE_VERSIONS,
  GRADING_CONFIG_VERSION,
  isReadableGradingConfigVersion,
  omitDefaults,
  resolveFrozenGradingConfig,
  sparseFrozenComponent,
} from './grading-config';

const id = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const id2 = '019bbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';
const subjectId = '019ccccc-cccc-7ccc-8ccc-cccccccccccc';
const objectiveId = '019ddddd-dddd-7ddd-8ddd-dddddddddddd';

const base = {
  kkm: 75,
  predicateA: 90,
  predicateB: 80,
  predicateC: 70,
  calculationMode: 'weighted_average' as const,
  components: [
    { id, name: 'Tugas', weight: 40, sort: 0 },
    { id: id2, name: 'UAS', weight: 60, sort: 1 },
  ],
  criteria: [],
};

const objectiveCriteria = {
  id: '019eeeee-eeee-7eee-8eee-eeeeeeeeeeee',
  subjectId,
  mode: 'numeric' as const,
  threshold: 70,
  levelCode: null,
  programId: null,
  objectiveId,
  active: true as const,
  levels: [],
};

describe('versi salinan beku', () => {
  it('penulis tetap versi 1; pembaca menerima 1 dan 2 dan menolak yang lain', () => {
    expect(GRADING_CONFIG_VERSION).toBe(1);
    expect([...GRADING_CONFIG_READABLE_VERSIONS]).toEqual([1, 2]);
    expect(isReadableGradingConfigVersion(1)).toBe(true);
    expect(isReadableGradingConfigVersion(2)).toBe(true);
    expect(isReadableGradingConfigVersion(0)).toBe(false);
    expect(isReadableGradingConfigVersion(3)).toBe(false);
    expect(() => assertReadableGradingConfigVersion(3)).toThrow(/tidak dikenali/);
  });
});

describe('komponen beku v1 dan v2', () => {
  it('menerima bentuk v1 tanpa kunci baru, dan v2 dengan category/includeInFinal', () => {
    const v1 = frozenComponentsSchema.parse(base.components);
    expect(v1[0]).toEqual({ id, name: 'Tugas', weight: 40, sort: 0 });
    const v2 = frozenComponentsSchema.parse([
      { id, name: 'Kuis', weight: 0, sort: 0, category: 'formative', includeInFinal: false },
    ]);
    expect(v2[0]).toMatchObject({ category: 'formative', includeInFinal: false });
  });

  it('menolak kategori yang tidak dikenal dan bobot desimal (aturan v1 tetap)', () => {
    expect(() =>
      frozenComponentsSchema.parse([{ id, name: 'X', weight: 1, sort: 0, category: 'diagnostik' }]),
    ).toThrow();
    expect(() => frozenComponentsSchema.parse([{ id, name: 'X', weight: 1.5, sort: 0 }])).toThrow();
  });

  it('skema konfigurasi utuh menerima v1 dan kunci v2 opsional', () => {
    expect(frozenGradingConfigSchema.parse(base)).toEqual(base);
    const v2 = frozenGradingConfigSchema.parse({
      ...base,
      objectiveCriteria: [objectiveCriteria],
      objectiveAggregation: 'latest',
      remedialPolicy: 'cap_at_criteria',
    });
    expect(v2.objectiveAggregation).toBe('latest');
    expect(v2.objectiveCriteria).toHaveLength(1);
    expect(() => frozenGradingConfigSchema.parse({ ...base, remedialPolicy: 'tebak' })).toThrow();
  });
});

describe('omitDefaults dan penulisan sparse (R3)', () => {
  it('membuang kunci bernilai bawaan dan undefined, mempertahankan sisanya', () => {
    expect(omitDefaults({ a: 1, b: 'x', c: undefined, d: true }, { a: 1, d: false })).toEqual({
      b: 'x',
      d: true,
    });
    // Kunci yang tidak punya bawaan tidak pernah dibuang, termasuk null dan 0.
    expect(omitDefaults({ a: 0, b: null }, { c: 1 } as never)).toEqual({ a: 0, b: null });
  });

  it('komponen bawaan (sumatif, ikut nilai akhir) tetap berbentuk v1 persis', () => {
    const v1 = { id, name: 'Tugas', weight: 40, sort: 0 };
    expect(sparseFrozenComponent({ ...v1, category: 'summative', includeInFinal: true })).toEqual(v1);
    expect(sparseFrozenComponent(v1)).toEqual(v1);
    // Urutan dan isi kunci sama, sehingga jsonb dan perbandingan kanonik tidak bergeser.
    expect(JSON.stringify(sparseFrozenComponent({ ...v1, category: 'summative' }))).toBe(JSON.stringify(v1));
  });

  it('hanya yang bukan bawaan yang ditulis', () => {
    const v1 = { id, name: 'Kuis', weight: 0, sort: 2 };
    expect(sparseFrozenComponent({ ...v1, category: 'formative', includeInFinal: false })).toEqual({
      ...v1,
      category: 'formative',
      includeInFinal: false,
    });
    expect(sparseFrozenComponent({ ...v1, category: 'summative', includeInFinal: false })).toEqual({
      ...v1,
      includeInFinal: false,
    });
    expect(FROZEN_COMPONENT_DEFAULTS).toEqual({ category: 'summative', includeInFinal: true });
  });
});

describe('resolveFrozenGradingConfig (pembaca lintas versi)', () => {
  it('v1: kunci yang hilang ditafsirkan sebagai bawaan (sumatif, tanpa kriteria TP, rata-rata, record_only)', () => {
    const r = resolveFrozenGradingConfig({ ...base, configVersion: 1 });
    expect(r.components.map((c) => [c.name, c.category, c.includeInFinal])).toEqual([
      ['Tugas', 'summative', true],
      ['UAS', 'summative', true],
    ]);
    expect(r.objectiveCriteria).toEqual([]);
    expect(r.objectiveAggregation).toBe(DEFAULT_OBJECTIVE_AGGREGATION);
    expect(r.objectiveAggregation).toBe('mean');
    expect(r.remedialPolicy).toBe(DEFAULT_REMEDIAL_POLICY);
    expect(r.remedialPolicy).toBe('record_only');
    expect(r).toMatchObject({ configVersion: 1, kkm: 75, calculationMode: 'weighted_average' });
  });

  it('v2 yang tidak memakai fitur baru sama persis dengan v1 (selain nomor versi)', () => {
    const v1 = resolveFrozenGradingConfig({ ...base, configVersion: 1 });
    const v2 = resolveFrozenGradingConfig({
      ...base,
      configVersion: 2,
      objectiveCriteria: [],
      objectiveAggregation: null,
      remedialPolicy: null,
    });
    expect({ ...v2, configVersion: 1 }).toEqual(v1);
  });

  it('v2 dengan isi: kategori, kriteria TP, agregasi, dan kebijakan terbaca', () => {
    const r = resolveFrozenGradingConfig({
      ...base,
      configVersion: 2,
      components: [
        { id, name: 'Tugas', weight: 100, sort: 0 },
        { id: id2, name: 'Kuis', weight: 0, sort: 1, category: 'formative', includeInFinal: false },
      ],
      objectiveCriteria: [objectiveCriteria],
      objectiveAggregation: 'max',
      remedialPolicy: 'replace_latest',
    });
    expect(r.components.map((c) => [c.name, c.category, c.includeInFinal])).toEqual([
      ['Tugas', 'summative', true],
      ['Kuis', 'formative', false],
    ]);
    expect(r.objectiveCriteria[0]).toMatchObject({ objectiveId, threshold: 70 });
    expect(r.objectiveAggregation).toBe('max');
    expect(r.remedialPolicy).toBe('replace_latest');
  });

  it('kunci kriteria v1 tetap ketat: kriteria ber-TP tidak boleh masuk kolom criteria', () => {
    expect(() =>
      resolveFrozenGradingConfig({ ...base, configVersion: 1, criteria: [objectiveCriteria] as never }),
    ).toThrow();
    // Sebaliknya, kolom objective_criteria menolak baris tanpa TP.
    expect(() =>
      resolveFrozenGradingConfig({
        ...base,
        configVersion: 2,
        objectiveCriteria: [{ ...objectiveCriteria, objectiveId: null }],
      }),
    ).toThrow();
  });

  it('versi yang tidak dikenal ditolak dengan galat jelas', () => {
    expect(() => resolveFrozenGradingConfig({ ...base, configVersion: 3 })).toThrow(/tidak dikenali/);
    expect(() => resolveFrozenGradingConfig({ ...base, configVersion: 0 })).toThrow(/tidak dikenali/);
  });
});
