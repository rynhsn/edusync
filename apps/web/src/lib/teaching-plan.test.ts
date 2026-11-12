import { describe, expect, it } from 'vitest';
import {
  addObjectives,
  type DraftItem,
  groupByPhase,
  itemsChanged,
  MAX_FLOW_ITEMS,
  moveItem,
  parseQuantity,
  removeItemAt,
  reorderObjectives,
  toDraftItems,
  toRequestItems,
  totalsOf,
} from './teaching-plan';

const draft = (objectiveId: string, over: Partial<DraftItem> = {}): DraftItem => ({
  objectiveId,
  weeks: '',
  periods: '',
  semesterId: '',
  note: '',
  ...over,
});

describe('parseQuantity', () => {
  it('mengurai isian', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('  ')).toBeNull();
    expect(parseQuantity('0')).toBe(0);
    expect(parseQuantity(' 12 ')).toBe(12);
    expect(parseQuantity('9999')).toBe(9999);
  });
  it('menolak yang tidak sah', () => {
    for (const s of ['10000', '-1', '1.5', 'a', '1e3', '12345']) expect(parseQuantity(s)).toBe('invalid');
  });
});

describe('moveItem dan removeItemAt', () => {
  it('menggeser naik dan turun', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('di luar batas tidak berubah dan tidak mengubah masukan', () => {
    const src = ['a', 'b'];
    expect(moveItem(src, 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(src, 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(src, 5, 1)).toEqual(['a', 'b']);
    expect(src).toEqual(['a', 'b']);
  });
  it('menghapus berdasarkan indeks', () => {
    expect(removeItemAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });
});

describe('addObjectives', () => {
  it('menambah ke akhir dan melewati yang sudah ada', () => {
    const r = addObjectives([draft('a')], ['a', 'b', 'b', 'c']);
    expect(r.items.map((i) => i.objectiveId)).toEqual(['a', 'b', 'c']);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(0);
  });
  it('dibatasi maksimum item', () => {
    const full = Array.from({ length: MAX_FLOW_ITEMS - 1 }, (_, i) => draft(`o${i}`));
    const r = addObjectives(full, ['x', 'y', 'z']);
    expect(r.items).toHaveLength(MAX_FLOW_ITEMS);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(2);
  });
});

describe('toDraftItems dan toRequestItems', () => {
  it('bolak-balik tanpa kehilangan isian', () => {
    const server = [
      { objectiveId: 'a', weeks: 2, periods: 6, semesterId: 's1', note: 'catatan' },
      { objectiveId: 'b', weeks: null, periods: null, semesterId: null, note: null },
    ];
    const res = toRequestItems(toDraftItems(server));
    expect(res).toEqual({ ok: true, items: server });
  });
  it('0 adalah angka sah, bukan kosong', () => {
    const res = toRequestItems([draft('a', { weeks: '0' })]);
    expect(res.ok && res.items[0]?.weeks).toBe(0);
  });
  it('melaporkan isian angka yang salah beserta barisnya', () => {
    const res = toRequestItems([draft('a'), draft('b', { periods: 'x' })]);
    expect(res).toEqual({ ok: false, problem: { kind: 'quantity', index: 1, field: 'periods' } });
  });
  it('menolak TP ganda dan terlalu banyak item', () => {
    expect(toRequestItems([draft('a'), draft('a')])).toEqual({
      ok: false,
      problem: { kind: 'duplicate_entry' },
    });
    const many = Array.from({ length: MAX_FLOW_ITEMS + 1 }, (_, i) => draft(`o${i}`));
    expect(toRequestItems(many)).toEqual({ ok: false, problem: { kind: 'too_many' } });
  });
  it('catatan hanya spasi dianggap kosong', () => {
    const res = toRequestItems([draft('a', { note: '   ' })]);
    expect(res.ok && res.items[0]?.note).toBeNull();
  });
});

describe('itemsChanged', () => {
  const saved = [
    { objectiveId: 'a', weeks: 2, periods: null, semesterId: null, note: null },
    { objectiveId: 'b', weeks: null, periods: null, semesterId: null, note: null },
  ];
  it('sama berarti tidak berubah', () => {
    expect(itemsChanged(saved, toDraftItems(saved))).toBe(false);
  });
  it('urutan, isian, dan jumlah dihitung', () => {
    const d = toDraftItems(saved);
    expect(itemsChanged(saved, moveItem(d, 0, 1))).toBe(true);
    expect(itemsChanged(saved, [d[0] as DraftItem, { ...(d[1] as DraftItem), periods: '4' }])).toBe(true);
    expect(itemsChanged(saved, removeItemAt(d, 1))).toBe(true);
  });
  it('spasi di sekitar isian tidak dihitung', () => {
    const d = toDraftItems(saved);
    expect(itemsChanged(saved, [{ ...(d[0] as DraftItem), weeks: ' 2 ' }, d[1] as DraftItem])).toBe(false);
  });
});

describe('totalsOf', () => {
  it('menjumlah dan mengabaikan kosong atau tak sah', () => {
    expect(
      totalsOf([
        draft('a', { weeks: '2', periods: '6' }),
        draft('b', { weeks: 'x', periods: '4' }),
        draft('c'),
      ]),
    ).toEqual({ weeks: 2, periods: 10 });
  });
});

describe('reorderObjectives', () => {
  const objs = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
    { id: 'c', sortOrder: 2 },
  ];
  it('menukar dua tetangga saja', () => {
    expect(reorderObjectives(objs, 'b', -1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });
  it('di ujung tidak ada perubahan', () => {
    expect(reorderObjectives(objs, 'a', -1)).toEqual([]);
    expect(reorderObjectives(objs, 'c', 1)).toEqual([]);
    expect(reorderObjectives(objs, 'zzz', 1)).toEqual([]);
  });
  it('menomori ulang nomor urut yang renggang atau kembar', () => {
    const gappy = [
      { id: 'a', sortOrder: 5 },
      { id: 'b', sortOrder: 5 },
    ];
    expect(reorderObjectives(gappy, 'a', 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });
});

describe('groupByPhase', () => {
  it('mengelompokkan menurut urutan fase dan membuang yang kosong', () => {
    const rows = [
      { id: 1, phase: 'E' },
      { id: 2, phase: 'D' },
      { id: 3, phase: 'E' },
    ];
    expect(groupByPhase(rows, ['A', 'B', 'C', 'D', 'E', 'F'])).toEqual([
      { phase: 'D', rows: [rows[1]] },
      { phase: 'E', rows: [rows[0], rows[2]] },
    ]);
  });
});
