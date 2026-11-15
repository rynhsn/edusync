import type { RecipientSelection } from '@edusync/contracts';

/** Logika murni layar pesan langsung (dipisah agar bisa diuji tanpa React). */

export interface PickItem {
  id: string;
  label: string;
  hint: string | null;
}

export interface PickState {
  students: PickItem[];
  classes: PickItem[];
  guardians: PickItem[];
  teachers: PickItem[];
  wholeSchool: boolean;
  allStaff: boolean;
  guardianScope: 'primary' | 'all';
}

export const EMPTY_PICK: PickState = {
  students: [],
  classes: [],
  guardians: [],
  teachers: [],
  wholeSchool: false,
  allStaff: false,
  guardianScope: 'primary',
};

/** Pilihan pengguna menjadi `selection` API; larik/bendera kosong dibuang. */
export function toSelection(p: PickState): RecipientSelection {
  const ids = (l: PickItem[]) => l.map((i) => i.id);
  return {
    ...(p.students.length ? { students: ids(p.students) } : {}),
    ...(p.classes.length ? { classes: ids(p.classes) } : {}),
    ...(p.guardians.length ? { guardians: ids(p.guardians) } : {}),
    ...(p.teachers.length ? { teachers: ids(p.teachers) } : {}),
    ...(p.wholeSchool ? { wholeSchool: true as const } : {}),
    ...(p.allStaff ? { allStaff: true as const } : {}),
    ...(p.guardianScope === 'all' ? { guardianScope: 'all' as const } : {}),
  };
}

/** Ada sasaran yang dipilih sama sekali? */
export function hasPick(p: PickState): boolean {
  return Boolean(
    p.students.length ||
      p.classes.length ||
      p.guardians.length ||
      p.teachers.length ||
      p.wholeSchool ||
      p.allStaff,
  );
}

/** Perkiraan menit sampai semua pesan terkirim (jeda rata-rata per pesan, dibulatkan ke atas). */
export function estimateMinutes(total: number, avgDelaySeconds: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil((total * Math.max(avgDelaySeconds, 1)) / 60));
}

/** Pesan identik ke banyak penerima mudah dikenali sebagai siaran; sarankan pengganti nama. */
export function lacksVariation(body: string): boolean {
  return !/\{\{\s*(guardian|student|teacher)\s*\}\}/.test(body);
}

/** Sisipkan teks di rentang pilihan sebuah isian; kembalikan teks baru dan posisi kursor. */
export function insertAt(text: string, token: string, start: number, end: number) {
  return { text: text.slice(0, start) + token + text.slice(end), cursor: start + token.length };
}
