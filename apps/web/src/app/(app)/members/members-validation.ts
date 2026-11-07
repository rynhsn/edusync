/**
 * Aturan isian anggota sekolah (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/invitations.ts dan
 * members.ts: email valid maksimal 254, peran 1 sampai 10 (kunci peran maksimal 60 karakter, berasal dari daftar).
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compactErrors } from '../../../lib/form-issues';
import { requiredEmail } from '../../../lib/form-issues-extra';

const MAX_ROLES = 10;

function rolesIssue(count: number): FieldIssue | undefined {
  if (count === 0) return { code: 'choose' };
  return count > MAX_ROLES ? { code: 'range', min: 1, max: MAX_ROLES } : undefined;
}

export interface InviteValues {
  email: string;
  roleCount: number;
}
export type InviteField = 'email' | 'roles';
export const INVITE_ORDER: InviteField[] = ['email', 'roles'];

export function validateInvite(v: InviteValues): FieldErrors<InviteField> {
  return compactErrors<InviteField>([
    ['email', requiredEmail(v.email, 254)],
    ['roles', rolesIssue(v.roleCount)],
  ]);
}

export type EditRolesField = 'roles';
export const EDIT_ROLES_ORDER: EditRolesField[] = ['roles'];

export function validateEditRoles(roleCount: number): FieldErrors<EditRolesField> {
  return compactErrors<EditRolesField>([['roles', rolesIssue(roleCount)]]);
}
