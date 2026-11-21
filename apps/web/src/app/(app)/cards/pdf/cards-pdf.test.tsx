// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CardLayout, defaultExamCardLayout, defaultStudentCardLayout } from '@edusync/contracts';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ensureIds, sampleCardData, scheduleGeometry } from '../../../../lib/cards/elements';
import { DEFAULT_SHEET } from '../../../../lib/cards/sheet-layout';
import { CardsDocument, type CardsPdfInput } from './cards-pdf';

vi.setConfig({ testTimeout: 60_000 });

/** Isi PDF_OUT dengan folder untuk menyimpan hasil render (pratinjau visual). */
const OUT = process.env.PDF_OUT;

const pageCount = (buf: Buffer) => (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

async function render(name: string, input: CardsPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer((<CardsDocument input={input} />) as never);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.pdf`), buf);
  }
  return buf;
}

const a7Layout = (): CardLayout => ({
  widthMm: 74,
  heightMm: 105,
  elements: [
    {
      type: 'field',
      field: 'room',
      prefix: 'Ruang: ',
      x: 4,
      y: 4,
      w: 66,
      h: 6,
      fontSize: 9,
      bold: true,
      align: 'left',
      color: '#111111',
    },
    {
      type: 'schedule',
      x: 4,
      y: 14,
      w: 66,
      h: 80,
      fontSize: 8,
      color: '#111111',
      headerFill: '#f1f5f9',
      borderColor: '#111111',
      borderWidth: 0.2,
      columns: ['dayDate', 'time', 'subject'],
      mergeDays: true,
      showHeader: true,
    },
  ],
});

const cards = (kind: 'student' | 'exam', n: number) =>
  Array.from({ length: n }, (_, i) => ({
    data: { ...sampleCardData(kind), name: `Siswa ${i + 1}`, nis: String(2024000 + i) },
    photo: null,
  }));

describe('PDF kartu', () => {
  it('satu kartu per halaman seukuran kartu', async () => {
    const layout = defaultStudentCardLayout();
    const buf = await render('kartu-siswa-satuan', {
      title: 'Kartu',
      layout: { ...layout, elements: ensureIds(layout.elements) },
      assets: { background: null, images: {} },
      cards: cards('student', 3),
      mode: 'single',
      sheet: DEFAULT_SHEET,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(buf)).toBe(3);
    // Ukuran halaman 86 x 54 mm = 243.78 x 153.07 pt
    expect(buf.toString('latin1')).toMatch(/\/MediaBox \[\s*0 0 243\.7\d* 153\.0\d*\s*\]/);
  });

  it('lembar A4 mendatar: 9 kartu CR80 per lembar, 10 kartu = 2 halaman, dengan tanda potong', async () => {
    const layout = defaultStudentCardLayout();
    const buf = await render('kartu-siswa-lembar', {
      title: 'Kartu',
      layout,
      assets: { background: null, images: {} },
      cards: cards('student', 10),
      mode: 'sheet',
      sheet: { paper: 'A4', margin: 10, gap: 5, cropMarks: true },
    });
    expect(pageCount(buf)).toBe(2);
  });

  it('kartu ujian dengan QR, foto kosong, dan jadwal panjang', async () => {
    const layout = defaultExamCardLayout();
    const buf = await render('kartu-ujian', {
      title: 'Kartu ujian',
      layout,
      assets: { background: null, images: {} },
      cards: cards('exam', 4),
      mode: 'sheet',
      sheet: DEFAULT_SHEET,
    });
    expect(pageCount(buf)).toBe(1);
  });

  it('kartu A7 tegak dengan ruang dan tabel jadwal: satu halaman seukuran kartu per kartu', async () => {
    const layout = a7Layout();
    const buf = await render('kartu-a7-tegak', {
      title: 'Kartu peserta',
      layout: { ...layout, elements: ensureIds(layout.elements) },
      assets: { background: null, images: {} },
      cards: cards('exam', 2),
      mode: 'single',
      sheet: DEFAULT_SHEET,
    });
    expect(pageCount(buf)).toBe(2);
    // 74 x 105 mm = 209.76 x 297.64 pt
    expect(buf.toString('latin1')).toMatch(/\/MediaBox \[\s*0 0 209\.7\d* 297\.6\d*\s*\]/);
  });

  it('tabel jadwal dengan kolom dan judul kustom, tanpa jadwal, dan jadwal sangat panjang tidak melempar', async () => {
    const schedule = Array.from({ length: 40 }, (_, i) => ({
      subject: `Mata pelajaran dengan nama yang sangat panjang sekali nomor ${i + 1} supaya terpotong`,
      date: `2026-10-${String(12 + (i % 5)).padStart(2, '0')}`,
      time: '07.30 - 09.00 WIB',
    }));
    const base = { widthMm: 210, heightMm: 297 };
    const table = {
      type: 'schedule' as const,
      x: 10,
      y: 90,
      w: 190,
      h: 140,
      fontSize: 9,
      color: '#111111',
      headerFill: '#ffeeaa',
      borderColor: '#333333',
      borderWidth: 0.3,
      columns: ['no', 'date', 'subject'] as ('no' | 'date' | 'subject')[],
      headers: ['Nomor', 'Tgl', ''],
      mergeDays: false,
      showHeader: true,
    };
    const layout = { ...base, elements: [{ ...table, id: 's1' }] };
    for (const [name, sched] of [
      ['panjang', schedule],
      ['kosong', []],
    ] as const) {
      const buf = await render(`jadwal-${name}`, {
        title: 'Jadwal',
        layout,
        assets: { background: null, images: {} },
        cards: [{ data: { ...sampleCardData('exam'), schedule: sched }, photo: null }],
        mode: 'single',
        sheet: DEFAULT_SHEET,
      });
      expect(pageCount(buf)).toBe(1);
    }
    // judul dan isi yang dicetak sama dengan yang dipakai PDF (geometri bersama)
    const g = scheduleGeometry(table, { schedule });
    expect(g.cells.filter((c) => c.header).map((c) => c.text)).toEqual(['Nomor', 'Tgl', 'Mata Pelajaran']);
    expect(g.cells.some((c) => c.text.includes('nomor 40'))).toBe(true);
    expect(g.fontSize).toBeLessThan(9);
  });

  it('tanpa kartu menghasilkan dokumen tanpa halaman', async () => {
    const buf = await render('kosong', {
      title: 'Kosong',
      layout: defaultStudentCardLayout(),
      assets: { background: null, images: {} },
      cards: [],
      mode: 'single',
      sheet: DEFAULT_SHEET,
    });
    expect(pageCount(buf)).toBe(0);
  });
});
