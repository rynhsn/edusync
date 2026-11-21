import {
  buildScheduleTable,
  type CardData,
  type CardElement,
  type CardKind,
  type CardLayout,
  cardFieldsFor,
  cardLayoutSchema,
  codeFieldsFor,
  DEFAULT_SCHEDULE_COLUMNS,
  fitScheduleFont,
  formatParticipantNo,
  MAX_CARD_ELEMENTS,
  MAX_CARD_MM,
  MIN_CARD_MM,
  resolveFieldValue,
  SCHEDULE_COLUMNS,
  type ScheduleColumn,
  scheduleRowHeightMm,
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
  'schedule',
];

/** Jenis elemen yang ditawarkan di editor: tabel jadwal hanya untuk kartu ujian. */
export const elementTypesFor = (kind: CardKind): readonly ElementType[] =>
  ELEMENT_TYPES.filter((t) => t !== 'schedule' || kind === 'exam');

export type PresetKey = 'cr80' | 'cr80Portrait' | 'exam' | 'a7' | 'a6' | 'a6Portrait' | 'a5' | 'a4';

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
  { key: 'a4', w: 210, h: 297 },
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
    case 'schedule':
      return {
        type,
        id,
        ...place(Math.round(canvas.w * 0.8), Math.round(canvas.h * 0.5)),
        fontSize: 8,
        color: '#111111',
        headerFill: '#f1f5f9',
        borderColor: '#111111',
        borderWidth: 0.2,
        columns: [...DEFAULT_SCHEDULE_COLUMNS],
        mergeDays: true,
        showHeader: true,
      };
  }
}

/* ---------- Tabel jadwal ---------- */

/** Bobot lebar relatif tiap kolom tabel jadwal. */
const SCHEDULE_WEIGHT: Record<ScheduleColumn, number> = {
  no: 0.4,
  dayDate: 1.7,
  day: 0.9,
  date: 1.2,
  time: 1.3,
  subject: 2.4,
};

export interface ScheduleCell {
  /** Posisi dan ukuran (mm) relatif terhadap kotak elemen. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  header: boolean;
  /** Sisi kiri dan atas hanya digambar pada sel di tepi tabel (sisi kanan dan bawah selalu). */
  edgeLeft: boolean;
  edgeTop: boolean;
}

export interface ScheduleGeometry {
  /** Ukuran huruf (pt) hasil penyesuaian. */
  fontSize: number;
  cells: ScheduleCell[];
}

/**
 * Letak tiap sel tabel jadwal (mm) dari data; dipakai bersama pratinjau dan PDF supaya sama. Sel gabungan (hari yang
 * sama) membentang beberapa baris. Tinggi baris tetap, jadi teks panjang dipotong oleh pemakai (overflow hidden).
 */
export function scheduleGeometry(
  el: Extract<CardElement, { type: 'schedule' }>,
  data: CardData,
): ScheduleGeometry {
  const table = buildScheduleTable(data.schedule ?? [], {
    columns: el.columns,
    headers: el.headers,
    mergeDays: el.mergeDays,
  });
  const fontSize = fitScheduleFont(table.rows.length, el.h, el.fontSize);
  const rowH = scheduleRowHeightMm(fontSize);
  const total = table.columns.reduce((s, c) => s + SCHEDULE_WEIGHT[c], 0);
  let acc = 0;
  const cols = table.columns.map((c) => {
    const x = (acc / total) * el.w;
    acc += SCHEDULE_WEIGHT[c];
    return { x, w: (acc / total) * el.w - x };
  });
  const cells: ScheduleCell[] = [];
  const top = el.showHeader ? 1 : 0;
  if (el.showHeader) {
    table.headers.forEach((text, ci) => {
      const col = cols[ci];
      if (col) cells.push({ ...col, y: 0, h: rowH, text, header: true, edgeLeft: ci === 0, edgeTop: true });
    });
  }
  table.rows.forEach((row, ri) => {
    row.cells.forEach((text, ci) => {
      const col = cols[ci];
      if (text === null || !col) return;
      cells.push({
        ...col,
        y: (top + ri) * rowH,
        h: (row.spans[ci] ?? 1) * rowH,
        text,
        header: false,
        edgeLeft: ci === 0,
        edgeTop: !el.showHeader && ri === 0,
      });
    });
  });
  return { fontSize, cells };
}

/* Penyunting kolom tabel jadwal: judul (`headers`) selalu sejajar dengan `columns`. */

type ScheduleCols = { columns: ScheduleColumn[]; headers?: string[] | undefined };

/** Tabel kolom + judul sesudah diubah; `headers` dibuang bila semuanya kosong. */
const scheduleCols = (columns: ScheduleColumn[], headers: string[]): ScheduleCols => ({
  columns,
  headers: headers.some((h) => h.trim()) ? headers : undefined,
});

/** Pasangan kolom-judul menurut urutan sekarang. */
const pairs = (s: ScheduleCols) => s.columns.map((c, i) => ({ c, h: s.headers?.[i] ?? '' }));

/** Kolom yang belum tampil, urut seperti SCHEDULE_COLUMNS. */
export const hiddenScheduleColumns = (columns: readonly ScheduleColumn[]) =>
  SCHEDULE_COLUMNS.filter((c) => !columns.includes(c));

/** Tampilkan (ditaruh di akhir) atau sembunyikan satu kolom; kolom terakhir tidak bisa disembunyikan. */
export function toggleScheduleColumn(s: ScheduleCols, column: ScheduleColumn, on: boolean): ScheduleCols {
  const list = pairs(s);
  const has = list.some((p) => p.c === column);
  if (on && !has) list.push({ c: column, h: '' });
  else if (!on && has && list.length > 1)
    list.splice(
      list.findIndex((p) => p.c === column),
      1,
    );
  return scheduleCols(
    list.map((p) => p.c),
    list.map((p) => p.h),
  );
}

/** Geser satu kolom ke kiri (-1) atau kanan (+1). */
export function moveScheduleColumn(s: ScheduleCols, column: ScheduleColumn, dir: -1 | 1): ScheduleCols {
  const list = pairs(s);
  const i = list.findIndex((p) => p.c === column);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return scheduleCols(s.columns, s.headers ?? []);
  [list[i], list[j]] = [list[j] as (typeof list)[number], list[i] as (typeof list)[number]];
  return scheduleCols(
    list.map((p) => p.c),
    list.map((p) => p.h),
  );
}

/** Ganti judul satu kolom (kosong = judul bawaan). */
export function setScheduleHeader(s: ScheduleCols, column: ScheduleColumn, header: string): ScheduleCols {
  const list = pairs(s).map((p) => (p.c === column ? { ...p, h: header } : p));
  return scheduleCols(
    list.map((p) => p.c),
    list.map((p) => p.h),
  );
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
    room: '02',
    principalName: 'Drs. H. Ahmad Fauzi, M.Pd.',
    cityDate: 'Bandung, 5 Oktober 2026',
    schedule: [
      { subject: 'Matematika', date: '2026-10-12', time: '07.30 - 09.00 WIB' },
      { subject: 'Bahasa Indonesia', date: '2026-10-12', time: '09.30 - 11.00 WIB' },
      { subject: 'Ilmu Pengetahuan Alam', date: '2026-10-13', time: '07.30 - 09.00 WIB' },
      { subject: 'Bahasa Inggris', date: '2026-10-14', time: '07.30 - 09.00 WIB' },
      { subject: 'Pendidikan Agama dan Budi Pekerti', date: '2026-10-15', time: '07.30 - 09.00 WIB' },
    ],
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
