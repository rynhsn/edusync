import type { paths } from './api-types';

/**
 * Logika murni legger kelas (tahap 3C.2, tanpa React): ringkasan, baris Excel, dan HTML cetak dari respons
 * `GET /v1/report-cards/ledger`. Angka tidak dihitung ulang di sini; semuanya dari server.
 */

export type Ledger = paths['/v1/report-cards/ledger']['get']['responses'][200]['content']['application/json'];
export type LedgerStudent = Ledger['students'][number];
export type LedgerCell = LedgerStudent['cells'][number];

/** Tanda sel mapel yang tidak diambil murid (selalu diberi label yang dapat dibaca di layar dan pembaca layar). */
export const NOT_TAKEN_MARK = '—';
const EMPTY_MARK = '-';

export interface LedgerLabels {
  no: string;
  student: string;
  nis: string;
  average: string;
  rank: string;
  sick: string;
  excused: string;
  absent: string;
  late: string;
  status: string;
  statusDraft: string;
  statusFinal: string;
  notTaken: string;
  title: string;
  legend: string;
  draftNote: string;
  descriptiveNote: string;
  printedOn: string;
}

/** Nilai sel apa adanya: angka, "—" (tidak diambil), atau "-" (belum ada nilai). */
export function cellText(cell: LedgerCell | undefined): string {
  if (!cell) return EMPTY_MARK;
  if (cell.notTaken) return NOT_TAKEN_MARK;
  return cell.final === null ? EMPTY_MARK : String(cell.final);
}

/** Sel di kolom mapel tertentu milik murid itu. */
export const cellOf = (student: LedgerStudent, subjectId: string) =>
  student.cells.find((c) => c.subjectId === subjectId);

/** Ada murid yang punya peringkat (peringkat hanya tampil bila ada, mengikuti pengaturan rapor). */
export const hasRanks = (data: Pick<Ledger, 'students'>) => data.students.some((s) => s.rank !== null);

export function ledgerSummary(data: Pick<Ledger, 'students'>) {
  const total = data.students.length;
  const final = data.students.filter((s) => s.status === 'final').length;
  return {
    total,
    final,
    draft: total - final,
    allFinal: total > 0 && final === total,
    hasDraft: total > final,
    notTakenCells: data.students.reduce((n, s) => n + s.cells.filter((c) => c.notTaken).length, 0),
  };
}

export const rankText = (rank: LedgerStudent['rank']) => (rank ? `${rank.position}/${rank.of}` : EMPTY_MARK);

/** Rata-rata ditampilkan apa adanya dari server; kosong bila belum ada nilai. */
export const averageText = (n: number | null) => (n === null ? EMPTY_MARK : String(n));

/** Judul kolom Excel dan cetak: No, Nama, NIS, mapel, rata-rata, [peringkat], sakit, izin, alpa, terlambat, status. */
export function ledgerHeaders(data: Ledger, l: LedgerLabels): string[] {
  return [
    l.no,
    l.student,
    l.nis,
    ...data.subjects.map((s) => s.name),
    l.average,
    ...(hasRanks(data) ? [l.rank] : []),
    l.sick,
    l.excused,
    l.absent,
    l.late,
    l.status,
  ];
}

/** Baris Excel: nilai berupa angka (agar dapat dihitung), "—" untuk tidak diambil, kosong untuk belum ada nilai. */
export function ledgerRows(data: Ledger, l: LedgerLabels): (string | number | null)[][] {
  const ranks = hasRanks(data);
  return data.students.map((s, i) => [
    i + 1,
    s.name,
    s.nis,
    ...data.subjects.map((sub) => {
      const c = cellOf(s, sub.id);
      if (c?.notTaken) return NOT_TAKEN_MARK;
      return c?.final ?? null;
    }),
    s.average,
    ...(ranks ? [rankText(s.rank)] : []),
    s.attendance.sick,
    s.attendance.excused,
    s.attendance.absent,
    s.attendance.late,
    s.status === 'final' ? l.statusFinal : l.statusDraft,
  ]);
}

