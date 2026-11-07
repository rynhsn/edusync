import { describe, expect, it } from 'vitest';
import {
  cardElementSchema,
  cardLayoutSchema,
  defaultExamCardLayout,
  defaultStudentCardLayout,
  formatParticipantNo,
  invalidFieldsForKind,
  resolveFieldValue,
} from './card-layout';

describe('card-layout', () => {
  it('tata letak bawaan lolos skema dan cocok dengan kolom jenisnya', () => {
    const s = cardLayoutSchema.safeParse(defaultStudentCardLayout());
    const e = cardLayoutSchema.safeParse(defaultExamCardLayout());
    expect(s.success, JSON.stringify(s.error?.issues)).toBe(true);
    expect(e.success, JSON.stringify(e.error?.issues)).toBe(true);
    expect(defaultStudentCardLayout()).toMatchObject({ widthMm: 86, heightMm: 54 });
    expect(defaultExamCardLayout()).toMatchObject({ widthMm: 100, heightMm: 60 });
    expect(invalidFieldsForKind('student', defaultStudentCardLayout().elements)).toEqual([]);
    expect(invalidFieldsForKind('exam', defaultExamCardLayout().elements)).toEqual([]);
  });

  it('kolom terikat dibatasi menurut jenis kartu', () => {
    expect(invalidFieldsForKind('student', defaultExamCardLayout().elements).sort()).toEqual(
      ['date', 'examTitle', 'participantNo', 'room'].sort(),
    );
  });

  it('menolak elemen di luar kanvas, kolom tak dikenal, dan terlalu banyak elemen', () => {
    const base = { widthMm: 86, heightMm: 54 };
    const text = { type: 'text', text: 'A', x: 80, y: 0, w: 10, h: 5 };
    expect(cardLayoutSchema.safeParse({ ...base, elements: [text] }).success).toBe(false);
    expect(cardLayoutSchema.safeParse({ ...base, elements: [{ ...text, x: 76 }] }).success).toBe(true);
    expect(
      cardLayoutSchema.safeParse({
        ...base,
        elements: [{ type: 'field', field: 'password', x: 0, y: 0, w: 10, h: 5 }],
      }).success,
    ).toBe(false);
    const many = Array.from({ length: 61 }, () => ({ type: 'text', text: 'A', x: 0, y: 0, w: 5, h: 5 }));
    expect(cardLayoutSchema.safeParse({ ...base, elements: many }).success).toBe(false);
    expect(cardLayoutSchema.safeParse({ widthMm: 10, heightMm: 54, elements: [] }).success).toBe(false);
  });

  it('qr dan kode batang hanya boleh mengikat nis, rfidCode, atau participantNo', () => {
    const qr = { type: 'qr', x: 0, y: 0, w: 10, h: 10 };
    expect(cardElementSchema.safeParse({ ...qr, field: 'nis' }).success).toBe(true);
    expect(cardElementSchema.safeParse({ ...qr, field: 'name' }).success).toBe(false);
    expect(cardElementSchema.safeParse({ ...qr, type: 'barcode', field: 'participantNo' }).success).toBe(
      true,
    );
  });

  it('garis boleh bernilai nol di satu sumbu, kotak lain tidak', () => {
    expect(cardElementSchema.safeParse({ type: 'line', x: 0, y: 5, w: 40, h: 0 }).success).toBe(true);
    expect(cardElementSchema.safeParse({ type: 'rect', x: 0, y: 5, w: 40, h: 0 }).success).toBe(false);
    expect(
      cardElementSchema.safeParse({ type: 'text', text: 'A', x: 0, y: 0, w: 5, h: 5, color: 'red' }).success,
    ).toBe(false);
  });

  it('resolveFieldValue: kosong, larik, dan jenis kelamin', () => {
    expect(resolveFieldValue('name', { name: '  Ani  ' })).toBe('Ani');
    expect(resolveFieldValue('nis', {})).toBe('');
    expect(resolveFieldValue('nis', { nis: null })).toBe('');
    expect(resolveFieldValue('subjectList', { subjectList: ['IPA', 'IPS'] })).toBe('IPA\nIPS');
    expect(resolveFieldValue('gender', { gender: 'P' })).toBe('Perempuan');
    expect(resolveFieldValue('gender', { gender: 'L' })).toBe('Laki-laki');
  });

  it('formatParticipantNo: singkatan, tahun, dan urutan 3 digit', () => {
    expect(formatParticipantNo('asts', '2026-07-13', 7)).toBe('ASTS-26-007');
    expect(formatParticipantNo('', 'x', 1234)).toBe('UJN-00-1234');
  });
});
