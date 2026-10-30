import { describe, expect, it } from 'vitest';
import { isPermission, PERMISSIONS, SYSTEM_ROLES } from './permissions';

describe('katalog izin', () => {
  it('semua izin peran bawaan ada di katalog', () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const p of role.permissions) expect(isPermission(p)).toBe(true);
    }
  });
  it('admin sekolah memegang semua izin', () => {
    expect([...SYSTEM_ROLES.school_admin.permissions].sort()).toEqual([...PERMISSIONS].sort());
  });
  it('izin tak dikenal ditolak', () => {
    expect(isPermission('tidak:ada')).toBe(false);
  });
});

describe('izin rapor', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dibagi sesuai peran bawaan', () => {
    expect(isPermission('report_card:read')).toBe(true);
    expect(isPermission('report_card:manage')).toBe(true);
    for (const role of ['school_admin', 'curriculum', 'operator'] as const) {
      expect(has(role, 'report_card:read')).toBe(true);
      expect(has(role, 'report_card:manage')).toBe(true);
    }
    for (const role of ['principal', 'teacher'] as const) {
      expect(has(role, 'report_card:read')).toBe(true);
      expect(has(role, 'report_card:manage')).toBe(false);
    }
    expect(has('treasurer', 'report_card:read')).toBe(false);
  });
});
