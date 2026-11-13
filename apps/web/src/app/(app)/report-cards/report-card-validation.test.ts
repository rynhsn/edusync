import { describe, expect, it } from 'vitest';
import {
  REPORT_SETTINGS_ORDER,
  validateHomeroomNote,
  validateReportSettings,
  validateResponseText,
  validateSections,
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

describe('validateReportSettings: lama jendela tanggapan', () => {
  it('kosong berarti tanpa batas; 1 sampai 365 diterima', () => {
    for (const v of ['', ' ', '1', '30', '365']) {
      expect(validateReportSettings({ ...ok, responseWindowDays: v }).responseWindowDays, v).toBeUndefined();
    }
  });
  it('menolak 0, di atas 365, dan bukan bilangan bulat', () => {
    expect(validateReportSettings({ ...ok, responseWindowDays: '0' }).responseWindowDays).toEqual({
      code: 'range',
      min: 1,
      max: 365,
    });
    expect(validateReportSettings({ ...ok, responseWindowDays: '366' }).responseWindowDays?.code).toBe(
      'range',
    );
    expect(validateReportSettings({ ...ok, responseWindowDays: '3,5' }).responseWindowDays).toEqual({
      code: 'intInvalid',
    });
  });
});

describe('validateSections', () => {
  it('catatan kokurikuler dan perkembangan opsional, maksimal 1.000', () => {
    expect(validateSections({ cocurricularNote: '', developmentNote: '' })).toEqual({});
    expect(
      validateSections({ cocurricularNote: 'x'.repeat(1000), developmentNote: 'x'.repeat(1000) }),
    ).toEqual({});
    const e = validateSections({ cocurricularNote: 'x'.repeat(1001), developmentNote: 'x'.repeat(1001) });
    expect(e.cocurricularNote).toEqual({ code: 'tooLong', max: 1000 });
    expect(e.developmentNote).toEqual({ code: 'tooLong', max: 1000 });
  });
});

describe('validateResponseText', () => {
  it('wajib dan maksimal 1.000', () => {
    expect(validateResponseText('  ').text).toEqual({ code: 'required' });
    expect(validateResponseText('Terima kasih')).toEqual({});
    expect(validateResponseText('x'.repeat(1001)).text).toEqual({ code: 'tooLong', max: 1000 });
  });
});
