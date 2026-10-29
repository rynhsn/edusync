import { describe, expect, it } from 'vitest';
import { parseHost, safeNextPath, siteUrl } from './host';

describe('parseHost', () => {
  it('alamat utama dikenali, dengan atau tanpa port', () => {
    expect(parseHost('localhost:3000', 'localhost:3000')).toEqual({ kind: 'main' });
    expect(parseHost('edusync.id', 'edusync.id')).toEqual({ kind: 'main' });
  });

  it('satu label di depan domain dasar adalah sekolah', () => {
    expect(parseHost('smpit-miftahul-huda.localhost:3000', 'localhost:3000')).toEqual({
      kind: 'school',
      slug: 'smpit-miftahul-huda',
    });
    expect(parseHost('MiftahulHuda.Edusync.ID', 'edusync.id')).toEqual({
      kind: 'school',
      slug: 'miftahulhuda',
    });
  });

  it('host lain atau bertingkat dianggap alamat utama, bukan sekolah', () => {
    expect(parseHost('127.0.0.1:3000', 'localhost:3000')).toEqual({ kind: 'main' });
    expect(parseHost('a.b.edusync.id', 'edusync.id')).toEqual({ kind: 'main' });
    expect(parseHost('evil-edusync.id', 'edusync.id')).toEqual({ kind: 'main' });
    expect(parseHost('edusync.id.evil.example', 'edusync.id')).toEqual({ kind: 'main' });
    expect(parseHost('-x.edusync.id', 'edusync.id')).toEqual({ kind: 'main' });
  });

  it('port berbeda bukan alamat yang sama', () => {
    expect(parseHost('smpit.localhost:4000', 'localhost:3000')).toEqual({ kind: 'main' });
  });
});

describe('siteUrl', () => {
  it('membangun alamat utama dan alamat sekolah', () => {
    expect(siteUrl('http:', 'localhost:3000', null, '/platform')).toBe('http://localhost:3000/platform');
    expect(siteUrl('https:', 'edusync.id', 'miftahulhuda', '/dashboard')).toBe(
      'https://miftahulhuda.edusync.id/dashboard',
    );
  });
});

describe('safeNextPath', () => {
  it('menerima path internal', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/academic-years?x=1')).toBe('/academic-years?x=1');
  });

  it('menolak URL penuh, protocol-relative, backslash, dan kosong (cegah open redirect)', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'dashboard',
      '',
      null,
      undefined,
    ]) {
      expect(safeNextPath(bad as string | null | undefined), String(bad)).toBe('/');
    }
  });
});
