import { describe, expect, it } from 'vitest';
import {
  countWritable,
  firstEditableIndex,
  isReadOnlyRow,
  nextEditableIndex,
  rowsToSubmit,
  writableRows,
} from './read-only-rows';

interface R {
  id: string;
  studentStatus?: string | null;
  filled?: boolean;
}

const rows: R[] = [
  { id: 'a', studentStatus: 'graduated', filled: true },
  { id: 'b', studentStatus: 'active', filled: true },
  { id: 'c', filled: false },
  { id: 'd', studentStatus: 'graduated', filled: false },
  { id: 'e', studentStatus: null, filled: true },
];

describe('isReadOnlyRow', () => {
  it('hanya lulusan yang baca-saja; field kosong (server lama) dapat diubah', () => {
    expect(isReadOnlyRow({ studentStatus: 'graduated' })).toBe(true);
    expect(isReadOnlyRow({ studentStatus: 'active' })).toBe(false);
    expect(isReadOnlyRow({ studentStatus: null })).toBe(false);
    expect(isReadOnlyRow({})).toBe(false);
  });
});

describe('writableRows', () => {
  it('membuang baris lulusan', () => {
    expect(writableRows(rows).map((r) => r.id)).toEqual(['b', 'c', 'e']);
  });
});

describe('rowsToSubmit', () => {
  it('tidak pernah mengirim lulusan, meski memenuhi syarat kirim', () => {
    expect(rowsToSubmit(rows, (r) => !!r.filled).map((r) => r.id)).toEqual(['b', 'e']);
    expect(rowsToSubmit(rows, () => true).map((r) => r.id)).toEqual(['b', 'c', 'e']);
  });
  it('semua lulusan: tidak ada yang dikirim', () => {
    expect(rowsToSubmit([{ studentStatus: 'graduated' }], () => true)).toEqual([]);
  });
});

describe('countWritable', () => {
  it('menghitung yang perlu diisi tanpa baris baca-saja', () => {
    expect(countWritable(rows, (r) => !r.filled)).toBe(1);
    expect(countWritable(rows, () => true)).toBe(3);
  });
});

describe('nextEditableIndex', () => {
  it('melewati baris baca-saja ke bawah dan ke atas', () => {
    expect(nextEditableIndex(rows, 1, 1)).toBe(2);
    expect(nextEditableIndex(rows, 2, 1)).toBe(4);
    expect(nextEditableIndex(rows, 1, -1)).toBeNull();
    expect(nextEditableIndex(rows, 4, -1)).toBe(2);
  });
  it('null di ujung daftar dan menghormati syarat tambahan', () => {
    expect(nextEditableIndex(rows, 4, 1)).toBeNull();
    expect(nextEditableIndex(rows, 1, 1, (r) => !!r.filled)).toBe(4);
  });
});

describe('firstEditableIndex', () => {
  it('baris pertama yang boleh diubah, atau -1', () => {
    expect(firstEditableIndex(rows)).toBe(1);
    expect(firstEditableIndex([{ studentStatus: 'graduated' }])).toBe(-1);
  });
});
