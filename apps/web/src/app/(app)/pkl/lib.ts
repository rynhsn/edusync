/** Fungsi murni modul PKL (tanpa React): inisial avatar, kalender jurnal, kemajuan periode, total bobot. */

/** Inisial dua kata pertama nama ("Budi Santoso" -> "BS"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** Kelas warna avatar (lembut, terbaca di mode gelap); dipilih stabil dari nama. */
export const AVATAR_TONES = [
  'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
  'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
] as const;

export function avatarTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal lokal perangkat sebagai TTTT-BB-HH. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Bulan "TTTT-BB" digeser `delta` bulan. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/**
 * Kisi kalender satu bulan, pekan dimulai Senin. Sel di luar bulan bernilai null; sel lain berisi TTTT-BB-HH.
 */
export function monthGrid(key: string): (string | null)[][] {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay: 0 = Minggu; geser agar Senin = 0.
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export interface PeriodProgress {
  state: 'upcoming' | 'running' | 'done';
  /** 0..100 */
  pct: number;
  /** Hari terlewati dan total hari periode (inklusif). */
  elapsed: number;
  total: number;
}

/** Kemajuan waktu sebuah periode terhadap `today`. */
export function periodProgress(startsOn: string, endsOn: string, today: string): PeriodProgress {
  const total = Math.max(1, dayNumber(endsOn) - dayNumber(startsOn) + 1);
  if (today < startsOn) return { state: 'upcoming', pct: 0, elapsed: 0, total };
  if (today > endsOn) return { state: 'done', pct: 100, elapsed: total, total };
  const elapsed = dayNumber(today) - dayNumber(startsOn) + 1;
  return { state: 'running', pct: Math.round((elapsed / total) * 100), elapsed, total };
}

/** Jumlah bobot aspek. */
export function weightTotal(items: readonly { weight: number }[]): number {
  return items.reduce((sum, a) => sum + a.weight, 0);
}

/** Ubah isian nilai teks menjadi bilangan bulat 0..100, atau null bila kosong/tidak valid. */
export function parseScore(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}
