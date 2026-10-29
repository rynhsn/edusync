import { describe, expect, it } from 'vitest';
import { createOriginMatcher, schoolOrigin } from './origins';

const local = createOriginMatcher({
  appDomain: 'localhost:3000',
  scheme: 'http:',
  extra: ['http://127.0.0.1:3000'],
});
const prod = createOriginMatcher({ appDomain: 'edusync.id', scheme: 'https:' });

describe('asal yang dipercaya', () => {
  it('menerima alamat utama dan subdomain sekolah', () => {
    expect(local('http://localhost:3000')).toBe(true);
    expect(local('http://smpit-miftahul-huda.localhost:3000')).toBe(true);
    expect(prod('https://edusync.id')).toBe(true);
    expect(prod('https://miftahulhuda.edusync.id')).toBe(true);
  });

  it('menerima daftar tetap tambahan', () => {
    expect(local('http://127.0.0.1:3000')).toBe(true);
  });

  it('menolak skema yang salah, terutama http di produksi', () => {
    expect(prod('http://edusync.id')).toBe(false);
    expect(prod('http://miftahulhuda.edusync.id')).toBe(false);
    expect(local('https://localhost:3000')).toBe(false);
  });

  it('menolak domain yang hanya mirip', () => {
    for (const bad of [
      'https://edusync.id.evil.example',
      'https://evil-edusync.id',
      'https://notedusync.id',
      'https://edusync.id:8443',
      'https://a.b.edusync.id',
      'https://-x.edusync.id',
      'https://x_.edusync.id',
    ]) {
      expect(prod(bad), bad).toBe(false);
    }
  });

  it('menolak yang bukan origin murni: path, kredensial, kosong, atau sampah', () => {
    expect(prod('https://edusync.id/platform')).toBe(false);
    expect(prod('https://user:pw@edusync.id')).toBe(false);
    expect(prod('')).toBe(false);
    expect(prod(null)).toBe(false);
    expect(prod(undefined)).toBe(false);
    expect(prod('bukan url')).toBe(false);
    expect(prod('null')).toBe(false);
  });

  it('membangun alamat sekolah', () => {
    expect(schoolOrigin('http:', 'localhost:3000', 'smpit')).toBe('http://smpit.localhost:3000');
    expect(schoolOrigin('https:', 'edusync.id', 'miftahulhuda')).toBe('https://miftahulhuda.edusync.id');
  });
});
