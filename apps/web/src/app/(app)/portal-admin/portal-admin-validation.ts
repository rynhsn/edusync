/**
 * Aturan isian undangan akun portal (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/portal.ts:
 * email opsional, bila diisi harus valid dan maksimal 254 karakter.
 */

import type { FieldErrors } from '@/lib/form-validation';
import { compactErrors } from '../../../lib/form-issues';
import { optionalEmail } from '../../../lib/form-issues-extra';

export type PortalInviteField = 'email';
export const PORTAL_INVITE_ORDER: PortalInviteField[] = ['email'];

export function validatePortalInvite(email: string): FieldErrors<PortalInviteField> {
  return compactErrors<PortalInviteField>([['email', optionalEmail(email, 254)]]);
}
