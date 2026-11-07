/**
 * Aturan isian peran (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/roles.ts:
 * nama 2-40 karakter setelah dipangkas, minimal satu izin.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compactErrors, customIssue } from '../../../lib/form-issues';

export interface RoleValues {
  name: string;
  permissionCount: number;
  /** Nama peran sistem terkunci dan tidak diperiksa. */
  nameLocked: boolean;
}
export type RoleField = 'name' | 'permissions';
export const ROLE_ORDER: RoleField[] = ['name', 'permissions'];

function nameIssue(name: string): FieldIssue | undefined {
  const v = name.trim();
  if (v === '') return { code: 'required' };
  if (v.length < 2) return customIssue('areaForms.minLength', { min: 2 });
  return v.length > 40 ? { code: 'tooLong', max: 40 } : undefined;
}

export function validateRole(v: RoleValues): FieldErrors<RoleField> {
  return compactErrors<RoleField>([
    ['name', v.nameLocked ? undefined : nameIssue(v.name)],
    ['permissions', v.permissionCount === 0 ? { code: 'choose' } : undefined],
  ]);
}
