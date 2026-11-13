/**
 * Mutasi murid (tahap 3C.1): arah, jenis, dan kode alasan. Daftar alasan tidak dijaga CHECK di database (pelajaran: daftar
 * bertambah tanpa migrasi); API menolak kode di luar daftar ini.
 */

export const STUDENT_TRANSFER_DIRECTIONS = ['in', 'out'] as const;
export type StudentTransferDirection = (typeof STUDENT_TRANSFER_DIRECTIONS)[number];

/** `transfer` = pindah sekolah; `dropped` = putus sekolah (hanya arah `out`, tidak terkena larangan semester genap tingkat akhir). */
export const STUDENT_TRANSFER_KINDS = ['transfer', 'dropped'] as const;
export type StudentTransferKind = (typeof STUDENT_TRANSFER_KINDS)[number];

export const STUDENT_TRANSFER_REASONS = ['parent_relocation', 'school_choice', 'dropped', 'other'] as const;
export type StudentTransferReason = (typeof STUDENT_TRANSFER_REASONS)[number];

/** Kode galat larangan mutasi pada semester genap tingkat akhir (S4, 3/2025 Pasal 55-58). */
export const TRANSFER_FINAL_LEVEL_CODE = 'transfer_final_level_even_semester';
