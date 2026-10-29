/**
 * Perhitungan kalender akademik yang murni (tanpa database), supaya mudah diuji dan dipakai API maupun web.
 * Semua tanggal berupa teks TTTT-BB-HH dan dihitung di UTC agar tidak bergeser karena zona waktu.
 */

export const EVENT_TYPES = ['holiday', 'break', 'exam', 'activity'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface DayRange {
  startsOn: string;
  endsOn: string;
}

const DAY = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface EffectiveDays {
  /** Jumlah hari dalam rentang (inklusif). */
  total: number;
  /** Hari kerja sekolah (Senin–Jumat atau Senin–Sabtu) dalam rentang. */
  workdays: number;
  /** Hari kerja yang jatuh pada libur atau jeda cakupan sekolah. */
  nonEffective: number;
  /** Hari efektif belajar = hari kerja dikurangi libur/jeda. */
  effective: number;
}

/**
 * Hari efektif dalam rentang tahun ajaran. `closures` adalah libur dan jeda cakupan sekolah; yang tumpang tindih
 * tidak dihitung ganda. Ujian dan kegiatan tidak mengurangi hari efektif.
 */
export function effectiveDays(range: DayRange, closures: DayRange[], daysPerWeek: 5 | 6 = 5): EffectiveDays {
  const from = parse(range.startsOn);
  const to = parse(range.endsOn);
  const closed = new Set<number>();
  for (const c of closures) {
    for (let d = Math.max(parse(c.startsOn), from); d <= Math.min(parse(c.endsOn), to); d += DAY)
      closed.add(d);
  }
  let total = 0;
  let workdays = 0;
  let nonEffective = 0;
  for (let d = from; d <= to; d += DAY) {
    total++;
    const weekday = new Date(d).getUTCDay(); // 0 = Minggu
    const isWork = weekday >= 1 && weekday <= daysPerWeek;
    if (!isWork) continue;
    workdays++;
    if (closed.has(d)) nonEffective++;
  }
  return { total, workdays, nonEffective, effective: workdays - nonEffective };
}

export interface PlannerEvent extends DayRange {
  type: EventType;
}

export type CellKind = EventType | 'weekend';

export interface PlannerCell {
  /** Tanggal TTTT-BB-HH. */
  date: string;
  day: number;
  /** Kosong bila sel hanya pengisi di awal/akhir minggu (bulan lain). */
  inMonth: boolean;
  /** Penanda terkuat pada hari itu; libur mengalahkan jeda, ujian, lalu kegiatan. */
  kind: CellKind | null;
}

export interface PlannerMonth {
  /** Bulan 0–11 dan tahunnya. */
  month: number;
  year: number;
  /** Minggu demi minggu (Senin–Minggu), tiap minggu 7 sel. */
  weeks: PlannerCell[][];
}

const PRIORITY: EventType[] = ['holiday', 'break', 'exam', 'activity'];

/**
 * Kalender tahunan: satu grid per bulan dari bulan mulai sampai bulan akhir tahun ajaran. Hari di luar rentang
 * tahun ajaran tetap tampil tetapi tanpa penanda. Minggu dimulai hari Senin.
 */
export function buildYearPlanner(range: DayRange, events: PlannerEvent[]): PlannerMonth[] {
  const from = parse(range.startsOn);
  const to = parse(range.endsOn);
  const start = new Date(from);
  const end = new Date(to);
  const months: PlannerMonth[] = [];

  const kindOf = (ms: number): CellKind | null => {
    if (ms < from || ms > to) return null;
    const hit = events.filter((e) => ms >= parse(e.startsOn) && ms <= parse(e.endsOn)).map((e) => e.type);
    for (const t of PRIORITY) if (hit.includes(t)) return t;
    const wd = new Date(ms).getUTCDay();
    return wd === 0 || wd === 6 ? 'weekend' : null;
  };

  const firstIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const lastIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
  for (let index = firstIndex; index <= lastIndex; index++) {
    const y = Math.floor(index / 12);
    const m = index % 12;
    const first = Date.UTC(y, m, 1);
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (new Date(first).getUTCDay() + 6) % 7; // Senin = 0
    const cells: PlannerCell[] = [];
    for (let i = -lead; i < Math.ceil((lead + daysInMonth) / 7) * 7 - lead; i++) {
      const ms = first + i * DAY;
      const inMonth = i >= 0 && i < daysInMonth;
      cells.push({
        date: format(ms),
        day: new Date(ms).getUTCDate(),
        inMonth,
        kind: inMonth ? kindOf(ms) : null,
      });
    }
    const weeks: PlannerCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ month: m, year: y, weeks });
  }
  return months;
}
