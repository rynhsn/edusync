import type { SessionUser } from '@/features/types';

/** What a signed-in account may do in the Platform console. */
export type PlatformAccess = 'admin' | 'readonly' | 'user';

const ACCESS_BY_ROLE: Record<string, PlatformAccess> = {
  platform_admin: 'admin',
  platform_user: 'user',
  platform_read_only: 'readonly',
};

/**
 * Map a session role onto console access.
 *
 * An unknown or missing role falls back to read-only, which is the Platform API's default role:
 * records are visible, nothing can be changed. The API enforces the same rule on every route, so
 * this only decides what the console offers.
 */
export function platformAccess(user: SessionUser | null | undefined): PlatformAccess {
  return ACCESS_BY_ROLE[user?.role ?? ''] ?? 'readonly';
}

/** Operators are an operator concern: customers never see or manage them. */
export const canViewOperators = (access: PlatformAccess): boolean => access !== 'user';

/** Only administrators invite and disable operators. */
export const canManageOperators = (access: PlatformAccess): boolean => access === 'admin';

/** Administrators and customers both provision schools; read-only operators do not. */
export const canCreateTenants = (access: PlatformAccess): boolean => access === 'admin' || access === 'user';

/** Only administrators may suspend or reactivate a school workspace. */
export const canManageTenantStatus = (access: PlatformAccess): boolean => access === 'admin';

