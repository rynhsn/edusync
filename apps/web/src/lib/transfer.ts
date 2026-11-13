/**
 * Logika murni untuk mutasi murid (masuk dan keluar sekolah) dan riwayat murid. Tanpa React supaya mudah diuji:
 * validasi isian, penyusunan isi permintaan ke API, pemetaan alasan, dan deteksi galat larangan semester genap
 * tingkat akhir. Aturannya mengikuti apps/api/src/routes/student-transfer.ts.
 */

import { ApiError } from './api';
import { type FieldErrors, type FieldIssue, isRealDate } from './form-validation';

export const TRANSFER_REASONS = ['parent_relocation', 'school_choice', 'dropped', 'other'] as const;
export type TransferReason = (typeof TRANSFER_REASONS)[number];

export const TRANSFER_KINDS = ['transfer', 'dropped'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

/** Kode galat larangan mutasi semester genap tingkat akhir (sama dengan TRANSFER_FINAL_LEVEL_CODE di kontrak API). */
export const FINAL_LEVEL_CODE = 'transfer_final_level_even_semester';

/** Batas panjang isian (sama dengan zod di API). */
export const LIMITS = {
  reasonNote: 1000,
  counterpartSchoolName: 200,
  letterNumber: 100,
  exceptionReason: 500,
  classMoveReason: 500,
} as const;

/** Alasan dari API dipetakan ke alasan yang dikenal; selain itu dianggap "lainnya". */
export function normalizeReason(reason: string | null | undefined): TransferReason {
  return (TRANSFER_REASONS as readonly string[]).includes(reason ?? '')
    ? (reason as TransferReason)
    : 'other';
}

/** Alasan menurut jenis: putus sekolah memakai "dropped"; pindah sekolah tidak boleh memakainya. */
export function reasonForKind(kind: TransferKind, current: TransferReason): TransferReason {
  if (kind === 'dropped') return 'dropped';
  return current === 'dropped' ? 'other' : current;
}

/** True bila galat adalah larangan semester genap tingkat akhir (boleh ditimpa admin dengan alasan tertulis). */
export function isFinalLevelBlock(error: unknown): boolean {
  return error instanceof ApiError && error.code === FINAL_LEVEL_CODE;
}

/** NPSN: kosong, atau tepat 8 angka. */
export function npsnIssue(value: string): FieldIssue | undefined {
  const v = value.trim();
  return v === '' || /^\d{8}$/.test(v) ? undefined : { code: 'npsn' };
}

const empty = (v: string): string | null => {
  const t = v.trim();
  return t === '' ? null : t;
};

export interface TransferValues {
  effectiveOn: string;
  reason: TransferReason;
  reasonNote: string;
  counterpartSchoolName: string;
  counterpartNpsn: string;
  letterNumber: string;
  letterDate: string;
  exceptionReason: string;
}

export const EMPTY_TRANSFER: TransferValues = {
  effectiveOn: '',
  reason: 'parent_relocation',
  reasonNote: '',
  counterpartSchoolName: '',
  counterpartNpsn: '',
  letterNumber: '',
  letterDate: '',
  exceptionReason: '',
};

export type TransferField =
  | 'student'
  | 'classId'
  | 'effectiveOn'
  | 'reasonNote'
  | 'counterpartSchoolName'
  | 'counterpartNpsn'
  | 'letterNumber'
  | 'letterDate'
  | 'exceptionReason';

/** Urutan isian di formulir mutasi, untuk memfokuskan isian salah pertama. */
export const TRANSFER_ORDER: TransferField[] = [
  'student',
  'classId',
  'effectiveOn',
  'reasonNote',
  'counterpartSchoolName',
  'counterpartNpsn',
  'letterNumber',
  'letterDate',
  'exceptionReason',
];

const tooLong = (v: string, max: number): FieldIssue | undefined =>
  v.trim().length > max ? { code: 'tooLong', max } : undefined;

const dateIssue = (v: string, required: boolean): FieldIssue | undefined =>
  v === ''
    ? required
      ? { code: 'required' }
      : undefined
    : isRealDate(v)
      ? undefined
      : { code: 'dateInvalid' };

/**
 * Validasi isian mutasi. `needsException` = larangan semester genap tingkat akhir sedang ditimpa, jadi alasan
 * pengecualian wajib. `editing` = ubah keterangan (tanggal efektif tidak ikut dikirim).
 */
export function validateTransfer(
  v: TransferValues,
  opts: { needsException?: boolean; editing?: boolean } = {},
): FieldErrors<TransferField> {
  const out: FieldErrors<TransferField> = {};
  const set = (k: TransferField, i: FieldIssue | undefined) => {
    if (i) out[k] = i;
  };
  if (!opts.editing) set('effectiveOn', dateIssue(v.effectiveOn, true));
  set('reasonNote', tooLong(v.reasonNote, LIMITS.reasonNote));
  set('counterpartSchoolName', tooLong(v.counterpartSchoolName, LIMITS.counterpartSchoolName));
  set('counterpartNpsn', npsnIssue(v.counterpartNpsn));
  set('letterNumber', tooLong(v.letterNumber, LIMITS.letterNumber));
  set('letterDate', dateIssue(v.letterDate, false));
  if (opts.needsException) {
    const e = v.exceptionReason.trim();
    set('exceptionReason', e === '' ? { code: 'required' } : tooLong(e, LIMITS.exceptionReason));
  }
  return out;
}

/** Bagian isian yang sama di semua permintaan mutasi (kosong menjadi null, teks dipangkas). */
function commonFields(v: TransferValues) {
  return {
    reason: v.reason,
    reasonNote: empty(v.reasonNote),
    counterpartSchoolName: empty(v.counterpartSchoolName),
    counterpartNpsn: empty(v.counterpartNpsn),
    letterNumber: empty(v.letterNumber),
    letterDate: v.letterDate || null,
  };
}

/** Isi permintaan POST /v1/students/{id}/transfer-out. `exceptionReason` hanya dikirim bila diisi. */
export function buildTransferOutBody(v: TransferValues, kind: TransferKind) {
  const exception = v.exceptionReason.trim();
  return {
    effectiveOn: v.effectiveOn,
    kind,
    ...commonFields(v),
    ...(exception ? { exceptionReason: exception } : {}),
  };
}

/** Isi permintaan POST /v1/students/transfer-in: data murid (sudah dibersihkan pemanggil) + mutasi + kelas tujuan. */
export function buildTransferInBody<P extends object>(person: P, v: TransferValues, classId: string) {
  const exception = v.exceptionReason.trim();
  return {
    ...person,
    effectiveOn: v.effectiveOn,
    ...commonFields(v),
    classId,
    ...(exception ? { exceptionReason: exception } : {}),
  };
}

/** Isi permintaan PUT /v1/student-transfers/{id}: hanya keterangan; tanggal efektif, arah, dan kelas tidak berubah. */
export function buildTransferEditBody(v: TransferValues) {
  return commonFields(v);
}

/** Isian formulir ubah dari data mutasi yang sudah tersimpan. */
export function transferToValues(t: {
  effectiveOn: string;
  reason: string;
  reasonNote: string | null;
  counterpartSchoolName: string | null;
  counterpartNpsn: string | null;
  letterNumber: string | null;
  letterDate: string | null;
  exceptionReason?: string | null;
}): TransferValues {
  return {
    effectiveOn: t.effectiveOn,
    reason: normalizeReason(t.reason),
    reasonNote: t.reasonNote ?? '',
    counterpartSchoolName: t.counterpartSchoolName ?? '',
    counterpartNpsn: t.counterpartNpsn ?? '',
    letterNumber: t.letterNumber ?? '',
    letterDate: t.letterDate ?? '',
    exceptionReason: t.exceptionReason ?? '',
  };
}

/** Isi permintaan PUT /v1/students/{id}/class; tanggal efektif dan alasan hanya dikirim bila diisi. */
export function buildClassMoveBody(classId: string | null, effectiveOn: string, reason: string) {
  const r = reason.trim();
  return {
    classId,
    ...(effectiveOn ? { effectiveOn } : {}),
    ...(r ? { reason: r } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Riwayat murid

export type YearEvent<C, T> =
  | { type: 'classChange'; date: string; item: C }
  | { type: 'transfer'; date: string; item: T };

/** Perpindahan kelas dan mutasi dalam satu tahun ajaran, urut menurut tanggal (stabil: perpindahan kelas lebih dulu). */
export function yearEvents<C extends { effectiveOn: string }, T extends { effectiveOn: string }>(year: {
  classChanges: C[];
  transfers: T[];
}): YearEvent<C, T>[] {
  const all: YearEvent<C, T>[] = [
    ...year.classChanges.map((item) => ({ type: 'classChange' as const, date: item.effectiveOn, item })),
    ...year.transfers.map((item) => ({ type: 'transfer' as const, date: item.effectiveOn, item })),
  ];
  return all
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? -1 : 1))
    .map(({ e }) => e);
}
