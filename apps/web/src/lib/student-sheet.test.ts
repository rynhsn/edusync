import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { cellToString, normalizeHeader, parseStudentSheet, toIsoDate } from './student-sheet';

async function workbookBuffer(build: (sheet: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Siswa'));
  const out = await wb.xlsx.writeBuffer();
  return out as ArrayBuffer;
}

describe('cellToString', () => {
  it('menangani teks, angka, tanggal, rumus, dan teks kaya', () => {
    expect(cellToString('  Ani  ')).toBe('Ani');
    expect(cellToString(1001)).toBe('1001');
    expect(cellToString(null)).toBe('');
    expect(cellToString(new Date(Date.UTC(2013, 4, 4)))).toBe('2013-05-04');
    expect(cellToString({ formula: 'A1', result: 'L' })).toBe('L');
    expect(cellToString({ richText: [{ text: 'Budi ' }, { text: 'Santoso' }] })).toBe('Budi Santoso');
  });
  it('tanggal tidak bergeser karena zona waktu', () => {
    expect(toIsoDate(new Date('2013-01-01T00:00:00Z'))).toBe('2013-01-01');
    expect(toIsoDate(new Date('2013-12-31T23:59:59Z'))).toBe('2013-12-31');
  });
  it('judul kolom dinormalkan', () => {
    expect(normalizeHeader('  Jenis   Kelamin ')).toBe('jenis kelamin');
  });
});

describe('parseStudentSheet', () => {
  it('memetakan kolom menurut judul (urutan bebas, alias dikenali) dan melewati baris kosong', async () => {
    const buf = await workbookBuffer((s) => {
      s.addRow(['JK', 'Nama Lengkap', 'Kelas', 'NIS', 'Tgl Lahir']);
      s.addRow(['L', 'Ani Lestari', '7A', 1001, new Date(Date.UTC(2013, 4, 4))]);
      s.addRow([]);
      s.addRow(['P', 'Budi', '', '0042', '']);
    });
    const res = await parseStudentSheet(buf);
    expect(res.fatal).toBeNull();
    expect(res.rows).toEqual([
      {
        row: 2,
        name: 'Ani Lestari',
        nis: '1001',
        nisn: '',
        gender: 'L',
        birthDate: '2013-05-04',
        className: '7A',
      },
      { row: 4, name: 'Budi', nis: '0042', nisn: '', gender: 'P', birthDate: '', className: '' },
    ]);
  });

  it('kolom wajib hilang dilaporkan, berkas tanpa data dilaporkan', async () => {
    const noGender = await workbookBuffer((s) => {
      s.addRow(['Nama', 'NIS']);
      s.addRow(['Ani', '1']);
    });
    expect(await parseStudentSheet(noGender)).toMatchObject({
      fatal: 'missing_columns',
      missing: ['jenis kelamin'],
    });

    const empty = await workbookBuffer((s) => {
      s.addRow(['Nama', 'Jenis Kelamin']);
    });
    expect((await parseStudentSheet(empty)).fatal).toBe('no_rows');
  });

  it('menolak lebih dari 1000 baris', async () => {
    const big = await workbookBuffer((s) => {
      s.addRow(['Nama', 'Jenis Kelamin']);
      for (let i = 0; i < 1001; i++) s.addRow([`Siswa ${i}`, 'L']);
    });
    expect((await parseStudentSheet(big)).fatal).toBe('too_many_rows');
  });
});
