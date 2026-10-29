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

export interface IcsEvent {
  id: string;
  title: string;
  type: EventType;
  startsOn: string;
  endsOn: string;
}

function byteLength(s: string) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lipat baris iCal yang lebih dari 75 oktet (RFC 5545), dengan spasi di awal baris lanjutan. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (byteLength(rest) > 75) {
    let cut = 75;
    while (byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const compact = (iso: string) => iso.replaceAll('-', '');

/** Kalender iCal (acara sehari penuh) untuk diimpor ke Google Calendar, Outlook, atau Apple Calendar. */
export function toIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Edusync//Kalender Akademik//ID',
    'CALSCALE:GREGORIAN',
  ];
  lines.push(`X-WR-CALNAME:${escapeText(name)}`);
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@edusync`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.startsOn)}`,
      // Akhir acara sehari penuh bersifat eksklusif.
      `DTEND;VALUE=DATE:${compact(format(parse(e.endsOn) + DAY))}`,
      `SUMMARY:${escapeText(e.title)}`,
      `CATEGORIES:${e.type.toUpperCase()}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
