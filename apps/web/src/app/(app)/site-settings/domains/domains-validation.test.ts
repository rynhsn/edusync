import { describe, expect, it } from 'vitest';
import { validateDomain } from './domains-validation';

describe('validateDomain', () => {
  it('menerima domain publik, huruf besar dinormalkan', () => {
    expect(validateDomain('sekolah.sch.id')).toEqual({});
    expect(validateDomain('  Sekolah.SCH.id ')).toEqual({});
    expect(validateDomain('sekolah.sch.id.')).toEqual({});
  });
  it('wajib diisi', () => {
    expect(validateDomain('')).toEqual({ hostname: { code: 'required' } });
    expect(validateDomain('   ')).toEqual({ hostname: { code: 'required' } });
  });
  it('menolak URL, path, port, spasi, IP, localhost, dan satu label', () => {
    for (const bad of [
      'https://a.id',
      'a.id/path',
      'a.id:8080',
      'a b.id',
      '10.0.0.1',
      'localhost',
      'sekolah',
    ]) {
      expect(validateDomain(bad)).toEqual({ hostname: { code: 'hostInvalid' } });
    }
  });
  it('maksimal 253 karakter', () => {
    expect(validateDomain(`${'a'.repeat(251)}.id`).hostname).toEqual({ code: 'tooLong', max: 253 });
  });
});
