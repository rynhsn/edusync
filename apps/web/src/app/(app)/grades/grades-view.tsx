'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { AssessmentsPanel } from './assessments-panel';
import { RecapPanel } from './recap-panel';

type Mode = 'assessments' | 'recap';

/** Modul penilaian: filter semester, kelas, dan mata pelajaran, lalu tampilan daftar penilaian atau rekap nilai. */
export function GradesView() {
  const t = useTranslations('grades');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [mode, setMode] = useState<Mode>('assessments');
  const [semesterChoice, setSemesterChoice] = useState('');
  const [classChoice, setClassChoice] = useState('');
  const [subjectChoice, setSubjectChoice] = useState('');

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const semester =
    semesters.data?.find((s) => s.id === semesterChoice) ??
    semesters.data?.find((s) => s.isActive) ??
    semesters.data?.[0];
  const semesterId = semester?.id ?? '';

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, semester?.academicYearId],
    enabled: !!semester && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { ...header, query: { academicYearId: semester?.academicYearId } },
        }),
      ),
  });
  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    enabled: can('subject:read'),
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  // Guru tanpa grade:configure hanya melihat mapel yang ia ampu pada kelas terpilih.
  const restricted = !can('grade:configure');
  const mine = useQuery({
    queryKey: ['grading-my-assignments', school.schoolId],
    enabled: restricted,
    queryFn: async () => unwrap(await api.GET('/v1/grading/my-assignments', { params: header })),
  });
  const classList = classes.data ?? [];
  const classId = classList.some((c) => c.id === classChoice) ? classChoice : (classList[0]?.id ?? '');
  const subjectList = (subjects.data ?? []).filter(
    (s) =>
      !restricted ||
      mine.data?.all ||
      mine.data?.items.some((a) => a.classId === classId && a.subjectId === s.id),
  );
  const subjectId = subjectList.some((s) => s.id === subjectChoice)
    ? subjectChoice
    : (subjectList[0]?.id ?? '');
  const ready = !!semesterId && !!classId && !!subjectId;

  return (
    <PageBody>
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          aria-label={t('semester')}
          className="sm:w-56"
          value={semesterId}
          onChange={(e) => setSemesterChoice(e.target.value)}
        >
          {semesters.data?.length === 0 && <option value="">{t('chooseSemester')}</option>}
          {semesters.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('class')}
          className="sm:w-44"
          value={classId}
          onChange={(e) => setClassChoice(e.target.value)}
        >
          {classList.length === 0 && <option value="">{t('chooseClass')}</option>}
          {classList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('subject')}
          className="sm:w-60"
          value={subjectId}
          onChange={(e) => setSubjectChoice(e.target.value)}
        >
          {subjectList.length === 0 && <option value="">{t('chooseSubject')}</option>}
          {subjectList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <div className="ml-auto inline-flex gap-1">
          {(['assessments', 'recap'] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(`mode_${m}`)}
            </Button>
          ))}
        </div>
      </div>

      {!ready ? (
        <Alert>
          <AlertDescription>{t('pickFilters')}</AlertDescription>
        </Alert>
      ) : mode === 'assessments' ? (
        <AssessmentsPanel semesterId={semesterId} classId={classId} subjectId={subjectId} />
      ) : (
        <RecapPanel semesterId={semesterId} classId={classId} subjectId={subjectId} />
      )}
      {semesters.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noSemesters')}</Card>
      )}
    </PageBody>
  );
}
