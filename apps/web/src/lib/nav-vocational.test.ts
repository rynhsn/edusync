import { describe, expect, it } from 'vitest';
import { hiddenByProfile } from './nav-vocational';

describe('menu kejuruan mengikuti jenjang unit', () => {
  const pkl = { href: '/pkl', vocational: true };
  const students = { href: '/students' };

  it('jenjang kejuruan dan sekolah lama (belum ada jenjang) melihat menu PKL', () => {
    expect(hiddenByProfile(pkl, true)).toBe(false);
    expect(hiddenByProfile(pkl, null)).toBe(false);
  });

  it('jenjang bukan kejuruan menyembunyikan menu PKL saja', () => {
    expect(hiddenByProfile(pkl, false)).toBe(true);
    expect(hiddenByProfile(students, false)).toBe(false);
  });
});
