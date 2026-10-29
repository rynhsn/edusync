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
