'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ExamSheet, PrintPortal, type SheetView } from '../../paper/exam-sheet';

const VIEWS: SheetView[] = ['questions', 'answers', 'key'];

/** Halaman cetak: pilih lembar soal, lembar jawaban, atau kunci, lalu cetak / simpan sebagai PDF dari peramban. */
export function PrintView({ id }: { id: string }) {
  const t = useTranslations('examPaper');
  const { school } = useSchool();
  const [view, setView] = useState<SheetView>('questions');
  const print = useQuery({
    queryKey: ['exam-print', school.schoolId, id],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exams/{id}/print', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
  });
  const data = print.data;

  return (
    <PageBody>
      <PageHeader
        title={t('printTitle')}
        description={
          data
            ? `${data.exam.typeShort} · ${data.exam.subjectName} · ${data.exam.classNames.join(', ')}`
            : undefined
        }
        actions={
          <>
            <Button disabled={!data} onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> {t('printButton')}
            </Button>
            <BackLink href={`/exams/${id}`} />
          </>
        }
      />

      {print.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {data ? (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: tab pilihan lembar, bukan isian formulir. */}
          <div role="group" aria-label={t('printView')} className="flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'focus-visible:ring-ring/50 rounded-full border px-4 py-1.5 text-sm font-medium outline-none focus-visible:ring-3',
                  view === v ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
                )}
              >
                {t(`view.${v}`)}
              </button>
            ))}
            <span className="text-muted-foreground text-xs">
              {t('printHint', { size: data.config.paperSize })}
            </span>
          </div>
          {data.exam.questions.length === 0 && (
            <Alert>
              <AlertDescription>{t('noQuestions')}</AlertDescription>
            </Alert>
          )}
          <div className="bg-muted/60 overflow-auto rounded-xl border p-4">
            <div className="mx-auto w-fit shadow-md">
              <ExamSheet data={data} view={view} />
            </div>
          </div>
          <PrintPortal data={data} view={view} />
        </>
      ) : (
        !print.isError && <Skeleton className="h-96 rounded-2xl" />
      )}
    </PageBody>
  );
}
