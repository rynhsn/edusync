import { ApiError } from './api';

const KNOWN = [
  'unauthorized',
  'forbidden',
  'school_required',
  'school_suspended',
  'validation',
  'conflict',
  'request_error',
  'internal',
  'invalid_selection',
  'slug_taken',
  'slug_duplicate',
  'payment_unavailable',
  'not_found',
  'module_disabled',
  'invalid_signature',
  'unknown_role',
  'account_not_found',
  'already_member',
  'last_admin',
  'self_disable',
  'invitation_invalid',
  'invitation_wrong_account',
  'role_locked',
  'role_system',
  'role_in_use',
  'in_use',
  'invalid_reference',
  'invalid_event',
  'invalid_period',
  'server_key_required',
  'invalid_provider',
] as const;

type KnownCode = (typeof KNOWN)[number];

/**
 * Kunci terjemahan untuk sebuah kesalahan. API mengirim kode yang stabil, jadi teksnya mengikuti
 * bahasa pengguna dan tidak bergantung pada pesan bahasa Indonesia dari server.
 */
export function errorKey(error: unknown): `errors.${KnownCode | 'unknown'}` {
  const code = error instanceof ApiError ? error.code : undefined;
  return `errors.${(KNOWN as readonly (string | undefined)[]).includes(code) ? (code as KnownCode) : 'unknown'}`;
}