/** Lebar kolom Excel: No, Nama, NIS, mapel, lalu kolom ringkas. */
export function ledgerWidths(data: Ledger): number[] {
  return [
    5,
    30,
    16,
    ...data.subjects.map((s) => Math.min(Math.max(s.name.length + 2, 10), 24)),
    11,
    ...(hasRanks(data) ? [10] : []),
    8,
    8,
    8,
    10,
    10,
  ];
}

/** Indeks kolom NIS (mulai 1) yang disimpan sebagai teks supaya awalan nol tidak hilang. */
export const LEDGER_TEXT_COLUMNS = [3];

export function safeSheetName(name: string): string {
  // Excel: maksimal 31 karakter dan tanpa \ / ? * [ ] :
  return (
    name
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Legger'
  );
}

export function ledgerFileName(kind: 'xlsx', className: string, semesterName: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `legger-${slug(className) || 'kelas'}-${slug(semesterName) || 'semester'}.${kind}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dokumen HTML mandiri untuk dicetak (atau disimpan sebagai PDF lewat dialog cetak peramban), lanskap. Semua teks di-escape.
 * Murid tanpa nilai ditulis "-", mapel yang tidak diambil "—" dengan keterangan di bawah tabel.
 */
export function ledgerPrintHtml(
  data: Ledger,
  l: LedgerLabels,
  meta: { schoolName: string; className: string; semesterName: string; printedOn: string },
): string {
  const e = escapeHtml;
  const ranks = hasRanks(data);
  const head = ledgerHeaders(data, l)
    .map((h, i) => `<th${i === 1 ? ' class="name"' : ''}>${e(h)}</th>`)
    .join('');
  const body = data.students
    .map((s, i) => {
      const cells = data.subjects
        .map((sub) => {
          const c = cellOf(s, sub.id);
          const cls = c?.notTaken ? 'na' : c?.belowKkm ? 'low' : '';
          return `<td class="num ${cls}">${e(cellText(c))}</td>`;
        })
        .join('');
      return (
        `<tr><td class="num">${i + 1}</td><td class="name">${e(s.name)}</td><td>${e(s.nis ?? '')}</td>` +
        cells +
        `<td class="num">${e(averageText(s.average))}</td>` +
        (ranks ? `<td class="num">${e(rankText(s.rank))}</td>` : '') +
        `<td class="num">${s.attendance.sick}</td><td class="num">${s.attendance.excused}</td>` +
        `<td class="num">${s.attendance.absent}</td><td class="num">${s.attendance.late}</td>` +
        `<td>${e(s.status === 'final' ? l.statusFinal : l.statusDraft)}</td></tr>`
      );
    })
    .join('');
  const notes = [l.legend, ...(data.students.some((s) => s.status === 'draft') ? [l.draftNote] : [])];
  if (data.reportMode === 'descriptive') notes.push(l.descriptiveNote);
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${e(`${l.title} ${meta.className} - ${meta.semesterName}`)}</title>` +
    '<style>@page{size:A4 landscape;margin:12mm}' +
    'body{font:11px/1.35 system-ui,sans-serif;color:#111;margin:0}' +
    'h1{font-size:15px;margin:0 0 2px}p{margin:0 0 6px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:3px 5px;text-align:left}' +
    'th{background:#eee}td.num{text-align:right}td.na{text-align:center}td.low{color:#b00020;font-weight:600}' +
    'tr{break-inside:avoid}thead{display:table-header-group}.notes{margin-top:8px;font-size:10px}</style></head><body>' +
    `<h1>${e(l.title)} - ${e(meta.className)}</h1>` +
    `<p>${e(meta.schoolName)} | ${e(data.semester.academicYear)} | ${e(meta.semesterName)}</p>` +
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `<div class="notes">${notes.map((n) => `<p>${e(n)}</p>`).join('')}<p>${e(l.printedOn)} ${e(meta.printedOn)}</p></div>` +
    '</body></html>'
  );
}
