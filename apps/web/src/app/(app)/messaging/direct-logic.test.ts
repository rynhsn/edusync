import { describe, expect, it } from 'vitest';
import {
  EMPTY_PICK,
  estimateMinutes,
  hasPick,
  insertAt,
  lacksVariation,
  type PickItem,
  toSelection,
} from './direct-logic';

const item = (id: string): PickItem => ({ id, label: id, hint: null });

describe('direct-logic', () => {
  it('toSelection membuang larik kosong dan hanya menulis guardianScope bila bukan bawaan', () => {
    expect(toSelection(EMPTY_PICK)).toEqual({});
    expect(hasPick(EMPTY_PICK)).toBe(false);
    const p = {
      ...EMPTY_PICK,
      students: [item('a'), item('b')],
      teachers: [item('t')],
      guardianScope: 'all' as const,
    };
    expect(toSelection(p)).toEqual({ students: ['a', 'b'], teachers: ['t'], guardianScope: 'all' });
    expect(hasPick(p)).toBe(true);
    expect(toSelection({ ...EMPTY_PICK, wholeSchool: true, allStaff: true })).toEqual({
      wholeSchool: true,
      allStaff: true,
    });
    expect(hasPick({ ...EMPTY_PICK, allStaff: true })).toBe(true);
  });

  it('estimateMinutes membulatkan ke atas dan 0 untuk tanpa penerima', () => {
    expect(estimateMinutes(0, 10)).toBe(0);
    expect(estimateMinutes(1, 10)).toBe(1);
    expect(estimateMinutes(30, 10)).toBe(5);
    expect(estimateMinutes(31, 10)).toBe(6);
  });

  it('lacksVariation mengenali pesan tanpa pengganti nama', () => {
    expect(lacksVariation('Rapat Senin')).toBe(true);
    expect(lacksVariation('Yth. {{guardian}}')).toBe(false);
    expect(lacksVariation('{{ student }} hadir')).toBe(false);
    expect(lacksVariation('Di {{school}} pada {{date}}')).toBe(true);
  });

  it('insertAt menyisipkan di kursor dan mengganti pilihan', () => {
    expect(insertAt('Halo ', '{{guardian}}', 5, 5)).toEqual({ text: 'Halo {{guardian}}', cursor: 17 });
    expect(insertAt('Halo XX!', '{{student}}', 5, 7)).toEqual({ text: 'Halo {{student}}!', cursor: 16 });
  });
});
