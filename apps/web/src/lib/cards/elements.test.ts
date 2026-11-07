import { type CardElement, defaultExamCardLayout, defaultStudentCardLayout } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_PRESETS,
  clampElement,
  codeText,
  createElement,
  duplicateElement,
  elementText,
  ensureIds,
  hasAttendanceQr,
  moveInOrder,
  removeElement,
  resizeCanvas,
  sampleCardData,
  validateLayout,
} from './elements';

const canvas = { w: 86, h: 54 };
const FILE_ID = '2b2f5c1e-8a3b-4c64-9f0e-3d1d6d7f7a11';

describe('createElement', () => {
  it('membuat elemen sah untuk semua jenis, di dalam kanvas', () => {
    for (const type of ['text', 'field', 'photo', 'qr', 'barcode', 'rect', 'line'] as const) {
      const el = createElement(type, 'student', canvas);
      expect(el.type).toBe(type);
      expect(el.id).toBeTruthy();
      expect(validateLayout({ widthMm: 86, heightMm: 54, elements: [el] }), type).toEqual([]);
    }
    const img = createElement('image', 'student', canvas, { fileId: FILE_ID });
    expect(validateLayout({ widthMm: 86, heightMm: 54, elements: [img] })).toEqual([]);
  });

  it('kolom pertama sesuai jenis kartu', () => {
    const el = createElement('field', 'exam', canvas);
    expect(el.type === 'field' && el.field).toBe('name');
  });

  it('kanvas kecil: elemen diperkecil agar muat', () => {
    const el = createElement('barcode', 'student', { w: 30, h: 20 });
    expect(el.x + el.w).toBeLessThanOrEqual(30);
    expect(el.y + el.h).toBeLessThanOrEqual(20);
  });

  it('id unik', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createElement('text', 'student', canvas).id));
    expect(ids.size).toBe(50);
  });
});

describe('ensureIds', () => {
  it('memberi id unik pada templat bawaan', () => {
    const els = ensureIds(defaultStudentCardLayout().elements);
    expect(els.every((e) => !!e.id)).toBe(true);
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
  });
  it('id kembar diganti', () => {
    const a = createElement('text', 'student', canvas);
    const els = ensureIds([a, { ...a }]);
    expect(els[0]?.id).not.toBe(els[1]?.id);
  });
});

describe('urutan lapisan', () => {
  const mk = () => ['a', 'b', 'c'].map((id) => ({ ...createElement('rect', 'student', canvas), id }));
  const ids = (l: { id?: string | undefined }[]) => l.map((e) => e.id).join('');
  it('maju, mundur, depan, belakang', () => {
    expect(ids(moveInOrder(mk(), 'a', 'forward'))).toBe('bac');
    expect(ids(moveInOrder(mk(), 'c', 'backward'))).toBe('acb');
    expect(ids(moveInOrder(mk(), 'a', 'front'))).toBe('bca');
    expect(ids(moveInOrder(mk(), 'c', 'back'))).toBe('cab');
    expect(ids(moveInOrder(mk(), 'c', 'forward'))).toBe('abc');
    expect(ids(moveInOrder(mk(), 'zz', 'front'))).toBe('abc');
  });
  it('hapus elemen', () => {
    expect(ids(removeElement(mk(), 'b'))).toBe('ac');
  });
});

describe('duplicateElement', () => {
  it('menyalin tepat di atas aslinya dengan id baru dan digeser', () => {
    const base = { ...createElement('rect', 'student', canvas), id: 'a', x: 10, y: 10 } as CardElement;
    const r = duplicateElement([base], 'a', canvas);
    expect(r?.elements).toHaveLength(2);
    expect(r?.elements[1]?.id).toBe(r?.newId);
    expect(r?.newId).not.toBe('a');
    expect(r?.elements[1]?.x).toBe(12);
  });
  it('null bila sudah 60 elemen atau id tidak ada', () => {
    const many = Array.from({ length: 60 }, () => createElement('rect', 'student', canvas));
    expect(duplicateElement(many, many[0]?.id as string, canvas)).toBeNull();
    expect(duplicateElement([], 'x', canvas)).toBeNull();
  });
});

