/** Fitur yang disebut di sambutan pertama guru/staf; tiap baris hanya tampil bila izin dan modulnya dimiliki. */
export interface StaffWelcomeItem {
  id:
    | 'schedule'
    | 'attendance'
    | 'lessons'
    | 'grades'
    | 'exams'
    | 'questionBank'
    | 'announcements'
    | 'tahfidz';
  href: string;
  permission: string;
  module: string;
}

export const STAFF_WELCOME_ITEMS: readonly StaffWelcomeItem[] = [
  { id: 'schedule', href: '/schedule', permission: 'schedule:read', module: 'schedule' },
  { id: 'attendance', href: '/attendance', permission: 'attendance:read', module: 'attendance' },
  { id: 'lessons', href: '/lessons', permission: 'attendance:read', module: 'attendance' },
  { id: 'grades', href: '/grades', permission: 'grade:read', module: 'grades' },
  { id: 'exams', href: '/exams', permission: 'exam:read', module: 'exams' },
  { id: 'questionBank', href: '/exams/bank', permission: 'exam:read', module: 'exams' },
  { id: 'announcements', href: '/announcements', permission: 'announcement:read', module: 'announcements' },
  { id: 'tahfidz', href: '/tahfidz', permission: 'tahfidz:read', module: 'tahfidz' },
];

/** Daftar fitur yang benar-benar bisa dibuka pengguna ini. */
export function staffWelcomeItems(
  can: (permission: string) => boolean,
  hasModule: (moduleKey: string) => boolean,
): StaffWelcomeItem[] {
  return STAFF_WELCOME_ITEMS.filter((i) => can(i.permission) && hasModule(i.module));
}

/** Admin sekolah (pengelola) punya daftar langkah sendiri di dashboard; sambutan ini untuk staf non-admin. */
export function isStaffNonAdmin(can: (permission: string) => boolean): boolean {
  return !can('school:manage');
}
