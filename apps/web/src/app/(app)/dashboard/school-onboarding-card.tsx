'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { OnboardingCard, type OnboardingStep } from '@/components/onboarding-card';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildSchoolSteps, hasIdentity } from '@/lib/school-onboarding';

/**
 * Panduan awal untuk pengelola sekolah. Setiap langkah dihitung dari data nyata (bukan dari klik), jadi
 * kartu ikut maju saat data dibuat dan hilang sendiri ketika semuanya lengkap.
 */
export function SchoolOnboardingCard() {
  const { school, userId, can, hasModule } = useSchool();
  const manage = can('school:manage');
  if (!manage) return null;
  return (
    <Inner
      key={school.schoolId}
      userId={userId}
      schoolId={school.schoolId}
      examsEnabled={hasModule('exams')}
    />
  );
}

function Inner({
  userId,
  schoolId,
  examsEnabled,
}: {
  userId: string;
  schoolId: string;
  examsEnabled: boolean;
}) {
  const t = useTranslations('schoolOnboarding');
  const { can } = useSchool();
  const header = { header: schoolHeader(schoolId) };

  const identity = useQuery({
    queryKey: ['school-identity', schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/identity', { params: header })),
  });
  const levels = useQuery({
    queryKey: ['school-levels', schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/levels', { params: header })),
  });
  const years = useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const semesters = useQuery({
    queryKey: ['semesters', schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const subjects = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: can('subject:read'),
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const classes = useQuery({
    queryKey: ['classes', schoolId, 'all'],
    enabled: can('class:read'),
    queryFn: async () => unwrap(await api.GET('/v1/classes', { params: { ...header, query: {} } })),
  });
  const teachers = useQuery({
    queryKey: ['teachers', schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  const students = useQuery({
    queryKey: ['students-count', schoolId],
    enabled: can('student:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { limit: 1 } } })),
  });
  const examTypes = useQuery({
    queryKey: ['exam-types', schoolId],
    enabled: examsEnabled && can('exam:read'),
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });

  // Tunggu semua data siap supaya kartu tidak berkedip; gagal memuat berarti kartu disembunyikan, bukan salah hitung.
  const ready =
    identity.data &&
    levels.data &&
    years.data &&
    semesters.data &&
    subjects.data &&
    classes.data &&
    teachers.data &&
    students.data &&
    (!examsEnabled || !can('exam:read') || examTypes.data);
  if (!ready) return null;

  const defs = buildSchoolSteps(
    {
      identity: hasIdentity(identity.data),
      levels: levels.data?.length ?? 0,
      years: years.data?.length ?? 0,
      semesters: semesters.data?.length ?? 0,
      subjects: subjects.data?.length ?? 0,
      classes: classes.data?.length ?? 0,
      teachers: teachers.data?.length ?? 0,
      students: students.data?.total ?? 0,
      examTypes: examTypes.data?.length ?? 0,
    },
    { examsEnabled: examsEnabled && can('exam:read') },
  );
  const steps: OnboardingStep[] = defs.map((d) => ({
    id: d.id,
    done: d.done,
    href: d.href,
    label: t(`steps.${d.id}.label`),
    hint: t(`steps.${d.id}.hint`),
  }));
  const done = steps.filter((s) => s.done).length;

  return (
    <OnboardingCard
      storageKey={`onboarding:${userId}:school:${schoolId}`}
      title={t('title')}
      description={t('description')}
      steps={steps}
      progressLabel={t('progress', { done, total: steps.length })}
      openLabel={t('open')}
      dismissLabel={t('dismiss')}
    />
  );
}
