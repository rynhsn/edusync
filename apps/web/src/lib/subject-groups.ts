/**
 * Logika murni kelompok mapel (fase 2C, K1): label menurut bahasa, penyaringan menurut profil jenjang,
 * dan pembentukan isian jenis/varian agama. Tanpa React dan tanpa jaringan supaya mudah diuji.
 * Daftar sah ada di acuan platform (`GET /v1/reference/subject-groups`), bukan di kode.
 */

export interface SubjectGroupRef {
  key: string;
  labelId: string;
  labelEn: string;
  labelSu: string;
  /** null = berlaku untuk semua profil jenjang. */
  profileKeys: string[] | null;
  sort: number;
  active: boolean;
}

/** Kunci kelompok lama (sebelum fase 2C); tetap valid untuk data lama tetapi tidak ditawarkan untuk mapel baru. */
export const LEGACY_GROUP_KEYS: readonly string[] = [
  'vocational_base',
  'vocational_concentration',
  'vocational_project',
];

export const SUBJECT_KIND_KEYS = [
  'compulsory',
  'elective',
  'local_content',
  'project',
  'internship',
] as const;
export type SubjectKindKey = (typeof SUBJECT_KIND_KEYS)[number];

export const RELIGION_VARIANT_KEYS = [
  'islam',
  'christian',
  'catholic',
  'hindu',
  'buddhist',
  'confucian',
  'belief',
] as const;
export type ReligionVariantKey = (typeof RELIGION_VARIANT_KEYS)[number];

/** Hanya kelompok "religion" yang memakai varian agama. */
export const RELIGION_GROUP_KEY = 'religion';

export function isReligionGroup(groupKey: string | null | undefined): boolean {
  return groupKey === RELIGION_GROUP_KEY;
}

/** Label kelompok menurut bahasa aktif (id, en, su); bahasa lain memakai bahasa Indonesia. */
export function groupLabel(group: SubjectGroupRef, locale: string): string {
  if (locale === 'en') return group.labelEn || group.labelId;
  if (locale === 'su') return group.labelSu || group.labelId;
  return group.labelId;
}

/** Label menurut kunci; kunci yang tidak ada di acuan ditampilkan apa adanya supaya data tidak tersembunyi. */
export function groupLabelByKey(
  groups: readonly SubjectGroupRef[],
  key: string | null | undefined,
  locale: string,
): string {
  if (!key) return '';
  const g = groups.find((x) => x.key === key);
  return g ? groupLabel(g, locale) : key;
}

export function isLegacyGroup(group: Pick<SubjectGroupRef, 'key'>): boolean {
  return LEGACY_GROUP_KEYS.includes(group.key);
}

/**
 * Kelompok yang ditawarkan di pilihan: yang aktif dan berlaku untuk profil sekolah (profil tak diketahui = semua),
 * ditambah kelompok lama bila sudah dipakai mapel (`usedKeys`) atau sedang dipilih (`currentKey`). Urut menurut `sort`.
 */
export function groupsForPicker(
  groups: readonly SubjectGroupRef[],
  opts: { profileKey?: string | null; usedKeys?: ReadonlySet<string>; currentKey?: string | null },
): SubjectGroupRef[] {
  const used = opts.usedKeys ?? new Set<string>();
  const keep = (g: SubjectGroupRef) => {
    if (g.key === opts.currentKey) return true;
    if (isLegacyGroup(g)) return used.has(g.key);
    if (!g.active) return false;
    if (!g.profileKeys || !opts.profileKey) return true;
    return g.profileKeys.includes(opts.profileKey) || used.has(g.key);
  };
  return groups.filter(keep).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
}

export interface SubjectKindDraft {
  subjectGroup: string;
  kind: SubjectKindKey;
  religionVariant: ReligionVariantKey | '';
}

/** Varian agama hanya berlaku bagi kelompok agama; di kelompok lain dikosongkan (null) supaya server ikut membersihkan. */
export function religionVariantFor(d: Pick<SubjectKindDraft, 'subjectGroup' | 'religionVariant'>) {
  return isReligionGroup(d.subjectGroup) && d.religionVariant !== '' ? d.religionVariant : null;
}
