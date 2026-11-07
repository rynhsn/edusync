// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultExamCardLayout, defaultStudentCardLayout } from '@edusync/contracts';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ensureIds, sampleCardData } from '../../../../lib/cards/elements';
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
