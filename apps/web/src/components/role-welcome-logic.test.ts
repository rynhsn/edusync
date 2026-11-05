import { describe, expect, it } from 'vitest';
import { isStaffNonAdmin, staffWelcomeItems } from './role-welcome-logic';

const make = (perms: string[], mods: string[]) =>
  staffWelcomeItems(
    (p) => perms.includes(p),
    (m) => mods.includes(m),
  ).map((i) => i.id);

describe('role welcome logic', () => {
  it('hanya mencantumkan fitur yang izin dan modulnya dimiliki', () => {
    expect(make(['schedule:read', 'grade:read'], ['schedule'])).toEqual(['schedule']);
    expect(make(['attendance:read'], ['attendance'])).toEqual(['attendance', 'lessons']);
  });
  it('kosong bila tidak ada izin', () => {
    expect(make([], ['schedule', 'grades'])).toEqual([]);
  });
  it('mengenali admin lewat school:manage', () => {
    expect(isStaffNonAdmin((p) => p === 'school:manage')).toBe(false);
    expect(isStaffNonAdmin(() => false)).toBe(true);
  });
});
