import { describe, expect, it } from 'vitest';
import {
  buildArrearsRows,
  buildDailyRows,
  formatIdDate,
  methodLabel,
  receiptFileName,
  rupiahText,
  safeSheetName,
  sumArrears,
  terbilang,
  terbilangRupiah,
} from './format';
import type { ArrearsRow } from './types';

describe('terbilang', () => {
  it.each([
    [0, 'nol'],
    [1, 'satu'],
    [10, 'sepuluh'],
    [11, 'sebelas'],
    [12, 'dua belas'],
    [19, 'sembilan belas'],
    [20, 'dua puluh'],
    [21, 'dua puluh satu'],
    [100, 'seratus'],
    [111, 'seratus sebelas'],
    [200, 'dua ratus'],
    [1000, 'seribu'],
    [1500, 'seribu lima ratus'],
    [2000, 'dua ribu'],
    [11_000, 'sebelas ribu'],
    [150_000, 'seratus lima puluh ribu'],
    [1_000_000, 'satu juta'],
    [1_250_000, 'satu juta dua ratus lima puluh ribu'],
    [2_000_500, 'dua juta lima ratus'],
    [100_000_000, 'seratus juta'],
    [
      345_678_912,
      'tiga ratus empat puluh lima juta enam ratus tujuh puluh delapan ribu sembilan ratus dua belas',
    ],
    [1_000_000_000, 'satu miliar'],
  ])('%i', (n, words) => {
    expect(terbilang(n)).toBe(words);
  });

  it('kalimat kwitansi berhuruf kapital dan berakhiran rupiah', () => {
    expect(terbilangRupiah(1_250_000)).toBe('Satu juta dua ratus lima puluh ribu rupiah');
    expect(terbilangRupiah(0)).toBe('Nol rupiah');
  });
});

describe('format keuangan', () => {
  it('rupiah dengan titik ribuan', () => {
    expect(rupiahText(1_250_000)).toBe('Rp 1.250.000');
    expect(rupiahText(0)).toBe('Rp 0');
    expect(rupiahText(999)).toBe('Rp 999');
  });

  it('tanggal Indonesia', () => {
    expect(formatIdDate('2026-10-30T08:00:00.000Z')).toBe('30 Oktober 2026');
    expect(formatIdDate('x')).toBe('x');
  });

  it('metode bayar', () => {
    expect(methodLabel('cash')).toBe('Tunai');
    expect(methodLabel('lain')).toBe('lain');
  });

  it('nama berkas kwitansi aman', () => {
    expect(receiptFileName('KW/2026/00012')).toBe('kwitansi-KW-2026-00012.pdf');
    expect(receiptFileName('  ')).toBe('kwitansi-tanpa-nomor.pdf');
  });

  it('nama lembar aman', () => {
    expect(safeSheetName('Tunggakan 7/A: [x]').length).toBeLessThanOrEqual(31);
    expect(safeSheetName('A/B')).not.toContain('/');
    expect(safeSheetName('  ')).toBe('Laporan');
  });
});

const rows: ArrearsRow[] = [
  {
    studentId: 'a',
    name: 'Ani',
    nis: '0012',
    className: '7A',
    openInvoices: 2,
    outstanding: 300_000,
    overdueOutstanding: 100_000,
    oldestDue: '2026-09-10',
  },
  {
    studentId: 'b',
    name: 'Budi',
    nis: null,
    className: '7B',
    openInvoices: 1,
    outstanding: 50_000,
    overdueOutstanding: 0,
    oldestDue: null,
  },
];

describe('baris Excel', () => {
  it('jumlah tunggakan', () => {
    expect(sumArrears(rows)).toEqual({
      students: 2,
      openInvoices: 3,
      outstanding: 350_000,
      overdueOutstanding: 100_000,
    });
  });

  it('baris tunggakan diakhiri baris total', () => {
    const out = buildArrearsRows(rows, 'Total');
    expect(out[0]).toEqual([1, 'Ani', '0012', '7A', 2, 300_000, 100_000, '2026-09-10']);
    expect(out[1]).toEqual([2, 'Budi', '', '7B', 1, 50_000, 0, '']);
    expect(out[2]).toEqual(['', 'Total', '', '', 3, 350_000, 100_000, '']);
  });

  it('baris kas harian tiga bagian', () => {
    const out = buildDailyRows(
      {
        totals: { receipts: 3, amount: 600_000 },
        byMethod: [
          { method: 'cash', receipts: 2, amount: 400_000 },
          { method: 'transfer', receipts: 1, amount: 200_000 },
        ],
        byFeeType: [{ feeTypeName: 'SPP', amount: 600_000 }],
        byDay: [{ date: '2026-10-01', receipts: 3, amount: 600_000 }],
      },
      {
        methodTitle: 'Metode',
        feeTypeTitle: 'Jenis biaya',
        dayTitle: 'Harian',
        total: 'Total',
        method: methodLabel,
      },
    );
    expect(out).toEqual([
      ['Metode', '', ''],
      ['Tunai', 2, 400_000],
      ['Transfer', 1, 200_000],
      ['Total', 3, 600_000],
      ['', '', ''],
      ['Jenis biaya', '', ''],
      ['SPP', '', 600_000],
      ['', '', ''],
      ['Harian', '', ''],
      ['2026-10-01', 3, 600_000],
    ]);
  });
});
