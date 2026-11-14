'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleMinus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { problemOf } from '@/lib/subject-choice';
import { problemText } from '../subject-choices/choice-text';

/** Ringkasan "Mapel pilihan" satu murid: mapel berbasis pilihan di kelasnya, mana yang diambil, dan hasil aturan sekolah. */
export function StudentChoices({ studentId }: { studentId: string }) {
  const t = useTranslations('subjectChoices');
  const te = useTranslations();
  const { school, can } = useSchool();
  const q = useQuery({
    queryKey: ['student-subject-choices', school.schoolId, studentId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students/{id}/subject-choices', {
          params: { header: schoolHeader(school.schoolId), path: { id: studentId }, query: {} },
        }),
      ),
  });

  if (q.isPending) {
    return (
      <div className="grid gap-3" aria-hidden>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(q.error))}</AlertDescription>
      </Alert>
    );
  }
  const d = q.data;
  const problems = d.results.map((r) => problemOf(r)).filter((p) => p !== null);

  if (!d.classId) return <p className="text-muted-foreground text-sm">{t('studentNoClass')}</p>;
  if (d.subjects.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('studentNoChoiceSubjects')}</p>;
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('studentIntro')}</p>
      <ul className="bg-card divide-y rounded-xl border">
        {d.subjects.map((s) => (
          <li key={s.subjectId} className="flex min-h-11 items-center gap-3 px-3 py-2">
            {s.taking ? (
              <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
            ) : (
              <CircleMinus aria-hidden className="text-muted-foreground size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 text-sm break-words">{s.name}</span>
            <ToneBadge tone={s.taking ? 'emerald' : 'slate'} dot={false}>
              {s.taking ? t('taking') : t('notTaking')}
            </ToneBadge>
          </li>
        ))}
      </ul>
      {problems.length > 0 && (
        <ul className="grid gap-1.5">
          {problems.map((p) => (
            <li
              key={`${p.groupKey}-${p.kind}`}
              className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{problemText(t, p)}</span>
            </li>
          ))}
        </ul>
      )}
      {can('class:read') && (
        <Link
          href={`/subject-choices?classId=${d.classId}`}
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('studentOpenPage')}
        </Link>
      )}
    </div>
  );
}
