/** Fungsi murni denda keterlambatan (tanpa React) agar mudah diuji. */

export type LateFeeMode = 'none' | 'flat' | 'percent';

export interface LateFeeDraft {
  mode: LateFeeMode;
  value: string;
  graceDays: string;
  capAmount: string;
  feeTypeId: string;
}

export const EMPTY_LATE_FEE: LateFeeDraft = {
  mode: 'none',
  value: '',
  graceDays: '0',
  capAmount: '',
  feeTypeId: '',
};

type Setting = {
  mode: LateFeeMode;
  value: number;
  graceDays: number;
  capAmount: number | null;
  feeTypeId: string | null;
};

/** Isi formulir dari pengaturan di server (nilai kosong ditulis sebagai string kosong). */
export function draftFromSetting(s: Setting): LateFeeDraft {
  return {
    mode: s.mode,
    value: s.mode === 'none' ? '' : String(s.value),
    graceDays: String(s.graceDays),
    capAmount: s.capAmount === null ? '' : String(s.capAmount),
    feeTypeId: s.feeTypeId ?? '',
  };
}

/** Tubuh PUT dari formulir; mode `none` mengosongkan nilai, batas, dan jenis biaya. */
export function bodyFromDraft(d: LateFeeDraft) {
  if (d.mode === 'none')
    return {
      mode: 'none' as const,
      value: 0,
      graceDays: Number(d.graceDays) || 0,
      capAmount: null,
      feeTypeId: null,
    };
  return {
    mode: d.mode,
    value: Number(d.value),
    graceDays: Number(d.graceDays) || 0,
    capAmount: d.capAmount ? Number(d.capAmount) : null,
    feeTypeId: d.feeTypeId || null,
  };
}

/** Formulir valid bila sesuai aturan API: persen 1..100, nominal > 0, jenis biaya wajib selain `none`. */
export function isLateFeeDraftValid(d: LateFeeDraft): boolean {
  if (d.mode === 'none') return true;
  const v = Number(d.value);
  if (!Number.isInteger(v) || v < 1) return false;
  if (d.mode === 'percent' && v > 100) return false;
  if (Number(d.graceDays) > 365) return false;
  if (d.capAmount !== '' && Number(d.capAmount) < 1) return false;
  return d.feeTypeId !== '';
}

/** Hasil yang bisa dipilih untuk diterbitkan: yang belum dikenai denda. */
export function pendingIds<T extends { invoiceId: string; fined: boolean }>(items: T[]): string[] {
  return items.filter((i) => !i.fined).map((i) => i.invoiceId);
}
