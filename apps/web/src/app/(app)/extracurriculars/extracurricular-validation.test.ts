import { describe, expect, it } from 'vitest';
import {
  type ExtracurricularValues,
  validateAddMembers,
  validateCategory,
  validateExtracurricular,
  validateSession,
} from './extracurricular-validation';

const ok: ExtracurricularValues = {
  name: 'Pramuka',
  description: '',
  coachType: 'none',
  coachTeacherId: '',
  externalCoach: '',
  startsAt: '',
  endsAt: '',
  location: '',
};

describe('validateExtracurricular', () => {
  it('menerima isian minimal', () => expect(validateExtracurricular(ok)).toEqual({}));
  it('nama wajib dan maksimal 100', () => {
    expect(validateExtracurricular({ ...ok, name: ' ' }).name).toEqual({ code: 'required' });
    expect(validateExtracurricular({ ...ok, name: 'a'.repeat(101) }).name).toEqual({
      code: 'tooLong',
      max: 100,
    });
  });
  it('pembina guru wajib memilih guru, pelatih luar wajib nama', () => {
    expect(validateExtracurricular({ ...ok, coachType: 'teacher' }).coachTeacherId).toEqual({
      code: 'choose',
    });
    expect(validateExtracurricular({ ...ok, coachType: 'external' }).externalCoach).toEqual({
      code: 'required',
    });
    expect(validateExtracurricular({ ...ok, coachType: 'none' })).toEqual({});
  });
  it('jam selesai harus setelah jam mulai', () => {
    expect(validateExtracurricular({ ...ok, startsAt: '16:00', endsAt: '15:00' }).endsAt).toEqual({
      code: 'timeOrder',
    });
    expect(validateExtracurricular({ ...ok, startsAt: '15:00', endsAt: '16:00' })).toEqual({});
  });
  it('lokasi maksimal 100 dan deskripsi 500', () => {
    expect(validateExtracurricular({ ...ok, location: 'a'.repeat(101) }).location).toEqual({
      code: 'tooLong',
      max: 100,
    });
    expect(validateExtracurricular({ ...ok, description: 'a'.repeat(501) }).description).toEqual({
      code: 'tooLong',
      max: 500,
    });
  });
});

describe('validateCategory / validateSession', () => {
  it('nama kategori wajib, maksimal 50', () => {
    expect(validateCategory({ label: '' }).label).toEqual({ code: 'required' });
    expect(validateCategory({ label: 'a'.repeat(51) }).label).toEqual({ code: 'tooLong', max: 50 });
    expect(validateCategory({ label: 'Olahraga' })).toEqual({});
  });
  it('tanggal pertemuan wajib, topik maksimal 200', () => {
    expect(validateSession({ date: '', topic: '' }).date).toEqual({ code: 'required' });
    expect(validateSession({ date: '2026-05-01', topic: 'a'.repeat(201) }).topic).toEqual({
      code: 'tooLong',
      max: 200,
    });
    expect(validateSession({ date: '2026-05-01', topic: '' })).toEqual({});
  });
});

describe('validateAddMembers', () => {
  it('kelas wajib dipilih dulu', () => {
    expect(validateAddMembers({ classId: '', picked: 0 })).toEqual({ classId: { code: 'choose' } });
  });
  it('setelah kelas dipilih, minimal satu siswa', () => {
    expect(validateAddMembers({ classId: 'c', picked: 0 })).toEqual({ picked: { code: 'choose' } });
    expect(validateAddMembers({ classId: 'c', picked: 2 })).toEqual({});
  });
});
