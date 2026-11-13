/**
 * Baris baca-saja pada layar input (lembar nilai ujian, penilaian ekskul, anggota ekskul).
 *
 * Server memuat lulusan (`studentStatus: 'graduated'`) yang punya data pada tahun lampau supaya riwayat tetap utuh,
 * tetapi menolak tulisan untuk mereka (400). Karena itu klien menampilkannya baca-saja dan tidak pernah
 * mengirimnya. Field `studentStatus` opsional: server lama tidak mengirimnya, dan baris tanpa field itu dianggap
 * dapat diubah.
 */

export interface StatusRow {
  studentStatus?: string | null;
}

/** Baris ini hanya untuk dibaca (lulusan). */
export function isReadOnlyRow(row: StatusRow): boolean {
  return row.studentStatus === 'graduated';
}

/** Baris yang boleh diisi atau diubah (bukan baca-saja). */
export function writableRows<T extends StatusRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isReadOnlyRow(r));
}

/**
 * Baris yang dikirim ke server: yang boleh diubah dan memenuhi `include` (mis. sudah diedit atau sudah diberi
 * predikat). Baris baca-saja tidak pernah ikut, apa pun isi suntingannya.
 */
export function rowsToSubmit<T extends StatusRow>(rows: readonly T[], include: (row: T) => boolean): T[] {
  return rows.filter((r) => !isReadOnlyRow(r) && include(r));
}

/** Hitung baris yang memenuhi `pred`, mengabaikan baris baca-saja (mis. "perlu diisi"). */
export function countWritable<T extends StatusRow>(rows: readonly T[], pred: (row: T) => boolean): number {
  return rows.reduce((n, r) => (!isReadOnlyRow(r) && pred(r) ? n + 1 : n), 0);
}

/**
 * Indeks baris berikutnya yang bisa difokuskan dari `from` ke arah `step` (+1/-1), melewati baris baca-saja dan
 * baris yang tidak bisa difokuskan menurut `focusable`. `null` bila sudah di ujung.
 */
export function nextEditableIndex<T extends StatusRow>(
  rows: readonly T[],
  from: number,
  step: 1 | -1,
  focusable: (row: T) => boolean = () => true,
): number | null {
  for (let i = from + step; i >= 0 && i < rows.length; i += step) {
    const row = rows[i] as T;
    if (!isReadOnlyRow(row) && focusable(row)) return i;
  }
  return null;
}

/** Indeks baris pertama yang boleh diubah, atau -1. */
export function firstEditableIndex<T extends StatusRow>(rows: readonly T[]): number {
  return rows.findIndex((r) => !isReadOnlyRow(r));
}
