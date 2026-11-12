import { describe, expect, it } from 'vitest';
import {
  groupLabel,
  groupLabelByKey,
  groupsForPicker,
  isLegacyGroup,
  isReligionGroup,
  religionVariantFor,
  type SubjectGroupRef,
} from './subject-groups';

const g = (
  key: string,
  sort: number,
  profileKeys: string[] | null = null,
  active = true,
): SubjectGroupRef => ({
  key,
  labelId: `${key}-id`,
  labelEn: `${key}-en`,
  labelSu: `${key}-su`,
  profileKeys,
  sort,
  active,
});

const groups = [
  g('local_content', 80),
  g('religion', 10),
  g('vocational', 40, ['smk', 'mak']),
  g('vocational_base', 41, ['smk', 'mak']),
  g('pai_arabic', 30, ['mi', 'mts', 'ma', 'mak']),
  g('retired', 90, null, false),
];

const keys = (list: SubjectGroupRef[]) => list.map((x) => x.key);

describe('label kelompok', () => {
  it('mengikuti bahasa aktif dan jatuh ke bahasa Indonesia untuk bahasa lain', () => {
    const x = g('religion', 1);
    expect(groupLabel(x, 'id')).toBe('religion-id');
    expect(groupLabel(x, 'en')).toBe('religion-en');
    expect(groupLabel(x, 'su')).toBe('religion-su');
    expect(groupLabel(x, 'jv')).toBe('religion-id');
  });
  it('label kosong jatuh ke bahasa Indonesia', () => {
    expect(groupLabel({ ...g('a', 1), labelEn: '' }, 'en')).toBe('a-id');
  });
  it('menurut kunci: kunci tak dikenal ditampilkan apa adanya, kosong menjadi kosong', () => {
    expect(groupLabelByKey(groups, 'religion', 'en')).toBe('religion-en');
    expect(groupLabelByKey(groups, 'mystery', 'en')).toBe('mystery');
    expect(groupLabelByKey(groups, null, 'en')).toBe('');
  });
});

describe('pilihan kelompok', () => {
  it('menyaring menurut profil dan mengurutkan menurut sort', () => {
    expect(keys(groupsForPicker(groups, { profileKey: 'smk' }))).toEqual([
      'religion',
      'vocational',
      'local_content',
    ]);
    expect(keys(groupsForPicker(groups, { profileKey: 'mts' }))).toEqual([
      'religion',
      'pai_arabic',
      'local_content',
    ]);
  });
  it('profil tak diketahui menampilkan semua kelompok non-lama yang aktif', () => {
    expect(keys(groupsForPicker(groups, {}))).toEqual([
      'religion',
      'pai_arabic',
      'vocational',
      'local_content',
    ]);
  });
  it('kelompok lama tampil hanya bila dipakai atau sedang dipilih', () => {
    expect(isLegacyGroup({ key: 'vocational_base' })).toBe(true);
    expect(keys(groupsForPicker(groups, { profileKey: 'smk' }))).not.toContain('vocational_base');
    expect(
      keys(groupsForPicker(groups, { profileKey: 'smk', usedKeys: new Set(['vocational_base']) })),
    ).toContain('vocational_base');
    expect(keys(groupsForPicker(groups, { profileKey: 'smk', currentKey: 'vocational_base' }))).toContain(
      'vocational_base',
    );
  });
  it('kelompok yang sedang dipilih tetap tampil walau tak berlaku atau nonaktif', () => {
    expect(keys(groupsForPicker(groups, { profileKey: 'smk', currentKey: 'pai_arabic' }))).toContain(
      'pai_arabic',
    );
    expect(keys(groupsForPicker(groups, { profileKey: 'smk', currentKey: 'retired' }))).toContain('retired');
  });
});

describe('varian agama', () => {
  it('hanya untuk kelompok agama', () => {
    expect(isReligionGroup('religion')).toBe(true);
    expect(isReligionGroup('general')).toBe(false);
    expect(religionVariantFor({ subjectGroup: 'religion', religionVariant: 'islam' })).toBe('islam');
    expect(religionVariantFor({ subjectGroup: 'general', religionVariant: 'islam' })).toBeNull();
    expect(religionVariantFor({ subjectGroup: 'religion', religionVariant: '' })).toBeNull();
  });
});
