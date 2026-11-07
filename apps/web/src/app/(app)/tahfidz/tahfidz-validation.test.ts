import { describe, expect, it } from 'vitest';
import { validateAddMembers, validateEntry, validateHalaqah, validateIbadahItem } from './tahfidz-validation';

describe('validateHalaqah', () => {
  it('nama wajib dan maksimal 100', () => {
    expect(validateHalaqah({ name: ' ', scheduleNote: '' }).name).toEqual({ code: 'required' });
    expect(validateHalaqah({ name: 'a'.repeat(101), scheduleNote: '' }).name).toEqual({
      code: 'tooLong',
      max: 100,
    });
    expect(validateHalaqah({ name: 'Halaqah A', scheduleNote: '' })).toEqual({});
  });
  it('jadwal opsional maksimal 200', () => {
    expect(validateHalaqah({ name: 'A', scheduleNote: 'x'.repeat(201) }).scheduleNote).toEqual({
      code: 'tooLong',
      max: 200,
    });
  });
});

describe('validateIbadahItem', () => {
  it('nama wajib dan maksimal 100', () => {
    expect(validateIbadahItem({ name: '' }).name).toEqual({ code: 'required' });
    expect(validateIbadahItem({ name: 'a'.repeat(101) }).name).toEqual({ code: 'tooLong', max: 100 });
    expect(validateIbadahItem({ name: 'Salat Dhuha' })).toEqual({});
  });
});

describe('validateAddMembers', () => {
  it('butuh kelas lalu minimal satu siswa', () => {
    expect(validateAddMembers({ classId: '', picked: 0 })).toEqual({ classId: { code: 'choose' } });
    expect(validateAddMembers({ classId: 'c', picked: 0 })).toEqual({ picked: { code: 'choose' } });
    expect(validateAddMembers({ classId: 'c', picked: 1 })).toEqual({});
  });
});

describe('validateEntry', () => {
  const ok = { studentId: 's', date: '2026-05-01', rangeValid: true, note: '' };
  it('menerima isian lengkap', () => expect(validateEntry(ok)).toEqual({}));
  it('siswa wajib dipilih', () => {
    expect(validateEntry({ ...ok, studentId: '' }).studentId).toEqual({ code: 'choose' });
  });
  it('rentang ayat tidak valid memakai pesan tahfidz.rangeInvalid', () => {
    expect(validateEntry({ ...ok, rangeValid: false }).ayahTo).toMatchObject({
      code: 'custom',
      key: 'tahfidz.rangeInvalid',
    });
  });
  it('catatan maksimal 300', () => {
    expect(validateEntry({ ...ok, note: 'x'.repeat(301) }).note).toEqual({ code: 'tooLong', max: 300 });
  });
});
