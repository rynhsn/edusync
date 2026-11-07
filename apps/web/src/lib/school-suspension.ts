import { ApiError } from './api';

export type SuspensionKind = 'billing' | 'other';

/** Bentuk minimal keanggotaan yang dibutuhkan; cocok dengan item `memberships` dari GET /v1/me. */
interface SuspensionSource {
  schoolStatus?: string;
  suspendedReason?: string | null;
}

/**
 * Jenis penangguhan sekolah. `null` = sekolah aktif. Respons lama tanpa `schoolStatus` dianggap aktif.
 * Alasan 'billing' (tagihan lembaga) dibedakan dari semua alasan lain ('staff' atau yang kelak ditambah).
 */
export function suspensionKind(m: SuspensionSource): SuspensionKind | null {
  if (!m.schoolStatus || m.schoolStatus === 'active') return null;
  return m.suspendedReason === 'billing' ? 'billing' : 'other';
}

/** Galat 403 `school_suspended` dari panggilan data sekolah mana pun. */
export function isSchoolSuspendedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'school_suspended';
}
