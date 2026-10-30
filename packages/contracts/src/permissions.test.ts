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

describe('izin keuangan', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dibagi sesuai peran bawaan', () => {
    for (const p of ['finance:read', 'finance:pay', 'finance:manage']) {
      expect(isPermission(p)).toBe(true);
      expect(has('school_admin', p)).toBe(true);
      expect(has('treasurer', p)).toBe(true);
      expect(has('teacher', p)).toBe(false);
      expect(has('curriculum', p)).toBe(false);
    }
    for (const role of ['principal', 'operator'] as const) {
      expect(has(role, 'finance:read')).toBe(true);
      expect(has(role, 'finance:pay')).toBe(false);
      expect(has(role, 'finance:manage')).toBe(false);
    }
  });
  it('bendahara tetap memegang izin lamanya', () => {
    expect(has('treasurer', 'academic_year:read')).toBe(true);
    expect(has('treasurer', 'student:read')).toBe(true);
  });
});

describe('izin pesan', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dibagi sesuai peran bawaan', () => {
    expect(isPermission('message:read')).toBe(true);
    expect(isPermission('message:manage')).toBe(true);
    expect(has('school_admin', 'message:read')).toBe(true);
    expect(has('school_admin', 'message:manage')).toBe(true);
    expect(has('principal', 'message:read')).toBe(true);
    expect(has('principal', 'message:manage')).toBe(false);
    expect(has('operator', 'message:read')).toBe(true);
    expect(has('operator', 'message:manage')).toBe(true);
    for (const role of ['curriculum', 'treasurer', 'teacher'] as const) {
      expect(has(role, 'message:read')).toBe(false);
      expect(has(role, 'message:manage')).toBe(false);
    }
  });
});
