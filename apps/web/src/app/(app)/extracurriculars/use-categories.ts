'use client';

import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';

/** Kategori ekstrakurikuler sekolah aktif (dimuat sekali dan dipakai bersama daftar, rinci, dan pengelola). */
export function useExtracurricularCategories() {
  const { school, can } = useSchool();
  return useQuery({
    queryKey: ['extracurricular-categories', school.schoolId],
    enabled: can('extracurricular:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/extracurricular-categories', {
          params: { header: schoolHeader(school.schoolId) },
        }),
      ),
  });
}
