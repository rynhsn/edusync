import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildStudentTemplate,
  cellToString,
  normalizeHeader,
  parseStudentSheet,
  STUDENT_TEXT_COLUMNS,
  toIsoDate,
} from './student-sheet';

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
    expect(res.rows).toMatchObject([
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

  it('berkas lama hanya berkolom lama: kolom baru kosong', async () => {
    const buf = await workbookBuffer((s) => {
      s.addRow(['Nama', 'Jenis Kelamin']);
      s.addRow(['Ani', 'P']);
    });
    const res = await parseStudentSheet(buf);
    expect(res.rows[0]).toMatchObject({ name: 'Ani', nik: '', phone: '', g1Name: '', g2Email: '' });
  });

  it('templat menjaga NIS/NIK/telepon sebagai teks dan bisa dibaca ulang dengan wali', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildStudentTemplate().then((b) => b.arrayBuffer())) as ArrayBuffer);
    const sheet = wb.worksheets[0] as ExcelJS.Worksheet;
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['NIK', 'Wali 1 Nama', 'Wali 2 Telepon/WA']),
    );
    for (const col of STUDENT_TEXT_COLUMNS) expect(sheet.getColumn(col).numFmt).toBe('@');

    sheet.addRow(['Ani', '007', '', '3201010101010001', 'P', 'Bandung', '2013-05-04', 'Islam', 'Jl. A']);
    sheet.getRow(2).getCell(10).value = '0812345';
    sheet.getRow(2).getCell(13).value = 'Pak Budi';
    sheet.getRow(2).getCell(15).value = '081211112222';
    const res = await parseStudentSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(res.rows[0]).toMatchObject({
      nis: '007',
      nik: '3201010101010001',
      religion: 'Islam',
      phone: '0812345',
      g1Name: 'Pak Budi',
      g1Phone: '081211112222',
      g2Name: '',
    });
  });

  it('mengenali kolom NIK, alamat, dan pekerjaan wali, serta alias WhatsApp', async () => {
    const buf = await workbookBuffer((s) => {
      s.addRow([
        'Nama',
        'JK',
        'WhatsApp',
        'Wali 1 Nama',
        'Wali 1 NIK',
        'Wali 1 Alamat',
        'Wali 1 Pekerjaan',
        'Nama Wali 2',
        'NIK Wali 2',
        'Pekerjaan Wali 2',
      ]);
      s.addRow([
        'Ani',
        'P',
        '0812',
        'Pak Budi',
        '3201234567890002',
        'Jl. Melati 3',
        'Petani',
        'Bu Sari',
        '3201234567890003',
        'Guru',
      ]);
    });
    const res = await parseStudentSheet(buf);
    expect(res.fatal).toBeNull();
    expect(res.rows[0]).toMatchObject({
      phone: '0812',
      g1Nik: '3201234567890002',
      g1Address: 'Jl. Melati 3',
      g1Occupation: 'Petani',
      g2Name: 'Bu Sari',
      g2Nik: '3201234567890003',
      g2Address: '',
      g2Occupation: 'Guru',
    });
  });

  it('templat memuat kolom wali baru dan menjaga NIK wali sebagai teks', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildStudentTemplate().then((b) => b.arrayBuffer())) as ArrayBuffer);
    const sheet = wb.worksheets[0] as ExcelJS.Worksheet;
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['Wali 1 NIK', 'Wali 1 Alamat', 'Wali 2 Pekerjaan']),
    );
    expect(sheet.getRow(1).getCell(17).value).toBe('Wali 1 NIK');
    expect(sheet.getRow(1).getCell(24).value).toBe('Wali 2 NIK');
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
