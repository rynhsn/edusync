import { describe, expect, it } from 'vitest';
import { frozenComponentsSchema, frozenCriteriaListSchema, GRADING_CONFIG_VERSION } from './grading-config';

const id = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

describe('salinan beku konfigurasi nilai', () => {
  it('versi bentuk saat ini 1', () => {
    expect(GRADING_CONFIG_VERSION).toBe(1);
  });

  it('komponen: menerima bentuk sah dan menolak bobot desimal', () => {
    expect(frozenComponentsSchema.parse([{ id, name: 'Tugas', weight: 40, sort: 0 }])).toHaveLength(1);
    expect(() => frozenComponentsSchema.parse([{ id, name: 'Tugas', weight: 40.5, sort: 0 }])).toThrow();
  });

  it('kriteria: hanya baris aktif tanpa TP', () => {
    const base = {
      id,
      subjectId: id,
      mode: 'numeric',
      threshold: 70,
      levelCode: null,
      programId: null,
      levels: [],
    };
    expect(frozenCriteriaListSchema.parse([{ ...base, objectiveId: null, active: true }])).toHaveLength(1);
    expect(() => frozenCriteriaListSchema.parse([{ ...base, objectiveId: id, active: true }])).toThrow();
    expect(() => frozenCriteriaListSchema.parse([{ ...base, objectiveId: null, active: false }])).toThrow();
  });
});
