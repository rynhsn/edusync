import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { ReportDisplayOptions } from '@/lib/report-v2';
import type { ReportCardDoc } from './pdf/types';

/** Rapor sehari-hari satu siswa; dipakai pratinjau, dialog catatan, dan penentuan mode kelas. */
export function useReportCard(semesterId: string, studentId: string | null) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['report-card', school.schoolId, semesterId, studentId],
    enabled: !!studentId && !!semesterId,
    queryFn: async (): Promise<ReportCardDoc> =>
      unwrap(
        await api.GET('/v1/report-cards/{studentId}', {
          params: {
            header: schoolHeader(school.schoolId),
            path: { studentId: studentId ?? '' },
            query: { semesterId },
          },
        }),
      ),
  });
}

/** Kunci pengaturan rapor; layar pengaturan memakai kunci yang sama supaya perubahan langsung terbaca. */
export const reportSettingsKey = (schoolId: string) => ['report-card-settings', schoolId] as const;

/**
 * Bendera tampilan PDF dari pengaturan rapor (kokurikuler dan kotak tanggapan). Selama belum termuat, bendera tidak
 * diketahui (undefined) dan PDF mengikuti isi dokumen saja.
 */
export function useReportDisplay(): ReportDisplayOptions {
  const { school } = useSchool();
  const settings = useQuery({
    queryKey: reportSettingsKey(school.schoolId),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/report-cards/settings', { params: { header: schoolHeader(school.schoolId) } }),
      ),
  });
  const d = settings.data;
  return d ? { showCocurricular: d.showCocurricular, showGuardianResponse: d.showGuardianResponse } : {};
}
