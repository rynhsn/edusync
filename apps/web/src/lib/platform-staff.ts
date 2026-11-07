import { ApiError } from './api';
import { errorKey } from './errors';

export type StaffRole = 'admin' | 'read_only';
export const STAFF_ROLES: readonly StaffRole[] = ['admin', 'read_only'];

/** Email dianggap sama tanpa membedakan huruf besar/kecil dan spasi di ujung. */
export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type InviteScreen = 'invalid' | 'signup' | 'signin' | 'mismatch' | 'accept';

/**
 * Tampilan halaman terima undangan: undangan tidak berlaku, belum masuk (daftar atau masuk menurut ada
 * tidaknya akun), masuk dengan akun lain, atau siap diterima.
 */
export function inviteScreen(
  info: { valid: boolean; accountExists: boolean; email: string | null },
  sessionEmail: string | null | undefined,
): InviteScreen {
  if (!info.valid || !info.email) return 'invalid';
  if (!sessionEmail) return info.accountExists ? 'signin' : 'signup';
  return emailsMatch(sessionEmail, info.email) ? 'accept' : 'mismatch';
}

/** Kunci terjemahan untuk galat pengelolaan staf; `last_admin` di sini berarti admin platform, bukan admin sekolah. */
export function staffErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.code === 'last_admin') return 'platformStaff.lastAdmin';
  return errorKey(error);
}

/** Tautan undangan yang dibagikan manual: ambil token dari tautan lengkap, atau kosong bila bentuknya tidak dikenal. */
export function inviteTokenFromUrl(url: string): string | null {
  return /\/platform-invite\/([A-Za-z0-9_-]{20,100})\/?$/.exec(url)?.[1] ?? null;
}
