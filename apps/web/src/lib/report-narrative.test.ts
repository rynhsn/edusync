import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NARRATIVE_HIGH_TEMPLATE,
  exampleSentence,
  generatedSourceKey,
  narrativeSourceKey,
  objectiveLabel,
  parseMaxItems,
  staleRows,
  templateForSave,
  templateIssue,
  templateToField,
} from './report-narrative';

describe('label asal teks', () => {
  it('memetakan asal ke kunci pesan', () => {
    expect(narrativeSourceKey('manual')).toBe('sourceManual');
    expect(narrativeSourceKey('objectives')).toBe('sourceObjectives');
    expect(narrativeSourceKey('predicate')).toBe('sourcePredicate');
    expect(narrativeSourceKey(null)).toBeNull();
    expect(generatedSourceKey('objectives')).toBe('sourceObjectives');
    expect(generatedSourceKey('predicate')).toBe('sourcePredicate');
    expect(generatedSourceKey(null)).toBeNull();
  });
});

describe('templateIssue', () => {
  it('kosong sah, memuat {tp} sah', () => {
    expect(templateIssue('')).toBeUndefined();
    expect(templateIssue('   ')).toBeUndefined();
    expect(templateIssue('Sudah paham {tp}.')).toBeUndefined();
  });
  it('menolak tanpa {tp}', () => {
    expect(templateIssue('Sudah paham.')).toEqual({
      code: 'custom',
      key: 'reportCards.templateNeedsTp',
      values: { tp: '{tp}' },
    });
  });
  it('menolak lebih dari 300 karakter', () => {
    expect(templateIssue(`{tp}${'a'.repeat(296)}`)).toBeUndefined();
    expect(templateIssue(`{tp}${'a'.repeat(297)}`)).toEqual({ code: 'tooLong', max: 300 });
  });
});

describe('exampleSentence', () => {
  it('memakai templat isian bila sah', () => {
    expect(exampleSentence('Mahir {tp}!', 'high', 'menjumlah')).toBe('Mahir menjumlah!');
  });
  it('kembali ke templat bawaan bila kosong atau tidak sah', () => {
    const expected = DEFAULT_NARRATIVE_HIGH_TEMPLATE.replace('{tp}', 'menjumlah');
    expect(exampleSentence('', 'high', 'menjumlah')).toBe(expected);
    expect(exampleSentence('tanpa penanda', 'high', 'menjumlah')).toBe(expected);
    expect(exampleSentence('', 'low', 'menjumlah')).toBe('Perlu bimbingan dalam menjumlah.');
  });
  it('mengganti semua {tp}', () => {
    expect(exampleSentence('{tp} dan {tp}', 'low', 'x')).toBe('x dan x');
  });
});

describe('isian pengaturan', () => {
  it('parseMaxItems membatasi 1-5', () => {
    expect(parseMaxItems('3')).toBe(3);
    expect(parseMaxItems('0')).toBe(2);
    expect(parseMaxItems('6')).toBe(2);
    expect(parseMaxItems('x')).toBe(2);
  });
  it('templat kosong dikirim null', () => {
    expect(templateForSave('  ')).toBeNull();
    expect(templateForSave(' Baik {tp} ')).toBe('Baik {tp}');
    expect(templateToField(null)).toBe('');
    expect(templateToField('a {tp}')).toBe('a {tp}');
  });
});

describe('staleRows', () => {
  it('hanya baris usang yang belum final', () => {
    const rows = [
      { id: 1, stale: true, locked: false },
      { id: 2, stale: true, locked: true },
      { id: 3, locked: false },
    ];
    expect(staleRows(rows).map((r) => r.id)).toEqual([1]);
  });
});

describe('objectiveLabel', () => {
  it('kode bila ada', () => {
    expect(objectiveLabel({ code: 'TP1', text: 'Menjumlah' })).toBe('TP1 Menjumlah');
    expect(objectiveLabel({ code: null, text: 'Menjumlah' })).toBe('Menjumlah');
  });
});
