import type { CellKind, EventType } from '@edusync/contracts';

/** Warna penanda kalender, dipakai tampilan layar dan PDF supaya keduanya sama. */
export const KIND_COLORS: Record<CellKind, { bg: string; fg: string; border: string }> = {
  holiday: { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' },
  break: { bg: '#FFEDD5', fg: '#C2410C', border: '#FDBA74' },
  exam: { bg: '#CCFBF1', fg: '#0F766E', border: '#5EEAD4' },
  activity: { bg: '#FEF3C7', fg: '#A16207', border: '#FCD34D' },
  weekend: { bg: '#F3F4F6', fg: '#9CA3AF', border: '#E5E7EB' },
};

export const LEGEND: EventType[] = ['holiday', 'break', 'exam', 'activity'];

export function monthName(locale: string, year: number, month: number) {
  return new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

/** Singkatan hari Senin–Minggu menurut bahasa. */
export function weekdayNames(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
}
