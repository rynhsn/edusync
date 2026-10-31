'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ClipboardCheck, ListFilter, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
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
      <PageHeader
        icon={ClipboardCheck}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
        actions={
          !restricted && (
            <Button variant="outline" nativeButton={false} render={<Link href="/grades/settings" />}>
              <Settings2 className="size-4" /> {t('settingsTitle')}
            </Button>
          )
        }
      />

      <Toolbar>
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
        <div className="bg-muted ml-auto inline-flex rounded-xl p-0.5">
          {(['assessments', 'recap'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'focus-visible:ring-ring/60 rounded-[10px] px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2',
                mode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
      </Toolbar>

      {semesters.data?.length === 0 ? (
        <EmptyPanel
          icon={CalendarRange}
          tone={MODULE_TONE.academic}
          title={t('noSemestersTitle')}
          body={t('noSemesters')}
        />
      ) : !ready ? (
        semesters.isPending ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : (
          <EmptyPanel
            icon={ListFilter}
            tone={MODULE_TONE.academic}
            title={t('pickFiltersTitle')}
            body={t('pickFilters')}
          />
        )
      ) : mode === 'assessments' ? (
        <AssessmentsPanel semesterId={semesterId} classId={classId} subjectId={subjectId} />
      ) : (
        <RecapPanel semesterId={semesterId} classId={classId} subjectId={subjectId} />
      )}
    </PageBody>
  );
}
