import { describe, expect, it } from 'vitest';
import {
  cellOf,
  cellText,
  escapeHtml,
  hasRanks,
  type Ledger,
  type LedgerLabels,
  ledgerFileName,
  ledgerHeaders,
  ledgerPrintHtml,
  ledgerRows,
  ledgerSummary,
  ledgerWidths,
  NOT_TAKEN_MARK,
  rankText,
  safeSheetName,
} from './ledger';

const labels: LedgerLabels = {
  no: 'No',
  student: 'Siswa',
  nis: 'NIS',
  average: 'Rata-rata',
  rank: 'Peringkat',
  sick: 'Sakit',
  excused: 'Izin',
  absent: 'Alpa',
  late: 'Terlambat',
  status: 'Status',
  statusDraft: 'Draf',
  statusFinal: 'Final',
  notTaken: 'Tidak mengambil',
  title: 'Legger',
  legend: 'legenda',
  draftNote: 'catatan draf',
  descriptiveNote: 'catatan deskriptif',
  printedOn: 'Dicetak',
};

const att = { sick: 1, excused: 0, absent: 2, late: 3 };
const data: Ledger = {
  semester: { id: 's', name: 'Ganjil', academicYear: '2026/2027' },
  class: { id: 'c', name: 'XI A', level: 'XI' },
  showRank: false,
  subjects: [
    { id: 'mat', name: 'Matematika', kkm: 75 },
    { id: 'fis', name: 'Fisika', kkm: 75 },
  ],
  students: [
    {
      studentId: 'a',
      name: 'Ani <b>',
      nis: '007',
      status: 'final',
      source: 'snapshot',
      cells: [
        { subjectId: 'mat', final: 90, predicate: 'A' },
        { subjectId: 'fis', final: 60, predicate: 'D', belowKkm: true },
      ],
      average: 75,
      subjectsGraded: 2,
      subjectsTotal: 2,
      rank: null,
      attendance: att,
    },
    {
      studentId: 'b',
      name: 'Budi',
      nis: null,
      status: 'draft',
      source: 'live',
      cells: [
        { subjectId: 'mat', final: 80, predicate: 'B' },
        { subjectId: 'fis', final: null, predicate: null, notTaken: true },
      ],
      average: 80,
      subjectsGraded: 1,
      subjectsTotal: 1,
      rank: null,
      attendance: { sick: 0, excused: 0, absent: 0, late: 0 },
    },
  ],
} as unknown as Ledger;

describe('sel legger', () => {
  it('angka apa adanya, "—" untuk tidak diambil, "-" untuk belum ada nilai', () => {
    expect(cellText(cellOf(data.students[0]!, 'mat'))).toBe('90');
    expect(cellText(cellOf(data.students[1]!, 'fis'))).toBe(NOT_TAKEN_MARK);
    expect(cellText({ subjectId: 'x', final: null, predicate: null })).toBe('-');
    expect(cellText(undefined)).toBe('-');
    // Nilai 0 adalah nilai, bukan kosong.
    expect(cellText({ subjectId: 'x', final: 0, predicate: 'D' })).toBe('0');
  });

  it('ringkasan menghitung final, draf, dan sel tidak diambil', () => {
    expect(ledgerSummary(data)).toEqual({
      total: 2,
      final: 1,
      draft: 1,
      allFinal: false,
      hasDraft: true,
      notTakenCells: 1,
    });
    expect(ledgerSummary({ students: [] })).toMatchObject({ total: 0, allFinal: false, hasDraft: false });
  });

  it('peringkat hanya bila ada', () => {
    expect(hasRanks(data)).toBe(false);
    expect(rankText(null)).toBe('-');
    const ranked = {
      ...data,
      students: data.students.map((s) => ({ ...s, rank: { position: 2, of: 30 } })),
    };
    expect(hasRanks(ranked)).toBe(true);
    expect(rankText({ position: 2, of: 30 })).toBe('2/30');
    expect(ledgerHeaders(ranked, labels)).toContain('Peringkat');
    expect(ledgerHeaders(data, labels)).not.toContain('Peringkat');
  });
});

describe('berkas Excel', () => {
  it('judul dan baris sejajar; angka tetap angka; tidak diambil "—"', () => {
    const headers = ledgerHeaders(data, labels);
    expect(headers).toEqual([
      'No',
      'Siswa',
      'NIS',
      'Matematika',
      'Fisika',
      'Rata-rata',
      'Sakit',
      'Izin',
      'Alpa',
      'Terlambat',
      'Status',
    ]);
    const rows = ledgerRows(data, labels);
    expect(rows).toEqual([
      [1, 'Ani <b>', '007', 90, 60, 75, 1, 0, 2, 3, 'Final'],
      [2, 'Budi', null, 80, NOT_TAKEN_MARK, 80, 0, 0, 0, 0, 'Draf'],
    ]);
    for (const r of rows) expect(r).toHaveLength(headers.length);
    expect(ledgerWidths(data)).toHaveLength(headers.length);
  });

  it('nama lembar dan berkas aman', () => {
    expect(safeSheetName('Legger XI A/B: [1]')).not.toMatch(/[\\/?*[\]:]/);
    expect(safeSheetName('x'.repeat(50))).toHaveLength(31);
    expect(safeSheetName('///')).toBe('Legger');
    expect(ledgerFileName('xlsx', 'XI RPL 1', 'Genap 2025/26')).toBe('legger-xi-rpl-1-genap-2025-26.xlsx');
    expect(ledgerFileName('xlsx', '', '')).toBe('legger-kelas-semester.xlsx');
  });
});

describe('cetak', () => {
  const meta = {
    schoolName: 'SMK <Demo>',
    className: 'XI A',
    semesterName: 'Ganjil',
    printedOn: '1 Januari 2027',
  };

  it('meng-escape semua teks dari data', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    const html = ledgerPrintHtml(data, labels, meta);
    expect(html).not.toContain('<b>');
    expect(html).toContain('Ani &lt;b&gt;');
    expect(html).toContain('SMK &lt;Demo&gt;');
  });

  it('memuat semua murid, mapel, tanda tidak diambil, dan catatan draf; deskriptif hanya bila berlaku', () => {
    const html = ledgerPrintHtml(data, labels, meta);
    expect(html).toContain('<th>Matematika</th>');
    expect(html).toContain(`<td class="num na">${NOT_TAKEN_MARK}</td>`);
    expect(html).toContain('<td class="num low">60</td>');
    expect(html).toContain('catatan draf');
    expect(html).not.toContain('catatan deskriptif');
    expect(html.match(/<tr>/g)).toHaveLength(3);
    const descriptive = ledgerPrintHtml({ ...data, reportMode: 'descriptive' }, labels, meta);
    expect(descriptive).toContain('catatan deskriptif');
    const allFinal = ledgerPrintHtml({ ...data, students: [data.students[0]!] }, labels, meta);
    expect(allFinal).not.toContain('catatan draf');
  });
});
