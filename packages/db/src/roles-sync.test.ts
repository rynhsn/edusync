import { SYSTEM_ROLES } from '@edusync/contracts';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDb,
  foundation,
  role,
  rolePermission,
  school,
  seedSchoolRoles,
  syncSystemRolePermissions,
} from './index';

const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);
let foundationId = '';
let schoolId = '';

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Sinkron', slug: `ysn-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `sinkron-${run}`, name: 'Sekolah Sinkron' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(platform.db, schoolId);
});

afterAll(async () => {
  await platform.db.delete(rolePermission).where(eq(rolePermission.schoolId, schoolId));
  await platform.db.delete(role).where(eq(role.schoolId, schoolId));
  await platform.db.delete(school).where(eq(school.id, schoolId));
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await platform.pool.end();
});

describe('sinkron izin peran bawaan', () => {
  it('menambah izin yang hilang tanpa menyentuh yang ada, dan aman diulang', async () => {
    const [principal] = await platform.db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.schoolId, schoolId), eq(role.key, 'principal')));
    // Meniru sekolah lama yang dibuat sebelum izin baru ada.
    await platform.db
      .delete(rolePermission)
      .where(
        and(eq(rolePermission.roleId, principal!.id), eq(rolePermission.permission, 'report_card:read_all')),
      );
    const count = async () =>
      (await platform.db.select().from(rolePermission).where(eq(rolePermission.roleId, principal!.id)))
        .length;
    const before = await count();
    expect(before).toBe(SYSTEM_ROLES.principal.permissions.length - 1);

    const added = await syncSystemRolePermissions(platform.db);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(await count()).toBe(SYSTEM_ROLES.principal.permissions.length);
    // Diulang: tidak ada tambahan lagi.
    expect(await syncSystemRolePermissions(platform.db)).toBe(0);
  });
});

describe('sinkron izin portal:respond', () => {
  it('menyebar ke peran wali sekolah lama, tidak ke peran siswa', async () => {
    const [g] = await platform.db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.schoolId, schoolId), eq(role.key, 'guardian')));
    const [st] = await platform.db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.schoolId, schoolId), eq(role.key, 'student')));
    const has = async (roleId: string) =>
      (await platform.db.select().from(rolePermission).where(eq(rolePermission.roleId, roleId))).some(
        (r) => r.permission === 'portal:respond',
      );
    // Meniru sekolah lama yang dibuat sebelum izin ada.
    await platform.db
      .delete(rolePermission)
      .where(and(eq(rolePermission.roleId, g!.id), eq(rolePermission.permission, 'portal:respond')));
    expect(await has(g!.id)).toBe(false);
    await syncSystemRolePermissions(platform.db);
    expect(await has(g!.id)).toBe(true);
    expect(await has(st!.id)).toBe(false);
  });
});

describe('sinkron izin subject_choice:manage', () => {
  it('menyebar ke peran kurikulum sekolah lama, tidak ke guru', async () => {
    const roleId = async (key: string) =>
      (
        await platform.db
          .select({ id: role.id })
          .from(role)
          .where(and(eq(role.schoolId, schoolId), eq(role.key, key)))
      )[0]!.id;
    const has = async (id: string) =>
      (await platform.db.select().from(rolePermission).where(eq(rolePermission.roleId, id))).some(
        (r) => r.permission === 'subject_choice:manage',
      );
    const cur = await roleId('curriculum');
    const teacher = await roleId('teacher');
    await platform.db
      .delete(rolePermission)
      .where(and(eq(rolePermission.roleId, cur), eq(rolePermission.permission, 'subject_choice:manage')));
    expect(await has(cur)).toBe(false);
    await syncSystemRolePermissions(platform.db);
    expect(await has(cur)).toBe(true);
    expect(await has(teacher)).toBe(false);
  });
});

describe('sinkron izin kelulusan', () => {
  it('menyebar ke peran kurikulum dan kepala sekolah sekolah lama, tidak ke guru', async () => {
    const roleId = async (key: string) =>
      (
        await platform.db
          .select({ id: role.id })
          .from(role)
          .where(and(eq(role.schoolId, schoolId), eq(role.key, key)))
      )[0]!.id;
    const has = async (id: string, permission: string) =>
      (await platform.db.select().from(rolePermission).where(eq(rolePermission.roleId, id))).some(
        (r) => r.permission === permission,
      );
    const cur = await roleId('curriculum');
    const principal = await roleId('principal');
    const teacher = await roleId('teacher');
    await platform.db
      .delete(rolePermission)
      .where(and(eq(rolePermission.roleId, cur), eq(rolePermission.permission, 'graduation:manage')));
    await platform.db
      .delete(rolePermission)
      .where(and(eq(rolePermission.roleId, principal), eq(rolePermission.permission, 'graduation:read')));
    expect(await has(cur, 'graduation:manage')).toBe(false);
    expect(await has(principal, 'graduation:read')).toBe(false);
    await syncSystemRolePermissions(platform.db);
    expect(await has(cur, 'graduation:manage')).toBe(true);
    expect(await has(principal, 'graduation:read')).toBe(true);
    expect(await has(principal, 'graduation:manage')).toBe(false);
    expect(await has(teacher, 'graduation:read')).toBe(false);
  });
});
