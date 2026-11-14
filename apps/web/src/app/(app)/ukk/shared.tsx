'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { type UkkEventRow, ukkKey } from './lib';

type Status = UkkEventRow['status'];
type Pattern = UkkEventRow['pattern'];

const STATUS_TONE = { draft: 'slate', active: 'teal', closed: 'amber' } as const;

/** Lencana status kegiatan. */
export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations('ukk');
  return <ToneBadge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</ToneBadge>;
}

/** Lencana pola UKK. */
export function PatternBadge({ pattern }: { pattern: Pattern }) {
  const t = useTranslations('ukk');
  return (
    <ToneBadge tone="violet" dot={false}>
      {t(`patterns.${pattern}`)}
    </ToneBadge>
  );
}

/** Tahun ajaran sekolah (dipakai pemilih tahun di daftar dan formulir). */
export function useUkkYears() {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });
}

/** Semester pada satu tahun ajaran. */
export function useUkkSemesters(yearId: string) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['semesters', school.schoolId, yearId],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', {
          params: { header: schoolHeader(school.schoolId), query: { academicYearId: yearId } },
        }),
      ),
  });
}

/** Konsentrasi keahlian sekolah. */
export function useUkkConcentrations() {
  const { school } = useSchool();
  return useQuery({
    queryKey: ukkKey(school.schoolId, 'concentrations'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/vocational/concentrations', { params: { header: schoolHeader(school.schoolId) } }),
      ),
  });
}

/** Tanggal (zona Jakarta) dari penanda waktu ISO, ditulis menurut bahasa pengguna. */
export function markerDate(locale: Locale, iso: string): string {
  const day = new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  return formatCalendarDate(locale, day);
}
