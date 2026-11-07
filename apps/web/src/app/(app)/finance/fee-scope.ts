/** Logika murni cakupan jenis biaya (semua siswa / kelas tertentu / siswa tertentu), dipisah agar mudah diuji. */

export const FEE_SCOPES = ['all', 'class', 'student'] as const;
export type FeeScope = (typeof FEE_SCOPES)[number];

/** Batas sasaran yang diterima API. */
export const MAX_CLASS_TARGETS = 500;
export const MAX_STUDENT_TARGETS = 2000;
/** Jumlah nama sasaran yang diringkas pada kartu daftar. */
export const TARGET_PREVIEW = 3;

export interface ScopeDraft {
  scope: FeeScope;
  classIds: string[];
  studentIds: string[];
}

/** `targets_required` bila cakupan kelas/siswa belum punya sasaran, atau `too_many` bila melebihi batas; selain itu null. */
export function scopeError(d: ScopeDraft): 'targets_required' | 'too_many' | null {
  if (d.scope === 'class') {
    if (d.classIds.length === 0) return 'targets_required';
    return d.classIds.length > MAX_CLASS_TARGETS ? 'too_many' : null;
  }
  if (d.scope === 'student') {
    if (d.studentIds.length === 0) return 'targets_required';
    return d.studentIds.length > MAX_STUDENT_TARGETS ? 'too_many' : null;
  }
  return null;
}

/** Bagian body API untuk cakupan; sasaran cakupan lain dikosongkan agar tidak terkirim sisa pilihan lama. */
export function scopeBody(d: ScopeDraft): ScopeDraft {
  return {
    scope: d.scope,
    classIds: d.scope === 'class' ? [...new Set(d.classIds)] : [],
    studentIds: d.scope === 'student' ? [...new Set(d.studentIds)] : [],
  };
}

/** Tambah atau cabut satu id dari daftar pilihan tanpa duplikat. */
export function toggleId(list: string[], id: string, on: boolean): string[] {
  const has = list.includes(id);
  if (on) return has ? list : [...list, id];
  return has ? list.filter((x) => x !== id) : list;
}

/** Ringkasan sasaran untuk kartu: beberapa nama pertama dan sisa jumlahnya ("+N lainnya"). */
export function summarizeTargets(
  names: string[],
  count: number,
  preview = TARGET_PREVIEW,
): { shown: string[]; more: number } {
  const shown = names.slice(0, preview);
  return { shown, more: Math.max(0, count - shown.length) };
}

interface ScopedFee {
  scope: FeeScope;
  classIds: string[];
}

/**
 * Peringatan saat membuat tagihan massal: kelas yang dipilih berada di luar kelas sasaran jenis biaya
 * (tidak ada siswa yang akan ditagih). Cakupan lain tidak bisa dinilai tanpa data siswa, jadi null.
 */
export function classOutsideScope(fee: ScopedFee | undefined, classId: string): boolean {
  if (!fee || !classId) return false;
  return fee.scope === 'class' && !fee.classIds.includes(classId);
}

/** Pencarian lokal kelas untuk pemilih kelas (tanpa membedakan huruf besar/kecil). */
export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
}
