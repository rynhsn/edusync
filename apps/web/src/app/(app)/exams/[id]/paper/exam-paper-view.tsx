'use client';

import type { ExamPaperConfig } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { SheetPreview } from '../../paper/exam-sheet';
import { PaperConfigForm } from '../../paper/paper-config-form';

/** Lembar khusus satu ujian: ikuti pengaturan sekolah, atau punya pengaturan sendiri. */
export function ExamPaperView({ id }: { id: string }) {
  const t = useTranslations('examPaper');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const write = can('exam:author');
  const key = ['exam-print', school.schoolId, id];
  const [custom, setCustom] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<ExamPaperConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const print = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/exams/{id}/print', { params: { ...header, path: { id } } })),
  });

  const apply = useMutation({
    mutationFn: async (config: ExamPaperConfig | null) =>
      unwrap(
        await api.PUT('/v1/exams/{id}/paper', { params: { ...header, path: { id } }, body: { config } }),
      ),
    onSuccess: async (_r, config) => {
      setError(null);
      setDraft(null);
      setCustom(null);
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success(config ? t('examSaved') : t('examFollowing'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const data = print.data;
  const serverCustom = data?.exam.customPaper ?? false;
  const isCustom = custom ?? serverCustom;
  const config = (draft ?? data?.config) as ExamPaperConfig | undefined;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(data?.config);

  function choose(next: boolean) {
    setError(null);
    if (next) {
      setCustom(true);
      setDraft(data?.config as ExamPaperConfig);
    } else if (serverCustom) {
      apply.mutate(null);
    } else {
      setCustom(false);
      setDraft(null);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t('examTitle')}
        description={data ? `${data.exam.title} · ${data.exam.subjectName}` : t('examSubtitle')}
        actions={
          <>
            {write && isCustom && (
              <Button
                disabled={!draft || !dirty || apply.isPending}
                onClick={() => draft && apply.mutate(draft)}
              >
                <Save className="size-4" aria-hidden /> {t('save')}
              </Button>
            )}
            <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/print`} />}>
              <Printer className="size-4" aria-hidden /> {t('openPrint')}
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
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data || !config ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: dua tombol pilihan, bukan isian formulir. */}
          <div role="group" aria-label={t('examMode')} className="grid content-start gap-2 sm:grid-cols-2">
            {([false, true] as const).map((c) => (
              <button
                key={String(c)}
                type="button"
                disabled={!write || apply.isPending}
                aria-pressed={isCustom === c}
                onClick={() => choose(c)}
                className={cn(
                  'focus-visible:ring-ring/50 rounded-xl border p-3 text-left outline-none focus-visible:ring-3 disabled:opacity-60',
                  isCustom === c ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <span className="font-heading block text-sm font-semibold">
                  {t(c ? 'examCustom' : 'examFollow')}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {t(c ? 'examCustomHint' : 'examFollowHint')}
                </span>
              </button>
            ))}
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <PaperConfigForm
              value={config}
              disabled={!write || !isCustom || apply.isPending}
              onChange={setDraft}
            />
            <div className="xl:sticky xl:top-4">
              <p className="font-heading mb-1 text-sm font-semibold">{t('previewTitle')}</p>
              <p className="text-muted-foreground mb-2 text-xs">{t('examPreviewHint')}</p>
              <SheetPreview data={{ ...data, config }} />
            </div>
          </div>
        </>
      )}
    </PageBody>
  );
}
