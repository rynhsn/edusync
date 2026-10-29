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
