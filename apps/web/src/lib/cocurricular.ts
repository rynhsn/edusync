import { RUBRIC_LEVEL_LIMIT } from '@edusync/contracts';

/** Pembantu murni untuk halaman Pengaturan kokurikuler (tahap 4.1). */

export interface ItemDraft {
  /** Kunci lokal stabil (id server, atau `new-n` untuk butir baru). */
  key: string;
  id?: string;
  frameworkKey: string;
  refCode: string | null;
  code: string;
  label: string;
  description: string;
  active: boolean;
}

export interface LevelDraft {
  key: string;
  id?: string;
  code: string;
  label: string;
  description: string;
  active: boolean;
}

type LocaleLabels = { labelId: string; labelEn: string; labelSu: string };

/** Label acuan menurut bahasa antarmuka (Indonesia bila bahasanya tak dikenal). */
export function refLabel(item: LocaleLabels, locale: string): string {
  if (locale === 'en') return item.labelEn;
  if (locale === 'su') return item.labelSu;
  return item.labelId;
}

/** Pindah satu posisi (-1 = naik, 1 = turun); di ujung tidak berubah. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Badan PUT butir: urutan = posisi dalam kerangkanya (kelipatan 10). Butir baru tanpa `id`. */
export function itemsBody(drafts: readonly ItemDraft[]) {
  const seen = new Map<string, number>();
  return drafts.map((d) => {
    const n = (seen.get(d.frameworkKey) ?? 0) + 1;
    seen.set(d.frameworkKey, n);
    return {
      ...(d.id ? { id: d.id } : {}),
      frameworkKey: d.frameworkKey,
      code: d.code.trim(),
      label: d.label.trim(),
      description: d.description.trim() === '' ? null : d.description.trim(),
      sort: n * 10,
      active: d.active,
    };
  });
}

/** Badan PUT rubrik: urutan = posisi dalam daftar (dari 1). */
export function levelsBody(drafts: readonly LevelDraft[]) {
  return drafts.map((d, i) => ({
    ...(d.id ? { id: d.id } : {}),
    code: d.code.trim(),
    label: d.label.trim(),
    description: d.description.trim() === '' ? null : d.description.trim(),
    sort: i + 1,
    active: d.active,
  }));
}

/** Isian wajib terisi dan kode tidak kembar; kunci galatnya dipakai tampilan untuk menahan simpan. */
export function levelsValid(drafts: readonly LevelDraft[]): boolean {
  const codes = drafts.map((d) => d.code.trim());
  return (
    drafts.length <= RUBRIC_LEVEL_LIMIT &&
    drafts.every((d) => d.code.trim() !== '' && d.label.trim() !== '') &&
    new Set(codes).size === codes.length
  );
}

export function itemsValid(drafts: readonly ItemDraft[]): boolean {
  const keys = drafts.map((d) => `${d.frameworkKey}\u0000${d.code.trim()}`);
  return (
    drafts.every((d) => d.label.trim() !== '' && d.code.trim() !== '') && new Set(keys).size === keys.length
  );
}

/** Sama bila isi (bukan kunci lokal) tidak berubah; dipakai penanda "belum disimpan". */
export function sameDrafts<T extends { key: string }>(a: readonly T[], b: readonly T[]): boolean {
  const strip = (list: readonly T[]) => JSON.stringify(list.map(({ key: _key, ...rest }) => rest));
  return strip(a) === strip(b);
}
