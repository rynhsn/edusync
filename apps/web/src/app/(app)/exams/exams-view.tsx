'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardCheck, Clock, FileQuestion, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageBody, PageHeader } from '@/components/page-header';
import { type PrerequisiteKind, PrerequisiteNotice } from '@/components/prerequisite-notice';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { semesterLabel } from '@/lib/semester-label';
import { ExamDialog, type ExamLike } from './exam-dialog';

type ExamRow = ExamLike & {
  typeShort: string;
  subjectName: string;
  semesterName: string;
  classNames: string[];
  questionCount: number;
  totalPoints: number;
};

/** Daftar ujian: saring menurut semester, mapel, dan status; buka halaman susun per ujian. */
export function ExamsView() {
  const t = useTranslations('examList');
  const tp = useTranslations('schoolOnboarding.prereq');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const author = can('exam:author');

  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExamRow | null>(null);

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const subjects = useQuery({
    queryKey: ['exam-subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/subjects', { params: header })),
  });
  const exams = useQuery({
    queryKey: ['exams', school.schoolId, semesterId, subjectId, status],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exams', {
          params: {
            ...header,
            query: {
              ...(semesterId ? { semesterId } : {}),
              ...(subjectId ? { subjectId } : {}),
              ...(status ? { status: status as 'draft' | 'ready' } : {}),
            },
          },
        }),
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['exams', school.schoolId] });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/exams/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const types = useQuery({
    queryKey: ['exam-types', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });

  const list = (exams.data ?? []) as ExamRow[];
  const subjectList = subjects.data ?? [];
  // Prasyarat: ujian butuh mapel dan semester; jenis ujian tidak wajib tetapi dianjurkan.
  const missing: PrerequisiteKind[] = [];
  if (subjects.data && subjectList.length === 0) missing.push('subjects');
  if (semesters.data && semesters.data.length === 0) missing.push('semesters');
  const blocked = missing.length > 0;
  if (types.data && types.data.length === 0) missing.push('examTypes');

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          author && (
            <Button onClick={openNew} disabled={blocked}>
              <Plus className="size-4" aria-hidden /> {t('addExam')}
            </Button>
          )
        }
      />

      {author && missing.length > 0 && (
        <PrerequisiteNotice title={tp(blocked ? 'examBlockedTitle' : 'examSoftTitle')} missing={missing} />
      )}

      <Toolbar>
        <div className="w-56">
          <SelectField
            aria-label={t('semester')}
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">{t('allSemesters')}</option>
            {(semesters.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {semesterLabel(s)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-56">
          <SelectField
            aria-label={t('subject')}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">{t('allSubjects')}</option>
            {subjectList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-44">
          <SelectField aria-label={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            <option value="draft">{t('status_draft')}</option>
            <option value="ready">{t('status_ready')}</option>
          </SelectField>
        </div>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {t('count', { n: list.length })}
        </span>
      </Toolbar>

      {exams.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {exams.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          tone="violet"
          title={t('emptyTitle')}
          body={t('emptyBody')}
          first={te('emptyState.pages.exams')}
          canAct={author}
          action={
            <Button onClick={openNew} disabled={blocked}>
              <Plus className="size-4" aria-hidden /> {t('addExam')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((x) => (
            <article key={x.id} className="bg-card relative grid content-start gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone="violet">{x.typeShort}</ToneBadge>
                <ToneBadge tone={x.status === 'ready' ? 'emerald' : 'amber'}>
                  {t(`status_${x.status}`)}
                </ToneBadge>
                <ToneBadge tone="sky" dot={false}>
                  {t(`mode_${x.mode}`)}
                </ToneBadge>
                {author && (
                  <span className="ml-auto">
                    <ActionMenu
                      label={t('examActions', { name: x.title })}
                      items={[
                        {
                          label: t('edit'),
                          icon: Pencil,
                          onSelect: () => {
                            setEditing(x);
                            setOpen(true);
                          },
                        },
                        {
                          label: t('delete'),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setDeleting(x),
                        },
                      ]}
                    />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-base font-semibold">
                  <Link href={`/exams/${x.id}`} className="after:absolute after:inset-0 hover:underline">
                    {x.title}
                  </Link>
                </h2>
                <p className="text-muted-foreground truncate text-xs">
                  {x.subjectName} · {x.semesterName}
                </p>
              </div>
              <ul className="text-muted-foreground grid gap-1 text-xs">
                <li className="flex items-center gap-1.5">
                  <Users className="size-3.5 shrink-0" aria-hidden /> {x.classNames.join(', ') || '-'}
                </li>
                <li className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                  {x.examDate ? formatCalendarDate(locale, x.examDate) : t('noDate')}
                </li>
                {(x.startTime || x.durationMinutes) && (
                  <li className="flex items-center gap-1.5">
                    <Clock className="size-3.5 shrink-0" aria-hidden />
                    {[x.startTime, x.durationMinutes ? t('minutes', { n: x.durationMinutes }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <FileQuestion className="size-3.5 shrink-0" aria-hidden />
                  {t('questionsPoints', { n: x.questionCount, pts: x.totalPoints })}
                </li>
              </ul>
            </article>
          ))}
        </div>
      )}

      <ExamDialog
        open={open}
        onOpenChange={setOpen}
        exam={editing}
        defaults={{ semesterId, subjectId }}
        onSaved={() => {
          setOpen(false);
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteTitle', { name: deleting?.title ?? '' })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </PageBody>
  );
}
