import { SYSTEM_ROLES } from '@edusync/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { member, memberRole, role, rolePermission } from './schema';

type Executor = Db | Tx;

/** Buat peran bawaan untuk sekolah baru. Aman dipanggil ulang. */
export async function seedSchoolRoles(ex: Executor, schoolId: string) {
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const [row] = await ex
      .insert(role)
      .values({ schoolId, key, name: def.name, isSystem: true })
      .onConflictDoNothing()
      .returning({ id: role.id });
    if (!row) continue;
    await ex
      .insert(rolePermission)
      .values(def.permissions.map((permission) => ({ roleId: row.id, schoolId, permission })));
  }
}

/**
 * Lengkapi izin peran bawaan di semua sekolah sesuai `SYSTEM_ROLES` (hanya menambah, aman diulang). Izin baru di kode
 * tidak otomatis sampai ke sekolah yang sudah ada karena `seedSchoolRoles` hanya membuat peran baru. Migrasi tidak bisa
 * melakukannya: tabel `role` ber-RLS terpaksa kosong bagi pemilik tabel. Jalankan lewat koneksi platform (BYPASSRLS).
 * Mengembalikan jumlah izin yang ditambahkan.
 */
export async function syncSystemRolePermissions(ex: Executor) {
  const roles = await ex
    .select({ id: role.id, schoolId: role.schoolId, key: role.key })
    .from(role)
    .where(eq(role.isSystem, true));
  const wanted = roles.flatMap((r) =>
    (SYSTEM_ROLES[r.key as keyof typeof SYSTEM_ROLES]?.permissions ?? []).map((permission) => ({
      roleId: r.id,
      schoolId: r.schoolId,
      permission,
    })),
  );
  let added = 0;
  for (let i = 0; i < wanted.length; i += 1000) {
    const rows = await ex
      .insert(rolePermission)
      .values(wanted.slice(i, i + 1000))
      .onConflictDoNothing()
      .returning({ roleId: rolePermission.roleId });
    added += rows.length;
  }
  return added;
}

/** Beri anggota satu atau lebih peran (kunci peran). Peran yang sudah dipegang diabaikan. */
export async function assignRoles(ex: Executor, memberId: string, schoolId: string, roleKeys: string[]) {
  const roles = await ex
    .select({ id: role.id })
    .from(role)
    .where(and(eq(role.schoolId, schoolId), inArray(role.key, roleKeys)));
  if (roles.length !== roleKeys.length) throw new Error('Peran tidak dikenal');
  await ex
    .insert(memberRole)
    .values(roles.map((r) => ({ memberId, roleId: r.id, schoolId })))
    .onConflictDoNothing();
}

/**
 * Izin anggota = gabungan izin semua perannya. Anggota yang dinonaktifkan tidak punya izin.
 * Mengembalikan null bila orang itu bukan anggota aktif unit tersebut.
 */
export async function loadMemberAccess(ex: Executor, userId: string, schoolId: string) {
  const [m] = await ex
    .select({ id: member.id, status: member.status })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.schoolId, schoolId)));
  if (m?.status !== 'active') return null;
  const rows = await ex
    .selectDistinct({ permission: rolePermission.permission, roleKey: role.key })
    .from(memberRole)
    .innerJoin(rolePermission, eq(rolePermission.roleId, memberRole.roleId))
    .innerJoin(role, eq(role.id, memberRole.roleId))
    .where(eq(memberRole.memberId, m.id));
  return {
    memberId: m.id,
    permissions: new Set(rows.map((r) => r.permission)),
    roles: [...new Set(rows.map((r) => r.roleKey))],
  };
}
