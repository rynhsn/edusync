import { describe, expect, it } from 'vitest';
import {
  breakKey,
  canRedo,
  canUndo,
  commitFrom,
  createHistory,
  HISTORY_LIMIT,
  redo,
  replacePresent,
  setPresent,
  undo,
} from './history';

describe('riwayat undo/redo', () => {
  it('set menyimpan langkah dan undo/redo bergerak maju-mundur', () => {
    let h = createHistory(1);
    h = setPresent(h, 2);
    h = setPresent(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
  });

  it('perubahan baru setelah undo menghapus jalur redo', () => {
    let h = setPresent(setPresent(createHistory(1), 2), 3);
    h = undo(h);
    h = setPresent(h, 9);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(2);
  });

  it('kunci yang sama digabung menjadi satu langkah', () => {
    let h = createHistory('a');
    h = setPresent(h, 'ab', 'text');
    h = setPresent(h, 'abc', 'text');
    expect(h.past).toEqual(['a']);
    h = setPresent(h, 'abcd', 'other');
    expect(h.past).toEqual(['a', 'abc']);
    h = breakKey(h);
    h = setPresent(h, 'abcde', 'other');
    expect(h.past).toEqual(['a', 'abc', 'abcd']);
  });

  it('replace tidak menambah langkah, commit menambahkan keadaan awal seretan', () => {
    let h = createHistory({ x: 0 });
    const base = h.present;
    h = replacePresent(h, { x: 1 });
    h = replacePresent(h, { x: 2 });
    expect(h.past).toHaveLength(0);
    h = commitFrom(h, base);
    expect(h.past).toEqual([{ x: 0 }]);
    expect(undo(h).present).toEqual({ x: 0 });
  });

  it('commit tanpa perubahan tidak membuat langkah', () => {
    const h = createHistory({ x: 0 });
    expect(commitFrom(h, h.present)).toBe(h);
  });

  it('riwayat dibatasi', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = setPresent(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
  });
});
