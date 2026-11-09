import { isPortalOnly } from './portal-access';

/**
 * Pilihan tujuan setelah masuk di alamat utama: konsol platform (staf), portal pemilik lembaga, dan tiap
 * sekolah tempat pengguna menjadi anggota. Logika murni (tanpa React) agar mudah diuji.
 */
export type ChoiceKind = 'platform' | 'owner' | 'school';

export interface ChoiceContext {
  /** 'platform', 'owner', atau `school:<slug>`; juga kunci "terakhir dibuka". */
  id: string;
  kind: ChoiceKind;
  /** Hanya untuk sekolah. */
  name?: string;
  slug?: string;
  /** Hanya untuk sekolah: wali/siswa (portal saja) atau staf. */
  role?: 'guardian' | 'staff';
  permissions?: string[];
}

export interface ChoiceMembership {
  schoolSlug: string;
  schoolName: string;
  permissions: readonly string[];
}

export type EntryDecision =
  | { action: 'none' }
  | { action: 'go'; context: ChoiceContext }
  | { action: 'choose'; contexts: ChoiceContext[] };

export const schoolContextId = (slug: string) => `school:${slug}`;

/** Urutan dasar: konsol platform, portal pemilik, lalu sekolah menurut abjad. */
export function buildContexts(input: {
  isStaff: boolean;
  isOwner: boolean;
  memberships: readonly ChoiceMembership[];
}): ChoiceContext[] {
  const contexts: ChoiceContext[] = [];
  if (input.isStaff) contexts.push({ id: 'platform', kind: 'platform' });
  if (input.isOwner) contexts.push({ id: 'owner', kind: 'owner' });
  const schools = [...input.memberships].sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  for (const m of schools) {
    contexts.push({
      id: schoolContextId(m.schoolSlug),
      kind: 'school',
      name: m.schoolName,
      slug: m.schoolSlug,
      role: isPortalOnly(m.permissions) ? 'guardian' : 'staff',
      permissions: [...m.permissions],
    });
  }
  return contexts;
}

/** Tujuan terakhir dibuka dipindah ke depan; urutan lainnya tetap. Id yang tidak dikenal diabaikan. */
export function orderByLast(contexts: ChoiceContext[], lastId: string | null): ChoiceContext[] {
  const last = lastId ? contexts.find((c) => c.id === lastId) : undefined;
  return last ? [last, ...contexts.filter((c) => c !== last)] : contexts;
}

/** Satu tujuan: langsung ke sana. Lebih dari satu: tampilkan pilihan. Tidak ada: biarkan layar "belum terdaftar". */
export function decideEntry(contexts: ChoiceContext[], lastId: string | null = null): EntryDecision {
  if (contexts.length === 0) return { action: 'none' };
  if (contexts.length === 1) return { action: 'go', context: contexts[0] as ChoiceContext };
  return { action: 'choose', contexts: orderByLast(contexts, lastId) };
}

/** Moves focus index with arrow keys, Home and End; wraps around. Returns null for other keys. */
export function nextFocusIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const lastContextKey = (userId: string) => `last-context:${userId}`;

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastContext(
  userId: string,
  storage: StorageLike | null = browserStorage(),
): string | null {
  try {
    return storage?.getItem(lastContextKey(userId)) || null;
  } catch {
    return null;
  }
}

export function writeLastContext(userId: string, id: string, storage: StorageLike | null = browserStorage()) {
  try {
    storage?.setItem(lastContextKey(userId), id);
  } catch {
    // Penyimpanan diblokir (mode privat): abaikan, pilihan hanya tidak diingat.
  }
}
