import type { AttendanceStatus } from '@/lib/portal-api';
import { nowHm, todayIso } from '../../../lib/school-time';

/** Tanggal hari ini menurut zona waktu sekolah (TTTT-BB-HH). */
export const todayJakarta = (now = new Date()) => todayIso(now);

export const currentMonth = (now = new Date()) => todayJakarta(now).slice(0, 7);

/** Geser bulan (TTTT-BB) sebanyak `delta` bulan. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export interface CalendarCell {
  date: string;
  day: number;
  status: AttendanceStatus | null;
  weekend: boolean;
}

/**
 * Kisi bulan untuk kalender kehadiran: pekan dimulai Senin, sel kosong (null) mengisi hari di luar bulan.
 * Hari tanpa catatan berstatus null (libur atau belum tercatat).
 */
export function buildMonthGrid(
  month: string,
  days: readonly { date: string; status: AttendanceStatus }[],
): (CalendarCell | null)[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const byDate = new Map(days.map((d) => [d.date, d.status]));
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay: 0 = Minggu; geser agar Senin = 0.
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    cells.push({ date, day, status: byDate.get(date) ?? null, weekend: dow === 0 || dow === 6 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Panjang busur cincin: `offset` adalah bagian lingkaran yang belum terisi. */
export function ringDash(percentage: number | null, radius: number) {
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, percentage ?? 0));
  return { circumference, offset: circumference * (1 - pct / 100) };
}

export type Tone = 'good' | 'warn' | 'low' | 'none';

/** Warna kehadiran: >= 90 baik, >= 75 perlu perhatian, selebihnya rendah. */
export function attendanceTone(percentage: number | null): Tone {
  if (percentage === null) return 'none';
  if (percentage >= 90) return 'good';
  if (percentage >= 75) return 'warn';
  return 'low';
}

/** Warna nilai terhadap KKM; tanpa KKM, 75 dipakai sebagai patokan. */
export function gradeTone(score: number | null, kkm: number | null): Tone {
  if (score === null) return 'none';
  const pass = kkm ?? 75;
  if (score >= pass + 10) return 'good';
  if (score >= pass) return 'warn';
  return 'low';
}

/** Inisial dua huruf dari nama. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] as string;
  const last = parts.length > 1 ? (parts[parts.length - 1] as string) : '';
  return (first.charAt(0) + (last ? last.charAt(0) : (first.charAt(1) ?? ''))).toUpperCase();
}

/** Rona avatar yang stabil per nama (0..359), agar tiap anak punya warna sendiri. */
export function avatarHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Sapaan menurut jam sekolah: pagi, siang, sore, malam. */
export function dayPart(now = new Date()): 'morning' | 'noon' | 'afternoon' | 'evening' {
  const hour = Number(nowHm(now).slice(0, 2));
  if (hour < 11) return 'morning';
  if (hour < 15) return 'noon';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Rentang tanggal penuh sebuah bulan (TTTT-BB) untuk permintaan absensi. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
