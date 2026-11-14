/**
 * Nomor identitas pendidikan: NPSN (sekolah, 8 angka) dan NUPTK (guru, 16 angka).
 * Fungsi murni yang dipakai bersama oleh API dan web.
 */

export const NPSN_LENGTH = 8;
export const NUPTK_LENGTH = 16;

/** Buang spasi, titik, dan strip; kembalikan null bila hasilnya bukan tepat `length` angka. */
function normalizeDigits(raw: string | null | undefined, length: number): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^[\d\s.-]+$/.test(trimmed)) return null;
  const compact = trimmed.replace(/[\s.-]/g, '');
  return compact.length === length ? compact : null;
}

/** NPSN 8 angka (spasi/titik/strip dibuang); null bila tidak sah. */
export function normalizeNpsn(raw: string | null | undefined): string | null {
  return normalizeDigits(raw, NPSN_LENGTH);
}

/** NUPTK 16 angka (spasi/titik/strip dibuang); null bila tidak sah. */
export function normalizeNuptk(raw: string | null | undefined): string | null {
  return normalizeDigits(raw, NUPTK_LENGTH);
}

export const NSM_MIN_LENGTH = 8;
export const NSM_MAX_LENGTH = 16;

/**
 * NSM madrasah: 8-16 angka (spasi/titik/strip dibuang); null bila tidak sah. Rentang sengaja longgar karena format resmi belum
 * diverifikasi; harus sama dengan CHECK `school_identifier_nsm_ck` (memperketat butuh pembersihan data).
 */
export function normalizeNsm(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^[\d\s.-]+$/.test(trimmed)) return null;
  const compact = trimmed.replace(/[\s.-]/g, '');
  return compact.length >= NSM_MIN_LENGTH && compact.length <= NSM_MAX_LENGTH ? compact : null;
}
