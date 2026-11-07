import { describe, expect, it } from 'vitest';
import {
  thresholdsOrdered,
  validateAspect,
  validateCertificate,
  validateJournal,
  validatePartner,
  validatePeriod,
  validatePlace,
  validatePlacementEdit,
  validateThresholds,
  validateVisit,
} from './pkl-validation';

const partner = { name: 'PT Maju', field: '', contactName: '', phone: '', email: '', address: '' };

describe('validatePartner', () => {
  it('menerima isian minimal', () => expect(validatePartner(partner)).toEqual({}));
  it('nama wajib, maksimal 160', () => {
    expect(validatePartner({ ...partner, name: '  ' }).name).toEqual({ code: 'required' });
    expect(validatePartner({ ...partner, name: 'a'.repeat(161) }).name).toEqual({
      code: 'tooLong',
      max: 160,
    });
  });
  it('email opsional tetapi harus benar bila diisi', () => {
    expect(validatePartner({ ...partner, email: 'x' }).email).toEqual({ code: 'email' });
    expect(validatePartner({ ...partner, email: 'hrd@maju.co.id' })).toEqual({});
  });
  it('batas panjang telepon, bidang, kontak, alamat', () => {
    const r = validatePartner({
      ...partner,
      phone: '1'.repeat(31),
      field: 'a'.repeat(121),
      contactName: 'a'.repeat(121),
      address: 'a'.repeat(301),
    });
    expect(r.phone).toEqual({ code: 'tooLong', max: 30 });
    expect(r.field).toEqual({ code: 'tooLong', max: 120 });
    expect(r.contactName).toEqual({ code: 'tooLong', max: 120 });
    expect(r.address).toEqual({ code: 'tooLong', max: 300 });
  });
});

describe('validatePeriod', () => {
  const ok = { name: 'PKL 1', academicYearId: 'y', startsOn: '2026-01-01', endsOn: '2026-03-01' };
  it('menerima isian benar', () => expect(validatePeriod(ok)).toEqual({}));
  it('semua wajib', () => {
    const r = validatePeriod({ name: '', academicYearId: '', startsOn: '', endsOn: '' });
    expect(Object.keys(r)).toEqual(['name', 'academicYearId', 'startsOn', 'endsOn']);
  });
  it('tanggal selesai tidak boleh sebelum mulai, boleh sama', () => {
    expect(validatePeriod({ ...ok, endsOn: '2025-12-31' }).endsOn).toEqual({ code: 'dateOrder' });
    expect(validatePeriod({ ...ok, endsOn: '2026-01-01' })).toEqual({});
  });
});

describe('validateAspect', () => {
  it('bobot bilangan bulat 1-100', () => {
    expect(validateAspect({ name: 'Disiplin', weight: '' }).weight).toEqual({ code: 'required' });
    expect(validateAspect({ name: 'Disiplin', weight: '0' }).weight).toEqual({
      code: 'range',
      min: 1,
      max: 100,
    });
    expect(validateAspect({ name: 'Disiplin', weight: '101' }).weight).toEqual({
      code: 'range',
      min: 1,
      max: 100,
    });
    expect(validateAspect({ name: 'Disiplin', weight: '2.5' }).weight).toEqual({ code: 'intInvalid' });
    expect(validateAspect({ name: 'Disiplin', weight: '20' })).toEqual({});
  });
  it('nama wajib, maksimal 120', () => {
    expect(validateAspect({ name: '', weight: '20' }).name).toEqual({ code: 'required' });
    expect(validateAspect({ name: 'a'.repeat(121), weight: '20' }).name).toEqual({
      code: 'tooLong',
      max: 120,
    });
  });
});

describe('ambang predikat', () => {
  it('tiap ambang bilangan bulat 1-100', () => {
    expect(validateThresholds({ A: '90', B: '80', C: '70' })).toEqual({});
    expect(validateThresholds({ A: '', B: '80', C: '101' })).toEqual({
      A: { code: 'required' },
      C: { code: 'range', min: 1, max: 100 },
    });
  });
  it('urutan A > B > C', () => {
    expect(thresholdsOrdered({ A: '90', B: '80', C: '70' })).toBe(true);
    expect(thresholdsOrdered({ A: '80', B: '80', C: '70' })).toBe(false);
    expect(thresholdsOrdered({ A: '90', B: '60', C: '70' })).toBe(false);
  });
});

describe('sertifikat, kunjungan, jurnal', () => {
  it('sertifikat: tanggal wajib, tempat <= 80, kepala sekolah <= 120', () => {
    expect(validateCertificate({ place: '', date: '', principal: '' }).date).toEqual({ code: 'required' });
    expect(validateCertificate({ place: 'a'.repeat(81), date: 'd', principal: 'b'.repeat(121) })).toEqual({
      place: { code: 'tooLong', max: 80 },
      principal: { code: 'tooLong', max: 120 },
    });
  });
  it('kunjungan: tanggal dan catatan wajib', () => {
    expect(validateVisit({ date: '', notes: ' ' })).toEqual({
      date: { code: 'required' },
      notes: { code: 'required' },
    });
    expect(validateVisit({ date: 'd', notes: 'a'.repeat(2001) }).notes).toEqual({
      code: 'tooLong',
      max: 2000,
    });
  });
  it('jurnal: tanggal dan kegiatan wajib', () => {
    expect(validateJournal({ date: 'd', activity: '' }).activity).toEqual({ code: 'required' });
    expect(validateJournal({ date: 'd', activity: 'ok' })).toEqual({});
  });
});

describe('penempatan', () => {
  const ok = { periodId: 'p', partnerId: 'm', picked: 2, indName: '', indPhone: '' };
  it('periode, mitra, dan minimal satu siswa wajib', () => {
    expect(validatePlace(ok)).toEqual({});
    const r = validatePlace({ ...ok, periodId: '', partnerId: '', picked: 0 });
    expect(Object.keys(r)).toEqual(['periodId', 'partnerId', 'picked']);
  });
  it('ubah penempatan: mitra wajib, batas pembimbing industri', () => {
    expect(validatePlacementEdit({ partnerId: '', indName: '', indPhone: '' }).partnerId).toEqual({
      code: 'choose',
    });
    expect(
      validatePlacementEdit({ partnerId: 'm', indName: 'a'.repeat(121), indPhone: '1'.repeat(31) }),
    ).toEqual({
      indName: { code: 'tooLong', max: 120 },
      indPhone: { code: 'tooLong', max: 30 },
    });
  });
});
