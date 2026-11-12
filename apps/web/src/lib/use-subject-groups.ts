'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { groupLabelByKey, type SubjectGroupRef } from '@/lib/subject-groups';

/** Kelompok mapel acuan platform (jarang berubah, jadi di-cache lama). */
export function useSubjectGroups() {
  const { school } = useSchool();
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['subject-groups', school.schoolId],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/reference/subject-groups', { params: { header: schoolHeader(school.schoolId) } }),
      ),
  });
  const groups: SubjectGroupRef[] = query.data?.groups ?? [];
  return {
    ...query,
    groups,
    /** Label menurut bahasa aktif; kunci tak dikenal (atau acuan belum dimuat) ditampilkan apa adanya. */
    labelOf: (key: string | null | undefined) => groupLabelByKey(groups, key, locale),
    profileKey: school.educationProfile?.key ?? null,
  };
}
