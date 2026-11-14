import { describe, expect, it } from 'vitest';
import {
  type ItemDraft,
  itemsBody,
  itemsValid,
  type LevelDraft,
  levelsBody,
  levelsValid,
  moveItem,
  refLabel,
  sameDrafts,
} from './cocurricular';

const item = (over: Partial<ItemDraft> = {}): ItemDraft => ({
  key: 'a',
  frameworkKey: 'f',
  refCode: null,
  code: 'c',
  label: 'Label',
  description: '',
  active: true,
  ...over,
});
const level = (over: Partial<LevelDraft> = {}): LevelDraft => ({
  key: 'a',
  code: 'SB',
  label: 'Sangat Baik',
  description: '',
  active: true,
  ...over,
});

describe('pembantu pengaturan kokurikuler', () => {
  it('refLabel memilih bahasa dan jatuh ke Indonesia', () => {
    const l = { labelId: 'Kewargaan', labelEn: 'Citizenship', labelSu: 'Kawargaan' };
    expect([refLabel(l, 'id'), refLabel(l, 'en'), refLabel(l, 'su'), refLabel(l, 'fr')]).toEqual([
      'Kewargaan',
      'Citizenship',
      'Kawargaan',
      'Kewargaan',
    ]);
  });

  it('moveItem menukar tetangga dan diam di ujung', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('itemsBody: urutan per kerangka, deskripsi kosong null, butir baru tanpa id', () => {
    const body = itemsBody([
      item({ id: 'x', frameworkKey: 'f1', code: ' a ' }),
      item({ frameworkKey: 'f2', description: '  uraian ' }),
      item({ frameworkKey: 'f1', code: 'b' }),
    ]);
    expect(body.map((b) => b.sort)).toEqual([10, 10, 20]);
    expect(body[0]).toMatchObject({ id: 'x', code: 'a', description: null });
    expect(body[1]).toMatchObject({ description: 'uraian' });
    expect(body[1]).not.toHaveProperty('id');
  });

  it('levelsBody memberi urutan dari 1', () => {
    expect(levelsBody([level(), level({ code: 'B' })]).map((l) => l.sort)).toEqual([1, 2]);
  });

  it('validasi menolak isian kosong, kode kembar, dan lebih dari 12 tingkat', () => {
    expect(levelsValid([level(), level({ code: 'B' })])).toBe(true);
    expect(levelsValid([level({ label: ' ' })])).toBe(false);
    expect(levelsValid([level(), level()])).toBe(false);
    expect(levelsValid(Array.from({ length: 13 }, (_, n) => level({ code: `L${n}` })))).toBe(false);
    expect(itemsValid([item(), item({ code: 'd' })])).toBe(true);
    expect(itemsValid([item(), item()])).toBe(false);
    expect(itemsValid([item({ frameworkKey: 'g' }), item()])).toBe(true);
  });

  it('sameDrafts mengabaikan kunci lokal', () => {
    expect(sameDrafts([item({ key: '1' })], [item({ key: '2' })])).toBe(true);
    expect(sameDrafts([item()], [item({ label: 'Lain' })])).toBe(false);
  });
});
