'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';

export interface Scope {
  semesterId: string;
  classId: string;
  subjectId: string;
}

export function useCandidates(s: Scope) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['remedial-candidates', school.schoolId, s.semesterId, s.classId, s.subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/grading/remedial-candidates', {
          params: { header: schoolHeader(school.schoolId), query: s },
        }),
      ),
  });
}

export function useSupports(s: Scope) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['learning-supports', school.schoolId, s.semesterId, s.classId, s.subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/learning-supports', {
          params: { header: schoolHeader(school.schoolId), query: s },
        }),
      ),
  });
}

/** Rekap kelas (kunci sama dengan tab Rekap, jadi dipakai bersama): daftar murid dan nilai akhir untuk usulan peserta. */
export function useRoster(s: Scope) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['grading-recap', school.schoolId, s.semesterId, s.classId, s.subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/grading/recap', {
          params: { header: schoolHeader(school.schoolId), query: s },
        }),
      ),
  });
}

export function useAttemptSheet(assessmentId: string) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['remedial-attempts', school.schoolId, assessmentId],
    enabled: assessmentId !== '',
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/assessments/{id}/remedial-attempts', {
          params: { header: schoolHeader(school.schoolId), path: { id: assessmentId } },
        }),
      ),
  });
}

/** Setelah remedial berubah: daftar murid, riwayat, rekap, dan ketercapaian TP ikut dimuat ulang. */
export function invalidateRemedial(queryClient: QueryClient, schoolId: string) {
  for (const key of ['remedial-candidates', 'remedial-attempts', 'grading-recap', 'objective-achievement']) {
    queryClient.invalidateQueries({ queryKey: [key, schoolId] });
  }
}

export const isReportFinal = (e: unknown): boolean => e instanceof ApiError && e.code === 'report_final';
