import type { ArrearsRow, DailyReport } from './types';

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

/** Rupiah untuk PDF ("Rp 1.250.000"), pemisah ribuan titik, tanpa Intl. */
export function rupiahText(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

const UNITS = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

function spell(n: number): string {
  if (n < 12) return UNITS[n] as string;
  if (n < 20) return `${spell(n - 10)} belas`;
  if (n < 100) return `${spell(Math.floor(n / 10))} puluh ${spell(n % 10)}`;
  if (n < 200) return `seratus ${spell(n - 100)}`;
  if (n < 1000) return `${spell(Math.floor(n / 100))} ratus ${spell(n % 100)}`;
  if (n < 2000) return `seribu ${spell(n - 1000)}`;
  if (n < 1_000_000) return `${spell(Math.floor(n / 1000))} ribu ${spell(n % 1000)}`;
  if (n < 1_000_000_000) return `${spell(Math.floor(n / 1_000_000))} juta ${spell(n % 1_000_000)}`;
  if (n < 1_000_000_000_000)
    return `${spell(Math.floor(n / 1_000_000_000))} miliar ${spell(n % 1_000_000_000)}`;
  return `${spell(Math.floor(n / 1_000_000_000_000))} triliun ${spell(n % 1_000_000_000_000)}`;
}

/** Terbilang bilangan bulat dalam bahasa Indonesia (tanpa kata "rupiah"); nilai negatif dibaca mutlak. */
export function terbilang(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return 'nol';
  return spell(v).replace(/\s+/g, ' ').trim();
}

/** "Terbilang" untuk kwitansi, huruf awal kapital: "Satu juta dua ratus lima puluh ribu rupiah". */
export function terbilangRupiah(amount: number): string {
  const words = `${terbilang(amount)} rupiah`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', other: 'Lainnya' };

export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method;
}

/** Nama berkas kwitansi: kwitansi-{receiptNo}.pdf; karakter terlarang pada nomor diganti tanda hubung. */
export function receiptFileName(receiptNo: string): string {
  const safe = receiptNo
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `kwitansi-${safe || 'tanpa-nomor'}.pdf`;
}

/** Nama lembar Excel yang aman (maks 31 karakter, tanpa \ / ? * [ ] :). */
export function safeSheetName(name: string, fallback = 'Laporan'): string {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || fallback;
}

/** Jumlah dari baris tunggakan; dipakai untuk ringkasan agar selalu cocok dengan baris yang tampil. */
export function sumArrears(rows: ArrearsRow[]) {
  return rows.reduce(
    (a, r) => ({
      students: a.students + 1,
      openInvoices: a.openInvoices + r.openInvoices,
      outstanding: a.outstanding + r.outstanding,
      overdueOutstanding: a.overdueOutstanding + r.overdueOutstanding,
    }),
    { students: 0, openInvoices: 0, outstanding: 0, overdueOutstanding: 0 },
  );
}

/** Baris Excel tunggakan: No, Nama, NIS, Kelas, tagihan terbuka, tunggakan, lewat jatuh tempo, jatuh tempo tertua + baris total. */
export function buildArrearsRows(rows: ArrearsRow[], totalLabel: string): (string | number | null)[][] {
  const body: (string | number | null)[][] = rows.map((r, i) => [
    i + 1,
    r.name,
    r.nis ?? '',
    r.className,
    r.openInvoices,
    r.outstanding,
    r.overdueOutstanding,
    r.oldestDue ?? '',
  ]);
  const t = sumArrears(rows);
  body.push(['', totalLabel, '', '', t.openInvoices, t.outstanding, t.overdueOutstanding, '']);
  return body;
}

/** Baris Excel kas harian: tiga bagian (metode, jenis biaya, hari) dalam satu lembar tiga kolom. */
export function buildDailyRows(
  report: DailyReport,
  labels: {
    methodTitle: string;
    feeTypeTitle: string;
    dayTitle: string;
    total: string;
    method: (m: string) => string;
  },
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  rows.push([labels.methodTitle, '', '']);
  for (const m of report.byMethod) rows.push([labels.method(m.method), m.receipts, m.amount]);
  rows.push([labels.total, report.totals.receipts, report.totals.amount]);
  rows.push(['', '', '']);
  rows.push([labels.feeTypeTitle, '', '']);
  for (const f of report.byFeeType) rows.push([f.feeTypeName, '', f.amount]);
  rows.push(['', '', '']);
  rows.push([labels.dayTitle, '', '']);
  for (const d of report.byDay) rows.push([d.date, d.receipts, d.amount]);
  return rows;
}
