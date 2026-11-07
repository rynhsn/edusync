import { describe, expect, it } from 'vitest';
import {
  IDENTITY_FIELDS,
  semestersIssue,
  validateGeneral,
  validateIdentity,
  validateLevelCreate,
  validateLevelEdit,
  websiteIssue,
} from './school-settings-validation';

const general = {
  workingDayCount: 5,
  semesterNames: ['Ganjil', 'Genap'],
  lessonStart: '07:00',
  lessonMinutes: 45,
};

describe('validateGeneral', () => {
  it('menerima isian bawaan', () => expect(validateGeneral(general)).toEqual({}));
  it('minimal satu hari efektif', () => {
    expect(validateGeneral({ ...general, workingDayCount: 0 }).workingDays).toMatchObject({
      code: 'custom',
      key: 'schoolSettings.daysInvalid',
    });
  });
  it('durasi jam pelajaran 10-180 bilangan bulat', () => {
    expect(validateGeneral({ ...general, lessonMinutes: 9 }).lessonMinutes).toEqual({
      code: 'range',
      min: 10,
      max: 180,
    });
    expect(validateGeneral({ ...general, lessonMinutes: 181 }).lessonMinutes).toEqual({
      code: 'range',
      min: 10,
      max: 180,
    });
    expect(validateGeneral({ ...general, lessonMinutes: Number.NaN }).lessonMinutes).toEqual({
      code: 'required',
    });
    expect(validateGeneral({ ...general, lessonMinutes: 45.5 }).lessonMinutes).toEqual({
      code: 'intInvalid',
    });
  });
  it('jam mulai wajib', () => {
    expect(validateGeneral({ ...general, lessonStart: '' }).lessonStart).toEqual({ code: 'required' });
  });
});

describe('semestersIssue', () => {
  it('menolak kosong dan kembar tanpa membedakan huruf', () => {
    expect(semestersIssue(['Ganjil', ' '])).toMatchObject({ key: 'schoolSettings.semesterInvalid' });
    expect(semestersIssue(['Ganjil', 'ganjil'])).toMatchObject({ key: 'schoolSettings.semesterInvalid' });
    expect(semestersIssue(['Ganjil', 'Genap'])).toBeUndefined();
  });
  it('maksimal 40 karakter', () => {
    expect(semestersIssue(['a'.repeat(41)])).toEqual({ code: 'tooLong', max: 40 });
  });
});

describe('tingkat', () => {
  it('kode wajib, huruf angka . _ -, maksimal 20', () => {
    expect(validateLevelCreate({ code: '', label: 'Kelas 7', sort: '' }).code).toEqual({ code: 'required' });
    expect(validateLevelCreate({ code: 'a b', label: 'Kelas 7', sort: '' }).code).toEqual({
      code: 'codeFormat',
    });
    expect(validateLevelCreate({ code: 'a'.repeat(21), label: 'x', sort: '' }).code).toEqual({
      code: 'tooLong',
      max: 20,
    });
    expect(validateLevelCreate({ code: '7', label: 'Kelas 7', sort: '' })).toEqual({});
  });
  it('urutan opsional saat tambah, wajib saat ubah, 0-10000', () => {
    expect(validateLevelCreate({ code: '7', label: 'x', sort: '10001' }).sort).toEqual({
      code: 'range',
      min: 0,
      max: 10000,
    });
    expect(validateLevelEdit({ label: 'x', sort: '' }).sort).toEqual({ code: 'required' });
    expect(validateLevelEdit({ label: '', sort: '0' }).label).toEqual({ code: 'required' });
    expect(validateLevelEdit({ label: 'x', sort: '0' })).toEqual({});
  });
});

describe('identitas', () => {
  const empty = Object.fromEntries(IDENTITY_FIELDS.map((f) => [f, ''])) as Record<
    (typeof IDENTITY_FIELDS)[number],
    string
  >;
  it('semua kosong lolos', () => expect(validateIdentity(empty)).toEqual({}));
  it('email harus valid, batas panjang tiap isian', () => {
    const r = validateIdentity({
      ...empty,
      email: 'x',
      postalCode: '1'.repeat(11),
      street: 'a'.repeat(301),
      city: 'a'.repeat(101),
    });
    expect(r.email).toEqual({ code: 'email' });
    expect(r.postalCode).toEqual({ code: 'tooLong', max: 10 });
    expect(r.street).toEqual({ code: 'tooLong', max: 300 });
    expect(r.city).toEqual({ code: 'tooLong', max: 100 });
  });
  it('situs web tanpa skema dilengkapi https:// sebelum diperiksa', () => {
    expect(websiteIssue('www.sekolah.sch.id')).toBeUndefined();
    expect(websiteIssue('')).toBeUndefined();
    expect(websiteIssue('a b')).toEqual({ code: 'urlInvalid' });
  });
});
