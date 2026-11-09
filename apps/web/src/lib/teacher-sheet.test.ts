import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTeacherTemplate, parseTeacherSheet, TEACHER_TEXT_COLUMNS } from './teacher-sheet';

async function buffer(build: (s: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Guru'));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('parseTeacherSheet', () => {
  it('memetakan kolom dan melewati baris kosong', async () => {
    const res = await parseTeacherSheet(
      await buffer((s) => {
        s.addRow(['Nama Guru', 'NIP', 'Status']);
        s.addRow(['Pak Dodi', '19800101', 'Aktif']);
        s.addRow([]);
        s.addRow(['Bu Eka', 12345, '']);
      }),
    );
    expect(res.fatal).toBeNull();
    expect(res.rows).toMatchObject([
      {
        row: 2,
        name: 'Pak Dodi',
        nip: '19800101',
        nuptk: '',
        status: 'Aktif',
        nik: '',
        phone: '',
        email: '',
      },
      { row: 4, name: 'Bu Eka', nip: '12345', nuptk: '', status: '', gender: '', education: '' },
    ]);
  });

  it('NUPTK punya kolom sendiri (terpisah dari NIP) dan boleh kosong', async () => {
    const res = await parseTeacherSheet(
      await buffer((s) => {
        s.addRow(['Nama', 'NIP', 'NUPTK']);
        s.addRow(['Pak Gani', '1980', '7777123412341234']);
        s.addRow(['Bu Honorer', '', '']);
      }),
    );
    expect(res.fatal).toBeNull();
    expect(res.rows).toMatchObject([
      { name: 'Pak Gani', nip: '1980', nuptk: '7777123412341234' },
      { name: 'Bu Honorer', nip: '', nuptk: '' },
    ]);
  });

  it('mengenali kolom data diri dan kontak lewat alias judul', async () => {
    const res = await parseTeacherSheet(
      await buffer((s) => {
        s.addRow([
          'Nama',
          'NIK',
          'JK',
          'Tmp Lahir',
          'Tgl Lahir',
          'Agama',
          'Pendidikan Terakhir',
          'WhatsApp',
          'E-mail',
          'Alamat',
        ]);
        s.addRow([
          'Bu Fitri',
          '3201234567890001',
          'P',
          'Bogor',
          new Date(Date.UTC(1985, 4, 4)),
          'Islam',
          'S1 Pendidikan',
          '081234567890',
          'fitri@contoh.sch.id',
          'Jl. Mawar 2',
        ]);
      }),
    );
    expect(res.fatal).toBeNull();
    expect(res.rows[0]).toMatchObject({
      name: 'Bu Fitri',
      nik: '3201234567890001',
      gender: 'P',
      birthPlace: 'Bogor',
      birthDate: '1985-05-04',
      religion: 'Islam',
      education: 'S1 Pendidikan',
      phone: '081234567890',
      email: 'fitri@contoh.sch.id',
      address: 'Jl. Mawar 2',
    });
  });

  it('kolom nama wajib', async () => {
    const res = await parseTeacherSheet(
      await buffer((s) => {
        s.addRow(['NIP']);
        s.addRow(['1']);
      }),
    );
    expect(res).toMatchObject({ fatal: 'missing_columns', missing: ['nama'] });
  });

  it('templat menjaga NIP/NIK/telepon sebagai teks dan memuat kolom baru', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTeacherTemplate().then((b) => b.arrayBuffer())) as ArrayBuffer);
    const sheet = wb.worksheets[0] as ExcelJS.Worksheet;
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['NUPTK', 'NIK', 'Jenis Kelamin', 'Telepon/WA', 'Email', 'Pendidikan']),
    );
    for (const col of TEACHER_TEXT_COLUMNS) expect(sheet.getColumn(col).numFmt).toBe('@');
  });
});
