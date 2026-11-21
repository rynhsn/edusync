import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';

/** Sakelar fitur perencanaan, jurnal, dan penilaian proses sekolah (semua mati bila belum diatur). */
export function usePlanSettings() {
  const { school, can } = useSchool();
  return useQuery({
    queryKey: ['learning-plan-settings', school.schoolId],
    enabled: can('subject:read'),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/learning-plan/settings', { params: { header: schoolHeader(school.schoolId) } }),
      ),
  });
}
