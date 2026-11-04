'use client';

import type { ExamPaperConfig } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { type SheetData, SheetPreview } from './exam-sheet';
import { PaperConfigForm } from './paper-config-form';

type Identity = SheetData['school'];

/** Ujian contoh untuk pratinjau pengaturan sekolah (belum ada ujian yang dipilih). */
export function sampleSheet(school: Identity, config: ExamPaperConfig): SheetData {
  const mcq = (id: string, sort: number, body: string, answer: string) => ({
    id,
    sourceQuestionId: null,
    sort,
    type: 'mcq' as const,
    body,
    options: [
      { key: 'A', text: '12' },
      { key: 'B', text: '14' },
      { key: 'C', text: '24' },
      { key: 'D', text: '36' },
    ],
    answer,
    points: 2,
  });
  return {
    exam: {
      id: '00000000-0000-0000-0000-000000000000',
      examTypeId: null,
      typeName: 'Asesmen Sekolah Akhir Semester',
      typeShort: 'ASAS',
      title: 'Contoh',
      semesterId: '00000000-0000-0000-0000-000000000000',
      semesterName: 'Ganjil',
      subjectId: '00000000-0000-0000-0000-000000000000',
      subjectName: 'Matematika',
      classIds: [],
      classNames: ['7 A', '7 B'],
      mode: 'paper',
      examDate: '2026-12-08',
      startTime: '07:30',
      durationMinutes: 90,
      status: 'draft',
      shuffleQuestions: false,
      shuffleOptions: false,
      customPaper: false,
      questionCount: 3,
      totalPoints: 14,
      updatedAt: new Date(0).toISOString(),
      questions: [
        mcq('s1', 1, 'Hasil dari $2 + 3 \\times 4$ adalah ...', 'B'),
        mcq('s2', 2, 'Nilai dari $\\sqrt{144}$ adalah ...', 'A'),
        {
          id: 's3',
          sourceQuestionId: null,
          sort: 3,
          type: 'essay',
          body: 'Jelaskan langkah menyelesaikan persamaan $2x + 5 = 17$.',
          options: [],
          answer: 'x = 6',
          points: 10,
        },
      ],
    },
    school,
    academicYear: '2026/2027',
    teacherNames: ['Nama Guru, S.Pd.'],
    zoneLabel: 'WIB',
    config,
  };
}

/** Pengaturan lembar ujian cetak untuk seluruh sekolah, dengan pratinjau langsung. */
export function PaperView() {
  const t = useTranslations('examPaper');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('exam:manage');
  const key = ['exam-paper-settings', school.schoolId];
  const [draft, setDraft] = useState<ExamPaperConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/exam/paper-settings', { params: header })),
  });
  const identity = useQuery({
    queryKey: ['school-identity', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/identity', { params: header })),
  });

  const saved = settings.data?.config as ExamPaperConfig | undefined;
  const value = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: async (c: ExamPaperConfig) =>
      unwrap(await api.PUT('/v1/exam/paper-settings', { params: header, body: c })),
    onSuccess: (data) => {
      setError(null);
      setDraft(null);
      queryClient.setQueryData(key, data);
      toast.success(t('saved'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const reset = useMutation({
    mutationFn: async () => unwrap(await api.DELETE('/v1/exam/paper-settings', { params: header })),
    onSuccess: (data) => {
      setError(null);
      setDraft(null);
      queryClient.setQueryData(key, data);
      toast.success(t('resetDone'));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          manage && (
            <>
              <Button
                variant="outline"
                disabled={reset.isPending || !settings.data?.custom}
                onClick={() => reset.mutate()}
              >
                <RotateCcw className="size-4" aria-hidden /> {t('resetDefault')}
              </Button>
              <Button disabled={!dirty || save.isPending} onClick={() => draft && save.mutate(draft)}>
                <Save className="size-4" aria-hidden /> {t('save')}
              </Button>
            </>
          )
        }
      />

      {(settings.isError || identity.isError) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!value || !identity.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <PaperConfigForm value={value} disabled={!manage || save.isPending} onChange={setDraft} />
          <div className="xl:sticky xl:top-4">
            <p className="font-heading mb-1 text-sm font-semibold">{t('previewTitle')}</p>
            <p className="text-muted-foreground mb-2 text-xs">{t('previewHint')}</p>
            <SheetPreview data={sampleSheet(identity.data, value)} />
          </div>
        </div>
      )}
    </PageBody>
  );
}
