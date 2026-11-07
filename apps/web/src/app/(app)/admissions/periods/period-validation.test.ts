import { describe, expect, it } from 'vitest';
import { ADMISSION_PERIOD_ORDER, validateAdmissionPeriod, validateDocType } from './period-validation';

const ok = {
  name: 'Gelombang 1',
  level: '7',
  academicYearId: '3f1c0b0e-0000-4000-8000-000000000001',
  opensOn: '2027-01-05',
  closesOn: '2027-03-05',
  quota: '120',
};

describe('validateAdmissionPeriod', () => {
  it('menerima isian benar, kuota boleh kosong', () => {
    expect(validateAdmissionPeriod(ok)).toEqual({});
    expect(validateAdmissionPeriod({ ...ok, quota: '' })).toEqual({});
  });

  it('semua isian wajib kosong salah menurut urutan formulir', () => {
    const errors = validateAdmissionPeriod({
      name: '',
      level: '',
      academicYearId: '',
      opensOn: '',
      closesOn: '',
      quota: '',
    });
    expect(Object.keys(errors)).toEqual(ADMISSION_PERIOD_ORDER.filter((k) => k !== 'quota'));
    expect(errors.academicYearId).toEqual({ code: 'choose' });
  });

  it('batas panjang nama (120) dan tingkat (30)', () => {
    expect(validateAdmissionPeriod({ ...ok, name: 'x'.repeat(121) }).name).toEqual({
      code: 'tooLong',
      max: 120,
    });
    expect(validateAdmissionPeriod({ ...ok, level: 'x'.repeat(31) }).level).toEqual({
      code: 'tooLong',
      max: 30,
    });
  });

  it('tanggal tutup boleh sama dengan buka tetapi tidak sebelumnya', () => {
    expect(validateAdmissionPeriod({ ...ok, closesOn: ok.opensOn }).closesOn).toBeUndefined();
    expect(validateAdmissionPeriod({ ...ok, closesOn: '2026-12-31' }).closesOn).toMatchObject({
      code: 'custom',
      key: 'areaForms.closeNotBeforeOpen',
    });
  });

  it('kuota: bulat 1 sampai 100.000', () => {
    expect(validateAdmissionPeriod({ ...ok, quota: '0' }).quota).toEqual({
      code: 'range',
      min: 1,
      max: 100000,
    });
    expect(validateAdmissionPeriod({ ...ok, quota: '100001' }).quota).toEqual({
      code: 'range',
      min: 1,
      max: 100000,
    });
    expect(validateAdmissionPeriod({ ...ok, quota: '12,5' }).quota).toEqual({ code: 'intInvalid' });
    expect(validateAdmissionPeriod({ ...ok, quota: '100000' }).quota).toBeUndefined();
  });
});

describe('validateDocType', () => {
  it('nama wajib dan maksimal 60', () => {
    expect(validateDocType({ label: '' }).label).toEqual({ code: 'required' });
    expect(validateDocType({ label: 'x'.repeat(61) }).label).toEqual({ code: 'tooLong', max: 60 });
    expect(validateDocType({ label: 'Akta kelahiran' })).toEqual({});
  });
});
