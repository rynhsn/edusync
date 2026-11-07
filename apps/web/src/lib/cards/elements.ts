import {
  type CardData,
  type CardElement,
  type CardKind,
  type CardLayout,
  cardFieldsFor,
  cardLayoutSchema,
  codeFieldsFor,
  formatParticipantNo,
  MAX_CARD_ELEMENTS,
  MAX_CARD_MM,
  MIN_CARD_MM,
  resolveFieldValue,
} from '@edusync/contracts';
import { type Box, clampBox, snap } from './geometry';

export type ElementType = CardElement['type'];

export const ELEMENT_TYPES: readonly ElementType[] = [
  'text',
  'field',
  'image',
  'photo',
  'qr',
  'barcode',
  'rect',
  'line',
];

export type PresetKey = 'cr80' | 'cr80Portrait' | 'exam' | 'a7' | 'a6' | 'a6Portrait' | 'a5';

export interface CanvasPreset {
  key: PresetKey;
  w: number;
  h: number;
}

/** Ukuran kartu yang umum. Nama tampilnya ada di i18n `cards.presets.<key>`. */
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { key: 'cr80', w: 86, h: 54 },
  { key: 'cr80Portrait', w: 54, h: 86 },
  { key: 'exam', w: 100, h: 60 },
  { key: 'a7', w: 105, h: 74 },
  { key: 'a6', w: 148, h: 105 },
  { key: 'a6Portrait', w: 105, h: 148 },
  { key: 'a5', w: 210, h: 148 },
];

export const boxOf = (el: Pick<CardElement, 'x' | 'y' | 'w' | 'h'>): Box => ({
  x: el.x,
  y: el.y,
  w: el.w,
  h: el.h,
});

export function newElementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
}

/** Beri id pada elemen yang belum punya (templat bawaan sistem tidak menyertakan id). */
export function ensureIds(elements: readonly CardElement[]): CardElement[] {
  const seen = new Set<string>();
  return elements.map((el) => {
    let id = el.id;
    if (!id || seen.has(id)) id = newElementId();
    seen.add(id);
    return id === el.id ? el : ({ ...el, id } as CardElement);
  });
}

export const isFlatLine = (el: CardElement) => el.type === 'line' && (el.w === 0 || el.h === 0);

/** Ukuran minimum elemen (mm) saat diubah ukurannya. */
export function minSizeOf(el: CardElement): { w: number; h: number } {
  if (el.type === 'line') return { w: 0, h: 0 };
  return { w: 1, h: 1 };
}

/** Elemen baru di tengah kanvas. `fileId` wajib untuk jenis `image`. */
export function createElement(
  type: ElementType,
  kind: CardKind,
  canvas: { w: number; h: number },
  opts: { fileId?: string } = {},
): CardElement {
  const id = newElementId();
  const place = (w: number, h: number): Box =>
    clampBox({ x: snap((canvas.w - w) / 2, 0.5), y: snap((canvas.h - h) / 2, 0.5), w, h }, canvas);
  switch (type) {
    case 'text':
      return {
        type,
        id,
        ...place(40, 6),
        text: 'Teks',
        fontSize: 10,
        bold: false,
        align: 'left',
        color: '#111111',
      };
    case 'field': {
      const field = cardFieldsFor(kind)[0] ?? 'name';
      return {
        type,
        id,
        ...place(50, 6),
        field,
        fontSize: 9,
        bold: false,
        align: 'left',
        color: '#111111',
      };
    }
    case 'image':
      return { type, id, ...place(20, 20), fileId: opts.fileId ?? '', fit: 'contain' };
    case 'photo':
      return { type, id, ...place(20, 26), shape: 'rect', fit: 'cover' };
    case 'qr':
      return { type, id, ...place(20, 20), field: codeFieldsFor(kind)[0] ?? 'qrCode', color: '#000000' };
    case 'barcode':
      return {
        type,
        id,
        ...place(50, 10),
        field: codeFieldsFor(kind)[0] ?? 'qrCode',
        format: 'code128',
        showText: false,
        color: '#000000',
      };
    case 'rect':
      return {
        type,
        id,
        ...place(30, 15),
        fill: '#e5e7eb',
        borderColor: null,
        borderWidth: 0,
        radius: 0,
      };
    case 'line':
      return { type, id, ...place(40, 0), color: '#111111', thickness: 0.3 };
  }
}

export function updateElement(
  elements: readonly CardElement[],
  id: string,
  patch: Partial<CardElement>,
): CardElement[] {
  return elements.map((el) => (el.id === id ? ({ ...el, ...patch } as CardElement) : el));
}

export const removeElement = (elements: readonly CardElement[], id: string): CardElement[] =>
  elements.filter((el) => el.id !== id);

export type OrderMove = 'front' | 'back' | 'forward' | 'backward';

/** Ubah urutan lapisan: elemen belakang digambar lebih dulu, jadi ujung larik = paling depan. */
export function moveInOrder(elements: readonly CardElement[], id: string, move: OrderMove): CardElement[] {
  const i = elements.findIndex((el) => el.id === id);
  if (i < 0) return [...elements];
  const list = [...elements];
  const [item] = list.splice(i, 1);
  if (!item) return [...elements];
  const target =
    move === 'front'
      ? list.length
      : move === 'back'
        ? 0
        : move === 'forward'
          ? Math.min(list.length, i + 1)
          : Math.max(0, i - 1);
  list.splice(target, 0, item);
  return list;
}

