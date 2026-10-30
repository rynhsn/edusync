import { describe, expect, it } from 'vitest';
import { protocolOf, siteLinks } from './site-links';

const base = { baseDomain: 'localhost:3000', protocol: 'http:', slug: 'smp-a' } as const;

describe('siteLinks', () => {
  it('di host sekolah sendiri tautan relatif', () => {
    expect(siteLinks({ ...base, host: 'smp-a.localhost:3000', mode: 'host' })).toEqual({
      base: '/site',
      login: '/login',
      apply: '/apply',
    });
  });
  it('di alamat utama tautan mutlak ke host sekolah', () => {
    expect(siteLinks({ ...base, host: 'localhost:3000', mode: 'slug' })).toEqual({
      base: '/site/smp-a',
      login: 'http://smp-a.localhost:3000/login',
      apply: 'http://smp-a.localhost:3000/apply',
    });
  });
  it('di host sekolah lain tetap mutlak', () => {
    expect(siteLinks({ ...base, host: 'smp-b.localhost:3000', mode: 'slug' }).login).toBe(
      'http://smp-a.localhost:3000/login',
    );
  });
});

describe('protocolOf', () => {
  it('mengikuti header proksi', () => {
    expect(protocolOf('https', 'x.test')).toBe('https:');
    expect(protocolOf('http,https', 'x.test')).toBe('http:');
  });
  it('lokal http, produksi https', () => {
    expect(protocolOf(null, 'smp-a.localhost:3000')).toBe('http:');
    expect(protocolOf(null, 'sekolah.edusync.id')).toBe('https:');
  });
});
