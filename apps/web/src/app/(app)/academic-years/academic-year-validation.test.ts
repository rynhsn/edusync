import { describe, expect, it } from 'vitest';
import { PERIOD_ORDER, validatePeriod } from './academic-year-validation';

const ok = { name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-26' };

describe('validatePeriod (tahun ajaran dan semester)', () => {
  it('menerima isian yang benar', () => {
    expect(validatePeriod(ok)).toEqual({});
  });

  it('semua isian kosong salah, urutan fokus mengikuti formulir', () => {
    const errors = validatePeriod({ name: '', startsOn: '', endsOn: '' });
    expect(Object.keys(errors)).toEqual(PERIOD_ORDER);
    expect(errors.name).toEqual({ code: 'required' });
    expect(errors.startsOn).toEqual({ code: 'required' });
  });

  it('nama hanya spasi dianggap kosong, lebih dari 40 karakter terlalu panjang', () => {
    expect(validatePeriod({ ...ok, name: '   ' }).name).toEqual({ code: 'required' });
    expect(validatePeriod({ ...ok, name: 'x'.repeat(41) }).name).toEqual({ code: 'tooLong', max: 40 });
    expect(validatePeriod({ ...ok, name: 'x'.repeat(40) }).name).toBeUndefined();
  });

  it('tanggal selesai harus setelah mulai, bukan sama', () => {
    const same = validatePeriod({ ...ok, endsOn: ok.startsOn }).endsOn;
    expect(same).toMatchObject({ code: 'custom', key: 'areaForms.dateAfterStart' });
    const before = validatePeriod({ ...ok, endsOn: '2026-01-01' }).endsOn;
    expect(before).toMatchObject({ key: 'areaForms.dateAfterStart' });
    expect(validatePeriod({ ...ok, endsOn: '2026-07-14' }).endsOn).toBeUndefined();
  });

  it('urutan tidak diperiksa selama salah satu tanggal belum diisi', () => {
    expect(validatePeriod({ ...ok, endsOn: '' }).endsOn).toEqual({ code: 'required' });
    expect(validatePeriod({ ...ok, startsOn: '' }).endsOn).toBeUndefined();
  });

  it('tanggal yang tidak ada di kalender ditolak', () => {
    expect(validatePeriod({ ...ok, startsOn: '2026-02-30' }).startsOn).toEqual({ code: 'dateInvalid' });
  });
});
