import { describe, expect, it } from 'vitest';
import {
  cardElementSchema,
  cardLayoutSchema,
  codeFieldsFor,
  defaultExamCardLayout,
  defaultStudentCardLayout,
  formatIdentityPayload,
  formatParticipantNo,
  hasIdentityPrefix,
  IDENTITY_CODE_ALPHABET,
  invalidFieldsForKind,
  parseIdentityPayload,
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

  it('qr dan kode batang: kartu siswa hanya qrCode, kartu ujian hanya participantNo', () => {
    const qr = { type: 'qr', x: 0, y: 0, w: 10, h: 10 };
    expect(cardElementSchema.safeParse({ ...qr, field: 'name' }).success).toBe(false);
    const parse = (type: 'qr' | 'barcode', field: string) =>
      cardElementSchema.parse({ ...qr, type, w: 55, h: 8, field });
    for (const type of ['qr', 'barcode'] as const) {
      expect(invalidFieldsForKind('student', [parse(type, 'qrCode')])).toEqual([]);
      expect(invalidFieldsForKind('student', [parse(type, 'nis')])).toHaveLength(1);
      expect(invalidFieldsForKind('student', [parse(type, 'rfidCode')])).toHaveLength(1);
      expect(invalidFieldsForKind('exam', [parse(type, 'participantNo')])).toEqual([]);
      expect(invalidFieldsForKind('exam', [parse(type, 'nis')])).toHaveLength(1);
    }
    expect(codeFieldsFor('student')).toEqual(['qrCode']);
    expect(codeFieldsFor('exam')).toEqual(['participantNo']);
  });

  it('NIS dan kode RFID tetap bisa tampil sebagai teks biasa', () => {
    const text = (field: string) =>
      cardElementSchema.parse({ type: 'field', field, x: 0, y: 0, w: 20, h: 5 });
    expect(invalidFieldsForKind('student', [text('nis'), text('rfidCode')])).toEqual([]);
  });

  it('kartu siswa bawaan tidak memuat kode batang dan tetap di dalam kartu', () => {
    const layout = defaultStudentCardLayout();
    expect(layout.elements.some((e) => e.type === 'barcode')).toBe(false);
    expect(layout.elements.some((e) => e.type === 'field' && e.field === 'nis')).toBe(true);
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

  it('kartu siswa bawaan memuat QR absensi yang mengikat qrCode', () => {
    const els = defaultStudentCardLayout().elements;
    expect(els.some((e) => e.type === 'qr' && e.field === 'qrCode')).toBe(true);
    expect(defaultExamCardLayout().elements.some((e) => e.type === 'qr' && e.field === 'qrCode')).toBe(false);
  });

  it('qrCode berlaku untuk kartu siswa saja dan hanya sebagai gambar kode', () => {
    const qr = cardElementSchema.parse({ type: 'qr', field: 'qrCode', x: 0, y: 0, w: 10, h: 10 });
    expect(invalidFieldsForKind('student', [qr])).toEqual([]);
    expect(invalidFieldsForKind('exam', [qr])).toEqual(['qrCode']);
    const bar = cardElementSchema.parse({ type: 'barcode', field: 'qrCode', x: 0, y: 0, w: 55, h: 8 });
    expect(invalidFieldsForKind('student', [bar])).toEqual([]);
    expect(invalidFieldsForKind('exam', [bar])).toEqual(['qrCode']);
    const asText = cardElementSchema.parse({ type: 'field', field: 'qrCode', x: 0, y: 0, w: 10, h: 5 });
    expect(invalidFieldsForKind('student', [asText])).toEqual(['qrCode']);
  });

  it('resolveFieldValue mengembalikan isi QR apa adanya', () => {
    expect(resolveFieldValue('qrCode', { qrCode: 'ES1.ABC' })).toBe('ES1.ABC');
    expect(resolveFieldValue('qrCode', {})).toBe('');
  });

  it('parseIdentityPayload: format ES1.<20 karakter Crockford>', () => {
    const code = 'ABCDEFGHJKMNPQRSTVWX';
    expect(IDENTITY_CODE_ALPHABET).toHaveLength(32);
    expect(parseIdentityPayload(formatIdentityPayload(code))).toBe(code);
    expect(parseIdentityPayload(`  es1.${code.toLowerCase()} `)).toBe(code);
    expect(parseIdentityPayload(`ES1.${code}A`)).toBeNull();
    expect(parseIdentityPayload(`ES1.${code.slice(1)}`)).toBeNull();
    expect(parseIdentityPayload(`ES1.${code.slice(1)}I`)).toBeNull(); // I tidak ada di abjad
    expect(parseIdentityPayload(`ES2.${code}`)).toBeNull();
    expect(parseIdentityPayload('https://contoh.id')).toBeNull();
    expect(parseIdentityPayload(null)).toBeNull();
    expect(hasIdentityPrefix('ES1.apa-saja')).toBe(true);
    expect(hasIdentityPrefix('WIFI:S:x')).toBe(false);
  });
});