/** Gandakan elemen (digeser 2 mm) tepat di atas aslinya; mengembalikan id salinan atau null bila penuh. */
export function duplicateElement(
  elements: readonly CardElement[],
  id: string,
  canvas: { w: number; h: number },
): { elements: CardElement[]; newId: string } | null {
  const i = elements.findIndex((el) => el.id === id);
  const src = elements[i];
  if (!src || elements.length >= MAX_CARD_ELEMENTS) return null;
  const copyId = newElementId();
  const moved = clampBox({ x: src.x + 2, y: src.y + 2, w: src.w, h: src.h }, canvas);
  const copy = { ...src, ...moved, id: copyId } as CardElement;
  const list = [...elements];
  list.splice(i + 1, 0, copy);
  return { elements: list, newId: copyId };
}

/** Masukkan elemen ke dalam kanvas (digeser, atau diperkecil bila lebih besar). Garis tetap lurus. */
export function clampElement(el: CardElement, canvas: { w: number; h: number }): CardElement {
  const box = clampBox(boxOf(el), canvas);
  return { ...el, ...box } as CardElement;
}

/** Ubah ukuran kanvas (dibatasi 20..300 mm, bilangan bulat) dan masukkan semua elemen ke dalamnya. */
export function resizeCanvas(layout: CardLayout, widthMm: number, heightMm: number): CardLayout {
  const w = Math.min(MAX_CARD_MM, Math.max(MIN_CARD_MM, Math.round(widthMm)));
  const h = Math.min(MAX_CARD_MM, Math.max(MIN_CARD_MM, Math.round(heightMm)));
  return {
    widthMm: w,
    heightMm: h,
    elements: layout.elements.map((el) => clampElement(el, { w, h })),
  };
}

export interface LayoutIssue {
  /** Nomor elemen (mulai 1) atau null untuk masalah pada kartu secara umum. */
  element: number | null;
  /** Nama kolom bermasalah, mis. "x" atau "text". */
  field: string;
  message: string;
}

/** Validasi tata letak dengan skema bersama (sama dengan server); daftar kosong = sah. */
export function validateLayout(layout: unknown): LayoutIssue[] {
  const parsed = cardLayoutSchema.safeParse(layout);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const [head, idx, ...rest] = issue.path;
    const element = head === 'elements' && typeof idx === 'number' ? idx + 1 : null;
    return {
      element,
      field: (element === null ? [head, idx, ...rest] : rest).filter((p) => p !== undefined).join('.'),
      message: issue.message,
    };
  });
}

/** Data contoh yang mengisi pratinjau editor. */
export function sampleCardData(kind: CardKind): CardData {
  const base: CardData = {
    name: 'Muhammad Raihan Pratama',
    nis: '2024001',
    nisn: '0012345678',
    className: 'VII-A',
    academicYear: '2026/2027',
    birthPlaceDate: 'Bandung, 5 Oktober 2010',
    gender: 'L',
    rfidCode: '04A1B2C3',
    qrCode: 'ES1.7K3M9Q2XH4VBN8T5WRDA',
    schoolName: 'SMP Contoh Nusantara',
    address: 'Jl. Merdeka No. 10, Bandung',
  };
  if (kind === 'student') return base;
  return {
    ...base,
    examTitle: 'Asesmen Sumatif Tengah Semester Ganjil 2026/2027',
    typeName: 'Asesmen Sumatif Tengah Semester',
    participantNo: formatParticipantNo('ASTS', '2026', 7),
    room: 'Ruang 3',
    date: '12 Oktober 2026 s.d. 16 Oktober 2026',
    time: '07.30 - 09.00 WIB',
    subjectList: [
      'Matematika: Senin, 12 Oktober 2026, 07.30 - 09.00 WIB',
      'Bahasa Indonesia: Selasa, 13 Oktober 2026, 07.30 - 09.00 WIB',
    ],
  };
}

/** Teks yang tampil untuk elemen teks/kolom (awalan + nilai); string kosong untuk jenis lain. */
export function elementText(el: CardElement, data: CardData): string {
  if (el.type === 'text') return el.text;
  if (el.type === 'field') return `${el.prefix ?? ''}${resolveFieldValue(el.field, data)}`;
  return '';
}

/** Templat lama: QR/kode batang yang terikat kolom tak diizinkan dialihkan ke kolom kode jenis kartunya. */
export function normalizeCodeBindings(elements: readonly CardElement[], kind: CardKind): CardElement[] {
  const allowed = codeFieldsFor(kind);
  const fallback = allowed[0] ?? 'qrCode';
  return elements.map((el) =>
    (el.type === 'qr' || el.type === 'barcode') && !(allowed as readonly string[]).includes(el.field)
      ? ({ ...el, field: fallback } as CardElement)
      : el,
  );
}

/**
 * Isi QR / kode batang untuk elemen; kosong bila kolomnya kosong. NIS dan kode RFID tidak pernah menjadi isi kode
 * (templat lama yang masih mengikatnya tidak mencetak kode yang salah).
 */
export function codeText(el: CardElement, data: CardData): string {
  if (el.type !== 'qr' && el.type !== 'barcode') return '';
  if (el.field === 'nis' || el.field === 'rfidCode') return '';
  return resolveFieldValue(el.field, data);
}
