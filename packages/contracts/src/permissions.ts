/**
 * Katalog izin. Format `sumber:aksi`. Modul baru menambah izinnya di sini,
 * karena API dan UI membaca daftar yang sama.
 */
export const PERMISSIONS = [
  'member:read',
  'member:manage',
  'role:manage',
  'academic_year:read',
  'academic_year:manage',
  'class:read',
  'class:manage',
  'student:read',
  'student:manage',
  'teacher:read',
  'teacher:manage',
  'subject:read',
  'subject:manage',
  'schedule:read',
  'schedule:manage',
  'attendance:read',
  'attendance:manage',
  'attendance:configure',
  'extracurricular:read',
  'extracurricular:manage',
  'grade:read',
  'grade:input',
  'grade:configure',
  'report_card:read',
  'report_card:manage',
  'finance:read',
  'finance:pay',
  'finance:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export interface SystemRole {
  name: string;
  permissions: readonly Permission[];
}

/** Peran bawaan yang dibuat untuk setiap sekolah. Sekolah boleh mengubahnya. */
export const SYSTEM_ROLES = {
  school_admin: { name: 'Admin sekolah', permissions: PERMISSIONS },
  principal: {
    name: 'Kepala sekolah',
    permissions: [
      'member:read',
      'academic_year:read',
      'class:read',
      'student:read',
      'teacher:read',
      'subject:read',
      'schedule:read',
      'attendance:read',
      'extracurricular:read',
      'grade:read',
      'report_card:read',
      'finance:read',
      'audit:read',
    ],
  },
  curriculum: {
    name: 'Kurikulum',
    permissions: [
      'academic_year:read',
      'academic_year:manage',
      'class:read',
      'class:manage',
      'subject:read',
      'subject:manage',
      'student:read',
      'teacher:read',
      'schedule:read',
      'schedule:manage',
      'attendance:read',
      'extracurricular:read',
      'extracurricular:manage',
      'grade:read',
      'grade:configure',
      'report_card:read',
      'report_card:manage',
    ],
  },
  treasurer: {
    name: 'Bendahara',
    permissions: ['academic_year:read', 'student:read', 'finance:read', 'finance:pay', 'finance:manage'],
  },
  operator: {
    name: 'Operator',
    permissions: [
      'member:read',
      'academic_year:read',
      'academic_year:manage',
      'class:read',
      'class:manage',
      'student:read',
      'student:manage',
      'teacher:read',
      'teacher:manage',
      'subject:read',
      'subject:manage',
      'schedule:read',
      'schedule:manage',
      'attendance:read',
      'attendance:manage',
      'attendance:configure',
      'extracurricular:read',
      'extracurricular:manage',
      'grade:read',
      'grade:configure',
      'grade:input',
      'report_card:read',
      'report_card:manage',
      'finance:read',
    ],
  },
  teacher: {
    name: 'Guru',
    permissions: [
      'academic_year:read',
      'class:read',
      'student:read',
      'subject:read',
      'schedule:read',
      'attendance:read',
      'attendance:manage',
      'extracurricular:read',
      'grade:read',
      'grade:input',
      'report_card:read',
    ],
  },
} as const satisfies Record<string, SystemRole>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
