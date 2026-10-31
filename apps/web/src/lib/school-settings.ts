'use client';

import { SCHOOL_SETTING_DEFAULTS } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';

/** Pengaturan sekolah (hari efektif, jam pelajaran bawaan, nama semester). Selama memuat, nilai bawaan dipakai. */
export function useSchoolSettings() {
  const { school } = useSchool();
  const query = useQuery({
    queryKey: ['school-settings', school.schoolId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/school/settings', { params: { header: schoolHeader(school.schoolId) } })),
    staleTime: 60_000,
  });
  return {
    ...query,
    settings: query.data ?? {
      timezone: school.timezone ?? 'Asia/Jakarta',
      ...SCHOOL_SETTING_DEFAULTS,
    },
  };
}

/** Tingkat kelas sekolah (kode dan label). Daftar kosong berarti sekolah belum mengaturnya (teks bebas). */
export function useSchoolLevels() {
  const { school, can } = useSchool();
  return useQuery({
    queryKey: ['school-levels', school.schoolId],
    enabled: can('class:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/school/levels', { params: { header: schoolHeader(school.schoolId) } })),
    staleTime: 60_000,
  });
}
