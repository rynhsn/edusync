'use client';

import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { PORTAL_PATHS, type PortalMe, type PortalOverview, portalRequest } from '@/lib/portal-api';

/** Identitas portal: jenis akun, bagian yang aktif, dan daftar anak yang boleh dilihat. */
export function usePortalMe() {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['portal', school.schoolId, 'me'],
    queryFn: () => portalRequest<PortalMe>('GET', PORTAL_PATHS.me, { schoolId: school.schoolId }),
  });
}

export function useOverview(studentId: string | undefined) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['portal', school.schoolId, 'overview', studentId],
    enabled: !!studentId,
    queryFn: () =>
      portalRequest<PortalOverview>('GET', PORTAL_PATHS.overview(studentId as string), {
        schoolId: school.schoolId,
      }),
  });
}

/** Ambil data rincian anak; kunci mengikuti sekolah dan anak. */
export function usePortalDetail<T>(
  studentId: string,
  name: string,
  path: string,
  extraKey: readonly unknown[] = [],
) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['portal', school.schoolId, name, studentId, ...extraKey],
    queryFn: () => portalRequest<T>('GET', path, { schoolId: school.schoolId }),
  });
}
