import type { Predicate } from '@edusync/contracts';
import { formatGrade, formatIdDate, slugify } from '../../report-cards/pdf/format';

export { formatGrade, formatIdDate, slugify };

/** Kata predikat pada sertifikat (selalu bahasa Indonesia). */
export const PREDICATE_WORD: Record<Predicate, string> = {
  A: 'Sangat baik',
  B: 'Baik',
  C: 'Cukup',
  D: 'Kurang',
};

/** Nama berkas sertifikat: sertifikat-pkl-{siswa}-{periode}.pdf */
export function certificateFileName(studentName: string, periodName: string): string {
  const parts = ['sertifikat-pkl', slugify(studentName), slugify(periodName)].filter(Boolean);
  return `${parts.join('-')}.pdf`;
}

/** Rentang periode: "1 Oktober 2026 s.d. 30 November 2026". */
export function periodRangeText(startsOn: string, endsOn: string): string {
  return `${formatIdDate(startsOn)} s.d. ${formatIdDate(endsOn)}`;
}

/** Tempat dan tanggal tanda tangan: "Bandung, 30 Oktober 2026" (tanpa kota bila kosong). */
export function placeAndDate(place: string, dateIso: string): string {
  const city = place.trim();
  return city ? `${city}, ${formatIdDate(dateIso)}` : formatIdDate(dateIso);
}
