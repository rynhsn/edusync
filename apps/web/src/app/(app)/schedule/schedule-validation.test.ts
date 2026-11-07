import { describe, expect, it } from 'vitest';
import { validateGenerate, validatePeriod } from './schedule-validation';

const gen = { firstStart: '07:00', count: '8', minutes: '45', breakAfter: '', breakMinutes: '15' };

describe('validateGenerate', () => {
  it('menerima isian bawaan', () => expect(validateGenerate(gen)).toEqual({}));
  it('jumlah jam 1-14 dan durasi 10-120', () => {
    expect(validateGenerate({ ...gen, count: '0' }).count).toEqual({ code: 'range', min: 1, max: 14 });
    expect(validateGenerate({ ...gen, count: '' }).count).toEqual({ code: 'required' });
    expect(validateGenerate({ ...gen, minutes: '9' }).minutes).toEqual({ code: 'range', min: 10, max: 120 });
    expect(validateGenerate({ ...gen, minutes: '4.5' }).minutes).toEqual({ code: 'intInvalid' });
  });
  it('istirahat opsional: lama diperiksa hanya bila jam istirahat diisi', () => {
    expect(validateGenerate({ ...gen, breakMinutes: '1' })).toEqual({});
    expect(validateGenerate({ ...gen, breakAfter: '4', breakMinutes: '1' }).breakMinutes).toEqual({
      code: 'range',
      min: 5,
      max: 90,
    });
    expect(validateGenerate({ ...gen, breakAfter: '14' }).breakAfter).toEqual({
      code: 'range',
      min: 1,
      max: 13,
    });
  });
  it('jam pertama wajib', () => {
    expect(validateGenerate({ ...gen, firstStart: '' }).firstStart).toEqual({ code: 'required' });
  });
});

describe('validatePeriod', () => {
  it('semua wajib', () => {
    expect(Object.keys(validatePeriod({ number: '', startsAt: '', endsAt: '' }))).toEqual([
      'number',
      'startsAt',
      'endsAt',
    ]);
  });
  it('nomor 1-20', () => {
    expect(validatePeriod({ number: '21', startsAt: '07:00', endsAt: '07:45' }).number).toEqual({
      code: 'range',
      min: 1,
      max: 20,
    });
  });
  it('jam selesai harus setelah jam mulai', () => {
    expect(validatePeriod({ number: '1', startsAt: '08:00', endsAt: '07:00' }).endsAt).toEqual({
      code: 'timeOrder',
    });
    expect(validatePeriod({ number: '1', startsAt: '07:00', endsAt: '07:45' })).toEqual({});
  });
});
