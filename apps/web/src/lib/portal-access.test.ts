import { describe, expect, it } from 'vitest';
import { homePathFor, isPortalOnly, isPortalPath } from './portal-access';

describe('isPortalOnly', () => {
  it('hanya portal:read', () => {
    expect(isPortalOnly(['portal:read'])).toBe(true);
    expect(isPortalOnly(['portal:read', 'announcement:read'])).toBe(true);
  });
  it('staf dengan izin lain bukan pengguna portal', () => {
    expect(isPortalOnly(['portal:read', 'student:read'])).toBe(false);
    expect(isPortalOnly(['student:read'])).toBe(false);
    expect(isPortalOnly([])).toBe(false);
  });
});

describe('homePathFor', () => {
  it('wali ke portal, staf ke dasbor', () => {
    expect(homePathFor(['portal:read'])).toBe('/portal');
    expect(homePathFor(['class:read'])).toBe('/dashboard');
  });
});

describe('isPortalPath', () => {
  it('mengenali /portal dan turunannya saja', () => {
    expect(isPortalPath('/portal')).toBe(true);
    expect(isPortalPath('/portal/children/x')).toBe(true);
    expect(isPortalPath('/portal-admin')).toBe(false);
    expect(isPortalPath('/dashboard')).toBe(false);
  });
});