describe('ukuran kanvas', () => {
  it('resizeCanvas memasukkan elemen ke kanvas baru dan membatasi ukuran', () => {
    const layout = defaultStudentCardLayout();
    const small = resizeCanvas(layout, 54, 30);
    expect(small.widthMm).toBe(54);
    expect(validateLayout(small)).toEqual([]);
    const huge = resizeCanvas(layout, 9999, 5);
    expect(huge.widthMm).toBe(300);
    expect(huge.heightMm).toBe(20);
  });

  it('clampElement menjaga garis tetap lurus', () => {
    const line = { ...createElement('line', 'student', canvas), x: 80, y: 10 } as CardElement;
    const c = clampElement(line, canvas);
    expect(c.h).toBe(0);
    expect(c.x + c.w).toBeLessThanOrEqual(86);
  });

  it('semua preset berukuran sah', () => {
    for (const p of CANVAS_PRESETS) {
      expect(p.w).toBeGreaterThanOrEqual(20);
      expect(p.h).toBeLessThanOrEqual(300);
    }
  });
});

describe('validateLayout', () => {
  it('templat bawaan sah', () => {
    expect(validateLayout(defaultStudentCardLayout())).toEqual([]);
    expect(validateLayout(defaultExamCardLayout())).toEqual([]);
  });

  it('elemen di luar kartu dilaporkan dengan nomor elemen', () => {
    const el = { ...createElement('rect', 'student', canvas), x: 80, w: 20 };
    const issues = validateLayout({ widthMm: 86, heightMm: 54, elements: [el] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.element).toBe(1);
  });

  it('warna salah dilaporkan beserta kolomnya', () => {
    const el = { ...createElement('text', 'student', canvas), color: 'merah' };
    const issues = validateLayout({ widthMm: 86, heightMm: 54, elements: [el] });
    expect(issues[0]).toMatchObject({ element: 1, field: 'color' });
  });
});

describe('teks elemen dan data contoh', () => {
  it('kolom terikat memakai awalan dan nilai', () => {
    const data = sampleCardData('student');
    const el = { ...createElement('field', 'student', canvas), field: 'nis', prefix: 'NIS: ' } as CardElement;
    expect(elementText(el, data)).toBe('NIS: 2024001');
  });

  it('jenis kelamin diterjemahkan dan kode diambil dari kolom', () => {
    const data = sampleCardData('student');
    const g = { ...createElement('field', 'student', canvas), field: 'gender' } as CardElement;
    expect(elementText(g, data)).toBe('Laki-laki');
    const q = { ...createElement('qr', 'student', canvas), field: 'rfidCode' } as CardElement;
    expect(codeText(q, data)).toBe('04A1B2C3');
  });

  it('contoh kartu ujian memuat nomor peserta menurut aturan', () => {
    expect(sampleCardData('exam').participantNo).toBe('ASTS-26-007');
  });
});

describe('QR absensi', () => {
  it('contoh kartu siswa memuat QR bergaya ES1. dan bisa dipakai elemen QR', () => {
    const data = sampleCardData('student');
    expect(data.qrCode).toMatch(/^ES1\.[0-9A-HJKMNP-TV-Z]{20}$/);
    const q = { ...createElement('qr', 'student', canvas), field: 'qrCode' } as CardElement;
    expect(codeText(q, data)).toBe(data.qrCode);
    expect(validateLayout({ widthMm: 86, heightMm: 54, elements: [q] })).toEqual([]);
  });

  it('hasAttendanceQr: templat bawaan punya, templat lama tanpa elemen itu tidak', () => {
    const layout = defaultStudentCardLayout();
    expect(hasAttendanceQr(layout)).toBe(true);
    const old = {
      ...layout,
      elements: layout.elements.filter((e) => !(e.type === 'qr' && e.field === 'qrCode')),
    };
    expect(hasAttendanceQr(old)).toBe(false);
    const nisQr = { ...createElement('qr', 'student', canvas), field: 'nis' } as CardElement;
    expect(hasAttendanceQr({ elements: [nisQr] })).toBe(false);
  });
});
