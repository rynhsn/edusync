import { describe, expect, it } from 'vitest';
import { problemText, rangeText } from './choice-text';

/** Terjemahan palsu: mengembalikan kunci dan nilainya agar susunan kalimat bisa diperiksa. */
const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? JSON.stringify(values) : ''}`;

describe('teks peringatan pilihan', () => {
  it('rentang memakai bentuk yang sesuai batasnya', () => {
    expect(rangeText(t, 1, 1)).toBe('rangeExact{"min":1}');
    expect(rangeText(t, 4, 5)).toBe('rangeBetween{"min":4,"max":5}');
    expect(rangeText(t, 2, null)).toBe('rangeAtLeast{"min":2}');
    expect(rangeText(t, null, 3)).toBe('rangeAtMost{"max":3}');
    expect(rangeText(t, null, null)).toBe('');
  });

  it('kalimat masalah menyebut nama aturan, jumlah, dan rentang', () => {
    const base = { label: 'Seni', groupKey: 'arts', min: 1, max: 1, enforce: false };
    expect(problemText(t, { ...base, kind: 'notChosen', count: 0 })).toBe('problemNotChosen{"label":"Seni"}');
    expect(problemText(t, { ...base, kind: 'tooMany', count: 2 })).toContain('"count":2');
    const few = problemText(t, { ...base, kind: 'tooFew', count: 1, min: 2, max: 3 });
    expect(few.startsWith('problemTooFew')).toBe(true);
    expect(few).toContain('rangeBetween');
  });
});
