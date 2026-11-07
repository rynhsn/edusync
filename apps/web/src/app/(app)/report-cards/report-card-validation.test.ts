import { describe, expect, it } from 'vitest';
import {
  REPORT_SETTINGS_ORDER,
  validateHomeroomNote,
  validateReportSettings,
} from './report-card-validation';

const ok = {
  principalName: 'Drs. Ahmad',
  principalNip: '19700101',
  city: 'Bandung',
  address: 'Jl. Merdeka 1',
  descA: 'Sangat baik',
  descB: 'Baik',
  descC: 'Cukup',
  descD: 'Perlu bimbingan',
};

describe('validateHomeroomNote', () => {
  it('opsional, maksimal 500', () => {
    expect(validateHomeroomNote('')).toEqual({});
    expect(validateHomeroomNote('x'.repeat(500))).toEqual({});
    expect(validateHomeroomNote('x'.repeat(501)).note).toEqual({ code: 'tooLong', max: 500 });
  });
});

describe('validateReportSettings', () => {
  it('menerima isian benar; penandatangan boleh kosong', () => {
    expect(validateReportSettings(ok)).toEqual({});
    expect(
      validateReportSettings({ ...ok, principalName: '', principalNip: '', city: '', address: '' }),
    ).toEqual({});
  });

  it('deskripsi A sampai D wajib', () => {
    const e = validateReportSettings({ ...ok, descA: '', descB: ' ', descC: '', descD: '' });
    expect(Object.keys(e)).toEqual(['descA', 'descB', 'descC', 'descD']);
    expect(e.descB).toEqual({ code: 'required' });
  });

  it('batas panjang mengikuti API', () => {
    expect(validateReportSettings({ ...ok, principalName: 'x'.repeat(121) }).principalName).toEqual({
      code: 'tooLong',
      max: 120,
    });
    expect(validateReportSettings({ ...ok, principalNip: 'x'.repeat(41) }).principalNip).toEqual({
      code: 'tooLong',
      max: 40,
    });
    expect(validateReportSettings({ ...ok, city: 'x'.repeat(81) }).city).toEqual({
      code: 'tooLong',
      max: 80,
    });
    expect(validateReportSettings({ ...ok, address: 'x'.repeat(301) }).address).toEqual({
      code: 'tooLong',
      max: 300,
    });
    expect(validateReportSettings({ ...ok, descD: 'x'.repeat(501) }).descD).toEqual({
      code: 'tooLong',
      max: 500,
    });
  });

  it('urutan fokus mengikuti formulir', () => {
    const e = validateReportSettings({ ...ok, descA: '', city: 'x'.repeat(81) });
    expect(Object.keys(e).sort()).toEqual(['city', 'descA']);
    expect(REPORT_SETTINGS_ORDER.indexOf('city')).toBeLessThan(REPORT_SETTINGS_ORDER.indexOf('descA'));
  });
});
