/** Riwayat undo/redo sederhana, murni (tanpa React) supaya mudah diuji. */

export const HISTORY_LIMIT = 100;

export interface History<S> {
  past: S[];
  present: S;
  future: S[];
  /** Kunci perubahan terakhir; perubahan beruntun dengan kunci sama digabung (mis. mengetik di satu kolom). */
  key: string | null;
}

export function createHistory<S>(initial: S): History<S> {
  return { past: [], present: initial, future: [], key: null };
}

const trim = <S>(past: S[]) => (past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past);

/** Simpan keadaan baru sebagai langkah undo. Dengan `key` yang sama dengan sebelumnya, langkah digabung. */
export function setPresent<S>(h: History<S>, next: S, key: string | null = null): History<S> {
  if (Object.is(next, h.present)) return h;
  if (key !== null && key === h.key) return { ...h, present: next, future: [] };
  return { past: trim([...h.past, h.present]), present: next, future: [], key };
}

/** Ganti keadaan tanpa membuat langkah undo (dipakai selama menyeret). */
export function replacePresent<S>(h: History<S>, next: S): History<S> {
  return Object.is(next, h.present) ? h : { ...h, present: next };
}

/** Akhiri seretan: jadikan `base` (keadaan sebelum seretan) sebagai satu langkah undo bila ada perubahan. */
export function commitFrom<S>(h: History<S>, base: S): History<S> {
  if (Object.is(base, h.present)) return h;
  return { past: trim([...h.past, base]), present: h.present, future: [], key: null };
}

export function undo<S>(h: History<S>): History<S> {
  const prev = h.past[h.past.length - 1];
  if (h.past.length === 0 || prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], key: null };
}

export function redo<S>(h: History<S>): History<S> {
  const next = h.future[0];
  if (h.future.length === 0 || next === undefined) return h;
  return { past: trim([...h.past, h.present]), present: next, future: h.future.slice(1), key: null };
}

export const canUndo = <S>(h: History<S>) => h.past.length > 0;
export const canRedo = <S>(h: History<S>) => h.future.length > 0;

/** Putuskan penggabungan perubahan (mis. saat kolom kehilangan fokus). */
export function breakKey<S>(h: History<S>): History<S> {
  return h.key === null ? h : { ...h, key: null };
}
