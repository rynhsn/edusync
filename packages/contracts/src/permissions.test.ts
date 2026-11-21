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

describe('izin kirim pesan langsung dan siaran', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('message:send untuk admin, kepala sekolah, operator; message:broadcast hanya admin dan operator', () => {
    expect(isPermission('message:send')).toBe(true);
    expect(isPermission('message:broadcast')).toBe(true);
    for (const role of ['school_admin', 'principal', 'operator'] as const)
      expect(has(role, 'message:send')).toBe(true);
    for (const role of ['school_admin', 'operator'] as const)
      expect(has(role, 'message:broadcast')).toBe(true);
    expect(has('principal', 'message:broadcast')).toBe(false);
    for (const role of ['curriculum', 'treasurer', 'teacher', 'guardian', 'student'] as const) {
      expect(has(role, 'message:send')).toBe(false);
      expect(has(role, 'message:broadcast')).toBe(false);
    }
  });
});

describe('izin tanggapan portal', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('hanya wali (dan admin sekolah) yang memegang portal:respond, siswa tidak', () => {
    expect(isPermission('portal:respond')).toBe(true);
    expect(has('guardian', 'portal:respond')).toBe(true);
    expect(has('guardian', 'portal:read')).toBe(true);
    expect(has('student', 'portal:respond')).toBe(false);
    expect(has('student', 'portal:read')).toBe(true);
    for (const role of ['principal', 'curriculum', 'operator', 'treasurer', 'teacher'] as const) {
      expect(has(role, 'portal:respond')).toBe(false);
    }
    expect(has('school_admin', 'portal:respond')).toBe(true);
  });
});

describe('izin pilihan mapel', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dipegang admin, kurikulum, dan operator saja', () => {
    expect(isPermission('subject_choice:manage')).toBe(true);
    for (const role of ['school_admin', 'curriculum', 'operator'] as const) {
      expect(has(role, 'subject_choice:manage')).toBe(true);
    }
    for (const role of ['principal', 'treasurer', 'teacher', 'guardian', 'student'] as const) {
      expect(has(role, 'subject_choice:manage')).toBe(false);
    }
  });
});

describe('izin kelulusan', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('tulis: admin dan kurikulum saja; baca: ditambah kepala sekolah dan operator', () => {
    expect(isPermission('graduation:manage')).toBe(true);
    expect(isPermission('graduation:read')).toBe(true);
    for (const role of ['school_admin', 'curriculum'] as const) {
      expect(has(role, 'graduation:manage')).toBe(true);
      expect(has(role, 'graduation:read')).toBe(true);
    }
    for (const role of ['principal', 'operator'] as const) {
      expect(has(role, 'graduation:manage')).toBe(false);
      expect(has(role, 'graduation:read')).toBe(true);
    }
    for (const role of ['treasurer', 'teacher', 'guardian', 'student'] as const) {
      expect(has(role, 'graduation:manage')).toBe(false);
      expect(has(role, 'graduation:read')).toBe(false);
    }
  });
});

describe('izin ekspor akademik', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dipegang admin, kurikulum, dan operator saja', () => {
    expect(isPermission('data_export:run')).toBe(true);
    for (const role of ['school_admin', 'curriculum', 'operator'] as const) {
      expect(has(role, 'data_export:run')).toBe(true);
    }
    for (const role of ['principal', 'treasurer', 'teacher', 'guardian', 'student'] as const) {
      expect(has(role, 'data_export:run')).toBe(false);
    }
  });
});

describe('izin kokurikuler', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('tulis: admin dan kurikulum; baca: ditambah kepala sekolah, operator, dan guru', () => {
    expect(isPermission('cocurricular:read')).toBe(true);
    expect(isPermission('cocurricular:manage')).toBe(true);
    for (const role of ['school_admin', 'curriculum'] as const) {
      expect(has(role, 'cocurricular:manage')).toBe(true);
      expect(has(role, 'cocurricular:read')).toBe(true);
    }
    for (const role of ['principal', 'operator', 'teacher'] as const) {
      expect(has(role, 'cocurricular:manage')).toBe(false);
      expect(has(role, 'cocurricular:read')).toBe(true);
    }
    for (const role of ['treasurer', 'guardian', 'student'] as const) {
      expect(has(role, 'cocurricular:manage')).toBe(false);
      expect(has(role, 'cocurricular:read')).toBe(false);
    }
  });
});

describe('izin UKK', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('tulis: admin dan kurikulum; baca: ditambah kepala sekolah, operator, dan guru', () => {
    expect(isPermission('ukk:read')).toBe(true);
    expect(isPermission('ukk:manage')).toBe(true);
    for (const role of ['school_admin', 'curriculum'] as const) {
      expect(has(role, 'ukk:manage')).toBe(true);
      expect(has(role, 'ukk:read')).toBe(true);
    }
    for (const role of ['principal', 'operator', 'teacher'] as const) {
      expect(has(role, 'ukk:manage')).toBe(false);
      expect(has(role, 'ukk:read')).toBe(true);
    }
    for (const role of ['treasurer', 'guardian', 'student'] as const) {
      expect(has(role, 'ukk:manage')).toBe(false);
      expect(has(role, 'ukk:read')).toBe(false);
    }
  });
});

describe('izin penilaian proses pembelajaran', () => {
  const has = (role: keyof typeof SYSTEM_ROLES, p: string) =>
    (SYSTEM_ROLES[role].permissions as readonly string[]).includes(p);
  it('dipegang admin, kepala sekolah, dan kurikulum saja', () => {
    expect(isPermission('teaching_review:manage')).toBe(true);
    for (const role of ['school_admin', 'principal', 'curriculum'] as const) {
      expect(has(role, 'teaching_review:manage')).toBe(true);
    }
    for (const role of ['treasurer', 'operator', 'teacher', 'guardian', 'student'] as const) {
      expect(has(role, 'teaching_review:manage')).toBe(false);
    }
  });
});
