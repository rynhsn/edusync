import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildExport, saveBlob } from '@/lib/sheet';
import { STUDENT_COLUMN_WIDTHS, STUDENT_HEADERS, STUDENT_TEXT_COLUMNS } from '@/lib/student-sheet';

const RELIGION_LABEL: Record<string, string> = {
  islam: 'Islam',
  christian: 'Kristen',
  catholic: 'Katolik',
  hindu: 'Hindu',
  buddhist: 'Buddha',
  confucian: 'Konghucu',
  other: 'Lainnya',
};
const RELATION_LABEL: Record<string, string> = {
  father: 'Ayah',
  mother: 'Ibu',
  guardian: 'Wali',
  other: 'Lainnya',
};

/**
 * Ekspor siswa (sesuai saringan) beserta dua wali pertama ke Excel. Judul kolom sama dengan templat impor,
 * jadi berkasnya bisa diimpor ulang. Mengembalikan 'empty' bila tidak ada siswa.
 */
export async function exportStudentsExcel(opts: {
  schoolId: string;
  schoolSlug: string;
  query: { q?: string; classId?: string; status?: 'active' | 'graduated' | 'transferred' | 'dropped' };
}): Promise<'empty' | 'ok'> {
  const { items } = unwrap(
    await api.GET('/v1/students/export', {
      params: { header: schoolHeader(opts.schoolId), query: opts.query },
    }),
  );
  if (items.length === 0) return 'empty';

  const rows = items.map((s) => {
    const [g1, g2] = s.guardians;
    const guardianCells = (g: typeof g1) => [
      g?.name ?? '',
      g ? (RELATION_LABEL[g.relation] ?? '') : '',
      g?.phone ?? '',
      g?.email ?? '',
      g?.nik ?? '',
      g?.address ?? '',
      g?.occupation ?? '',
    ];
    return [
      s.name,
      s.nis ?? '',
      s.nisn ?? '',
      s.nik ?? '',
      s.gender,
      s.birthPlace ?? '',
      s.birthDate ?? '',
      s.religion ? (RELIGION_LABEL[s.religion] ?? '') : '',
      s.address ?? '',
      s.phone ?? '',
      s.email ?? '',
      s.className ?? '',
      ...guardianCells(g1),
      ...guardianCells(g2),
    ];
  });
  const blob = await buildExport('Siswa', STUDENT_HEADERS, rows, {
    textColumns: STUDENT_TEXT_COLUMNS,
    widths: STUDENT_COLUMN_WIDTHS,
  });
  saveBlob(blob, `siswa-${opts.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return 'ok';
}
