import type { Locale } from '@/i18n/config';

/**
 * Browser dan Node umumnya tidak punya data Sundanese di Intl (hasilnya jatuh ke bahasa Inggris),
 * jadi bulan Sunda ditulis sendiri. Bahasa lain memakai Intl.
 */
const SUNDANESE_MONTHS = [
  'Januari',
  'Pébruari',
  'Maret',
  'April',
  'Méi',
  'Juni',
  'Juli',
  'Agustus',
  'Séptémber',
  'Oktober',
  'Nopémber',
  'Désémber',
];

/** Format tanggal kalender (YYYY-MM-DD) tanpa pergeseran zona waktu. */
export function formatCalendarDate(locale: Locale, isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  if (locale === 'su') return `${day} ${SUNDANESE_MONTHS[month - 1]} ${year}`;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
