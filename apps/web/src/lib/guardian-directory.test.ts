import { describe, expect, it } from 'vitest';
import {
  canDeleteGuardian,
  canInviteGuardian,
  filterQuery,
  hiddenChildren,
  studentSearchHref,
} from './guardian-directory';

describe('saringan Data wali', () => {
  it('memetakan saringan ke parameter API', () => {
    expect(filterQuery('all')).toEqual({});
    expect(filterQuery('missingNik')).toEqual({ missingNik: 'true' });
    expect(filterQuery('noPortal')).toEqual({ portal: 'none' });
    expect(filterQuery('hasAccount')).toEqual({ portal: 'has' });
  });
});

describe('aksi baris wali', () => {
  it('hapus hanya untuk wali tanpa anak dan tanpa akun aktif', () => {
    expect(canDeleteGuardian({ childCount: 0, portalStatus: 'none' })).toBe(true);
    expect(canDeleteGuardian({ childCount: 0, portalStatus: 'invited' })).toBe(true);
    expect(canDeleteGuardian({ childCount: 0, portalStatus: 'active' })).toBe(false);
    expect(canDeleteGuardian({ childCount: 2, portalStatus: 'none' })).toBe(false);
  });

  it('undang butuh modul portal, minimal satu anak, dan belum punya akun', () => {
    expect(canInviteGuardian({ childCount: 1, portalStatus: 'none' }, true)).toBe(true);
    expect(canInviteGuardian({ childCount: 1, portalStatus: 'invited' }, true)).toBe(true);
    expect(canInviteGuardian({ childCount: 1, portalStatus: 'active' }, true)).toBe(false);
    expect(canInviteGuardian({ childCount: 0, portalStatus: 'none' }, true)).toBe(false);
    expect(canInviteGuardian({ childCount: 1, portalStatus: 'none' }, false)).toBe(false);
  });
});

describe('anak', () => {
  it('tautan siswa memakai nama yang dikodekan dan dipotong 80 huruf', () => {
    expect(studentSearchHref('Budi & Ani')).toBe('/students?q=Budi%20%26%20Ani');
    expect(decodeURIComponent(studentSearchHref('x'.repeat(100)).split('=')[1] ?? '')).toHaveLength(80);
  });

  it('menghitung anak yang tersembunyi', () => {
    expect(hiddenChildren(12, 10)).toBe(2);
    expect(hiddenChildren(3, 3)).toBe(0);
    expect(hiddenChildren(2, 5)).toBe(0);
  });
});
