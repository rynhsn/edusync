import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  configToDraft,
  effectiveHours,
  hasSuggestion,
  levelConfigPatch,
  parseBounded,
  programConfigPatch,
  programConfigToDraft,
} from './level-config';

describe('parseBounded', () => {
  it('kosong menjadi null, angka dalam rentang diterima, selain itu tidak valid', () => {
    expect(parseBounded('', 1, 300)).toBeNull();
    expect(parseBounded(' 45 ', 1, 300)).toBe(45);
    expect(parseBounded('300', 1, 300)).toBe(300);
    for (const bad of ['0', '301', '-5', '4.5', 'abc', '1000']) {
      expect(parseBounded(bad, 1, 300), bad).toBe('invalid');
    }
  });
});

describe('levelConfigPatch', () => {
  const saved = { periodMinutes: 45, effectiveWeeks: null };
  it('tanpa perubahan tidak mengirim apa pun', () => {
    expect(levelConfigPatch(saved, configToDraft(saved))).toEqual({ body: {}, invalid: [] });
  });
  it('hanya mengirim field yang berubah', () => {
    expect(levelConfigPatch(saved, { periodMinutes: '45', effectiveWeeks: '36' })).toEqual({
      body: { effectiveWeeks: 36 },
      invalid: [],
    });
    expect(levelConfigPatch(saved, { periodMinutes: '40', effectiveWeeks: '' })).toEqual({
      body: { periodMinutes: 40 },
      invalid: [],
    });
  });
  it('mengosongkan isian yang tersimpan mengirim null', () => {
    expect(levelConfigPatch(saved, { periodMinutes: '', effectiveWeeks: '' }).body).toEqual({
      periodMinutes: null,
    });
  });
  it('isian tidak valid dilaporkan dan tidak dikirim', () => {
    expect(levelConfigPatch(saved, { periodMinutes: 'x', effectiveWeeks: '70' })).toEqual({
      body: {},
      invalid: ['periodMinutes', 'effectiveWeeks'],
    });
  });
  it('data lama tanpa field dianggap kosong', () => {
    expect(levelConfigPatch({}, { periodMinutes: '', effectiveWeeks: '' }).body).toEqual({});
  });
});

describe('saran', () => {
  it('mengisi hanya dari saran yang ada dan tidak menimpa dengan null', () => {
    const draft = { periodMinutes: '', effectiveWeeks: '30' };
    expect(applySuggestion(draft, { periodMinutes: 45, effectiveWeeks: 36 })).toEqual({
      periodMinutes: '45',
      effectiveWeeks: '36',
    });
    expect(applySuggestion(draft, { periodMinutes: null, effectiveWeeks: null })).toEqual(draft);
  });
  it('hasSuggestion', () => {
    expect(hasSuggestion(null)).toBe(false);
    expect(hasSuggestion({ periodMinutes: null, effectiveWeeks: null })).toBe(false);
    expect(hasSuggestion({ periodMinutes: 45, effectiveWeeks: null })).toBe(true);
  });
});

describe('effectiveHours', () => {
  it('JP tahunan kali menit dibagi 60, satu desimal', () => {
    expect(effectiveHours(72, 45)).toBe(54);
    expect(effectiveHours(70, 40)).toBe(46.7);
  });
  it('null bila menit belum diatur', () => {
    expect(effectiveHours(72, null)).toBeNull();
    expect(effectiveHours(72, undefined)).toBeNull();
    expect(effectiveHours(72, 0)).toBeNull();
  });
});

describe('konfigurasi program', () => {
  it('program baru mengirim hanya yang terisi', () => {
    expect(programConfigPatch({}, { durationYears: '', finalLevelCode: '' })).toEqual({});
    expect(programConfigPatch({}, { durationYears: '4', finalLevelCode: 'XIII' })).toEqual({
      durationYears: 4,
      finalLevelCode: 'XIII',
    });
  });
  it('program yang diubah mengirim hanya yang berubah; mengosongkan mengirim null', () => {
    const saved = { durationYears: 4, finalLevelCode: 'XIII' };
    expect(programConfigPatch(saved, programConfigToDraft(saved))).toEqual({});
    expect(programConfigPatch(saved, { durationYears: '3', finalLevelCode: 'XIII' })).toEqual({
      durationYears: 3,
    });
    expect(programConfigPatch(saved, { durationYears: '4', finalLevelCode: '' })).toEqual({
      finalLevelCode: null,
    });
  });
  it('draft dari data lama tanpa field', () => {
    expect(programConfigToDraft({})).toEqual({ durationYears: '', finalLevelCode: '' });
    expect(programConfigToDraft({ durationYears: null, finalLevelCode: null })).toEqual({
      durationYears: '',
      finalLevelCode: '',
    });
  });
});
