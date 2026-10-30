import type { RecapClass } from './types';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** Tanggal Indonesia ("30 Oktober 2026") dari ISO tanggal atau waktu. Tanpa Intl agar hasil sama di semua lingkungan. */
export function formatIdDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** Nilai dengan koma desimal, 0-2 desimal ("85", "85,5", "85,33"); "" bila kosong. */
export function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** Potongan nama berkas: huruf kecil, tanpa diakritik, selain huruf/angka jadi tanda hubung. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Nama berkas rapor satu siswa: rapor-{nama}-{semester}.pdf. */
export function reportCardFileName(studentName: string, semesterName: string): string {
  const parts = ['rapor', slugify(studentName), slugify(semesterName)].filter(Boolean);
  return `${parts.join('-')}.pdf`;
}

/** Rata-rata nilai akhir yang terisi (2 desimal); null bila tidak ada satu pun. */
export function averageGrade(values: (number | null)[]): number | null {
  const filled = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (filled.length === 0) return null;
  const sum = filled.reduce((a, b) => a + b, 0);
  return Math.round((sum / filled.length) * 100) / 100;
}

export const LEDGER_FIXED_HEADERS = ['No', 'Nama', 'NIS'] as const;

/** Judul dan baris leger: No, Nama, NIS, tiap mapel, Rata-rata. Nilai kosong menjadi sel kosong (null). */
export function buildLedgerRows(recap: RecapClass): {
  headers: string[];
  rows: (string | number | null)[][];
} {
  const headers = [...LEDGER_FIXED_HEADERS, ...recap.subjects.map((s) => s.name), 'Rata-rata'];
  const rows = recap.students.map((st, i) => {
    const byId = new Map(st.grades.map((g) => [g.subjectId, g.final]));
    const finals = recap.subjects.map((s) => {
      const v = byId.get(s.id);
      return v === undefined || v === null ? null : Math.round(v * 100) / 100;
    });
    return [i + 1, st.name, st.nis ?? '', ...finals, averageGrade(finals)];
  });
  return { headers, rows };
}

/** Lebar kolom leger: No sempit, Nama lebar, NIS sedang, mapel menyesuaikan panjang nama (8-16). */
export function ledgerWidths(recap: RecapClass): number[] {
  const subject = recap.subjects.map((s) => Math.min(16, Math.max(8, s.name.length + 2)));
  return [5, 32, 14, ...subject, 11];
}

/** Nama lembar Excel: maksimal 31 karakter dan tanpa karakter terlarang. */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[/?*[\]:]/g, ' ').trim();
  return (cleaned || 'Leger').slice(0, 31);
}
