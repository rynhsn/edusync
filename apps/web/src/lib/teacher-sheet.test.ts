import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseTeacherSheet } from './teacher-sheet';

async function buffer(build: (s: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Guru'));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('parseTeacherSheet', () => {
  it('memetakan kolom, mengenali alias NUPTK, dan melewati baris kosong', async () => {
    const res = await parseTeacherSheet(
      await buffer((s) => {
        s.addRow(['Nama Guru', 'NUPTK', 'Status']);
        s.addRow(['Pak Dodi', '19800101', 'Aktif']);
        s.addRow([]);
        s.addRow(['Bu Eka', 12345, '']);
      }),
    );
    expect(res.fatal).toBeNull();
    expect(res.rows).toEqual([
      { row: 2, name: 'Pak Dodi', nip: '19800101', status: 'Aktif' },
      { row: 4, name: 'Bu Eka', nip: '12345', status: '' },
    ]);
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
});
