import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile from 'write-excel-file/universal';
import { parseDocx } from './docx';
import { parseText } from './text';
import { buildTemplate, parseXlsx } from './xlsx';

// Aplikasi memakai build peramban mammoth (menerima `arrayBuffer`); tes berjalan di Node, jadi arahkan ke build itu.
vi.mock('mammoth', async () => ({
  // @ts-expect-error build peramban tidak punya deklarasi tipe
  default: (await import('mammoth/mammoth.browser.js')).default,
}));

describe('parseText', () => {
  const sample = `
Soal Ujian Matematika

1. Hasil dari $2 + 3 \\times 4$ adalah ...
A. 20
B. 14
C. 24
Kunci: B
Poin: 2
Pembahasan: Perkalian lebih dulu.
Lanjutan pembahasan.

2) Ibu kota Jawa Barat adalah
   Bandung atau kota lain?
a) Jakarta
*b) Bandung
c) Bogor dengan nama
   yang sangat panjang

3. Jelaskan perbedaan IP publik dan IP privat.
Pedoman: IP publik unik global.
IP privat untuk jaringan lokal.

4. Soal tanpa kunci
A. satu
B. dua
`;

  it('membaca pilihan ganda, kunci, poin, pembahasan, dan rumus apa adanya', () => {
    const { rows, lines } = parseText(sample);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      type: 'mcq',
      body: 'Hasil dari $2 + 3 \\times 4$ adalah ...',
      options: [
        { key: 'A', text: '20' },
        { key: 'B', text: '14' },
        { key: 'C', text: '24' },
      ],
      answer: 'B',
      points: 2,
      explanation: 'Perkalian lebih dulu.\nLanjutan pembahasan.',
    });
    expect(lines).toEqual([4, 13, 20, 24]);
  });

  it('soal bertanda * sebagai kunci, baris lanjutan menempel, huruf kecil dan kurung diterima', () => {
    const r = parseText(sample).rows[1]!;
    expect(r.body).toBe('Ibu kota Jawa Barat adalah\nBandung atau kota lain?');
    expect(r.answer).toBe('B');
    expect(r.options[2]).toEqual({ key: 'C', text: 'Bogor dengan nama yang sangat panjang' });
  });

  it('tanpa pilihan = esai dengan pedoman beberapa baris', () => {
    const r = parseText(sample).rows[2]!;
    expect(r).toMatchObject({
      type: 'essay',
      options: [],
      answer: 'IP publik unik global.\nIP privat untuk jaringan lokal.',
    });
  });

  it('memberi peringatan: teks sebelum soal, kunci hilang, kunci bukan huruf', () => {
    const { warnings, rows } = parseText(sample);
    expect(warnings).toContainEqual({ line: 2, message: 'Teks sebelum soal pertama diabaikan.' });
    expect(warnings).toContainEqual({ line: 24, message: 'Kunci jawaban tidak ditemukan.' });
    expect(rows[3]!.answer).toBeNull();
    const bad = parseText('1. S\nA. a\nB. b\nKunci: 7');
    expect(bad.warnings.some((w) => w.message.includes('bukan huruf'))).toBe(true);
  });

  it('teks kosong menghasilkan nol soal; CRLF dan alias kunci didukung', () => {
    expect(parseText('').rows).toEqual([]);
    expect(parseText('1. S\r\nA. a\r\nB. b\r\nKunci Jawaban: a\r\n').rows[0]!.answer).toBe('A');
    expect(parseText('1. S\nA. a\nB. b\nAnswer: B').rows[0]!.answer).toBe('B');
  });
});

describe('Excel', () => {
  const toBuffer = async (rows: unknown[][]) => (await writeXlsxFile(rows as never).toBlob()).arrayBuffer();

  it('templat bisa dibaca kembali: dua contoh soal', async () => {
    const parsed = await parseXlsx(await (await buildTemplate()).arrayBuffer());
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ type: 'mcq', answer: 'B', points: 1 });
    expect(parsed.rows[0]!.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(parsed.rows[1]).toMatchObject({ type: 'essay', options: [], points: 5 });
    expect(parsed.lines).toEqual([2, 3]);
  });

  it('toleran: urutan kolom bebas, nama kolom longgar, kolom lain diabaikan, baris kosong dilewati', async () => {
    const buf = await toBuffer([
      ['Catatan', 'Poin', 'Pertanyaan', 'jenis soal', 'b', 'a', 'Kunci Jawaban'],
      ['abaikan', 3, 'Satu?', 'pilihan ganda', 'dua', 'satu', 'a.'],
      [null, null, null, null, null, null, null],
      ['x', '2,5', 'Dua?', 'xyz', 'p', 'q', 'B'],
      ['x', 4, 'Esai?', 'Uraian', null, null, 'Pedoman esai'],
    ]);
    const { rows, warnings } = await parseXlsx(buf);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ type: 'mcq', answer: 'A', points: 3 });
    expect(rows[0]!.options).toEqual([
      { key: 'A', text: 'satu' },
      { key: 'B', text: 'dua' },
    ]);
    // Tipe tak dikenal ditebak dari ada-tidaknya pilihan; poin "2,5" tidak valid -> 1.
    expect(rows[1]).toMatchObject({ type: 'mcq', points: 1 });
    expect(warnings.map((w) => w.message).join('|')).toMatch(/Tipe "xyz"/);
    expect(warnings.map((w) => w.message).join('|')).toMatch(/Poin "2,5"/);
    expect(rows[2]).toMatchObject({ type: 'essay', answer: 'Pedoman esai', points: 4 });
  });

  it('judul tidak ditemukan: nol soal dengan peringatan umum', async () => {
    const { rows, warnings } = await parseXlsx(
      await toBuffer([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    );
    expect(rows).toEqual([]);
    expect(warnings[0]).toMatchObject({ line: 0 });
  });
});

/** docx minimal dengan entri zip tanpa kompresi (cukup untuk mammoth) agar tes tidak butuh Word. */
function makeZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const common = [
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
    ];
    chunks.push(new Uint8Array([0x50, 0x4b, 3, 4, ...common]), nameBytes, data);
    central.push(
      new Uint8Array([
        0x50,
        0x4b,
        1,
        2,
        ...u16(20),
        ...common,
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]),
      nameBytes,
    );
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([
    0x50,
    0x4b,
    5,
    6,
    ...u16(0),
    ...u16(0),
    ...u16(Object.keys(files).length),
    ...u16(Object.keys(files).length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out.buffer;
}

const docxFiles = (paragraphs: string[], extra: Record<string, string> = {}) => ({
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('')}</w:body></w:document>`,
  ...extra,
});

describe('Word (.docx)', () => {
  const paragraphs = [
    '1. Ibu kota Indonesia?',
    'A. Bandung',
    'B. Jakarta',
    'Kunci: B',
    '2. Jelaskan Pancasila.',
    'Pedoman: Lima sila.',
  ];

  it('membaca soal dari paragraf dokumen', async () => {
    const { rows, warnings } = await parseDocx(makeZip(docxFiles(paragraphs)));
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'mcq', answer: 'B', body: 'Ibu kota Indonesia?' });
    expect(rows[1]).toMatchObject({ type: 'essay', answer: 'Lima sila.' });
  });

  it('memperingatkan bila berkas memuat gambar tertanam', async () => {
    const { rows, warnings } = await parseDocx(
      makeZip(docxFiles(paragraphs, { 'word/media/image1.png': 'x' })),
    );
    expect(rows).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ line: 0 });
    expect(warnings[0]!.message).toMatch(/Gambar/);
  });
});
