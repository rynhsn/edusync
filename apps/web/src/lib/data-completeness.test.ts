import { describe, expect, it } from 'vitest';
import { countMissingNik, dataCompleteness, hasNik } from './data-completeness';

const MASKED = '************0001';

describe('dataCompleteness', () => {
  it('NIK kosong: belum diisi, apa pun kontaknya', () => {
    expect(dataCompleteness({ nikMasked: null, phone: '62812', email: 'a@b.id' })).toBe('missingNik');
    expect(dataCompleteness({})).toBe('missingNik');
    expect(dataCompleteness({ nik: '', nikMasked: '' })).toBe('missingNik');
  });

  it('NIK ada tetapi telepon dan email kosong: kontak belum lengkap', () => {
    expect(dataCompleteness({ nikMasked: MASKED, phone: null, email: null })).toBe('missingContact');
    expect(dataCompleteness({ nikMasked: MASKED, phone: ' ', email: '' })).toBe('missingContact');
  });

  it('NIK dan salah satu kontak ada: lengkap', () => {
    expect(dataCompleteness({ nikMasked: MASKED, phone: '62812', email: null })).toBe('complete');
    expect(dataCompleteness({ nikMasked: MASKED, phone: null, email: 'a@b.id' })).toBe('complete');
  });

  it('NUPTK opsional: kosong tidak membuat data dianggap kurang', () => {
    expect(dataCompleteness({ nikMasked: MASKED, phone: '62812', nuptk: null, nuptkMasked: null })).toBe(
      'complete',
    );
    expect(dataCompleteness({ nikMasked: MASKED, phone: '62812', nuptk: '7777123412341234' })).toBe(
      'complete',
    );
    expect(dataCompleteness({ nuptk: '7777123412341234' })).toBe('missingNik');
    expect(countMissingNik([{ nikMasked: MASKED, nuptk: null }])).toBe(0);
  });

  it('pengguna tanpa izin kelola (nik null, nikMasked ada) tetap dianggap punya NIK', () => {
    expect(hasNik({ nik: null, nikMasked: MASKED })).toBe(true);
    expect(hasNik({ nik: '3201234567890001', nikMasked: null })).toBe(true);
  });
});

describe('countMissingNik', () => {
  it('menghitung hanya yang NIK-nya kosong', () => {
    expect(
      countMissingNik([{ nikMasked: MASKED }, { nikMasked: null }, {}, { nik: '3201234567890001' }]),
    ).toBe(2);
    expect(countMissingNik([])).toBe(0);
  });
});
