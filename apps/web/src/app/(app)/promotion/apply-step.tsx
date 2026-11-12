'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, GraduationCap, Play, RotateCcw, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { StepError } from './step-error';

export function ApplyStep({
  sourceId,
  targetId,
  sourceName,
  targetName,
  unsaved,
  decided,
  names,
}: {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  /** Pilihan di langkah 3 yang belum tersimpan; penerapan hanya membaca keputusan tersimpan. */
  unsaved: number;
  /** Jumlah siswa di tahun sumber. */
  decided: number;
  names: Map<string, string>;
}) {
  const t = useTranslations('promotion');
  const { school } = useSchool();
  const queryClient = useQueryClient();

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => ({
      dryRun,
      data: unwrap(
        await api.POST('/v1/academic-years/{id}/promotions/apply', {
          params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
          body: { targetYearId: targetId, dryRun },
        }),
      ),
    }),
    onSuccess: ({ dryRun, data }) => {
      if (dryRun) return;
      toast.success(
        t('applyDone', { placed: data.placed, retained: data.retained, graduated: data.graduated }),
      );
      queryClient.invalidateQueries({ queryKey: ['promotions', school.schoolId, sourceId] });
      queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
    },
  });
  const result = run.data;
  const blocked = unsaved > 0 || decided === 0;
  const nameOf = (id: string) => names.get(id) ?? id;

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="promo-apply-title">
      <div>
        <h2 id="promo-apply-title" className="font-heading text-lg font-semibold">
          {t('applyTitle')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {t('applyHelp', { source: sourceName, target: targetName })}
        </p>
      </div>

      {unsaved > 0 && (
        <Alert>
          <AlertDescription>{t('applyUnsaved', { count: unsaved })}</AlertDescription>
        </Alert>
      )}
      {decided === 0 && (
        <Alert>
          <AlertDescription>{t('applyNoStudents')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={blocked || run.isPending} onClick={() => run.mutate(true)}>
          <Eye className="size-4" aria-hidden /> {run.isPending ? t('working') : t('preview')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button disabled={blocked || run.isPending}>
              <Play className="size-4" aria-hidden /> {t('applyRun')}
            </Button>
          }
          title={t('applyConfirmTitle')}
          description={t('applyConfirmBody', { source: sourceName, target: targetName })}
          confirmLabel={t('applyRun')}
          pending={run.isPending}
          onConfirm={async () => {
            try {
              await run.mutateAsync(false);
            } catch {
              // Galat tampil di bawah tombol.
            }
          }}
        />
      </div>

      {run.isError && <StepError error={run.error} />}

      {result && (
        <div className={cn('grid gap-4', REVEAL)} aria-live="polite">
          <ToneBadge tone={result.dryRun ? 'amber' : 'emerald'} className="w-fit">
            {result.dryRun ? t('previewBadge') : t('doneBadge')}
          </ToneBadge>
          <StatGrid>
            <StatCard icon={UserCheck} tone="emerald" label={t('resPlaced')} value={result.data.placed} />
            <StatCard icon={RotateCcw} tone="amber" label={t('resRetained')} value={result.data.retained} />
            <StatCard
              icon={GraduationCap}
              tone="violet"
              label={t('resGraduated')}
              value={result.data.graduated}
            />
            <StatCard
              icon={CheckCircle2}
              tone="sky"
              label={t('resAlready')}
              value={result.data.alreadyEnrolled.length}
              hint={t('resAlreadyHint')}
            />
            <StatCard
              icon={UserX}
              tone="slate"
              label={t('resNoDecision')}
              value={result.data.skippedNoDecision}
              hint={t('resNoDecisionHint')}
            />
          </StatGrid>

          {result.data.unplaced.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('allPlaced')}</p>
          ) : (
            <div className="grid gap-2">
              <Alert variant="destructive">
                <AlertTitle>{t('unplacedTitle', { count: result.data.unplaced.length })}</AlertTitle>
                <AlertDescription>{t('unplacedHint')}</AlertDescription>
              </Alert>
              <div className="bg-card overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('colStudent')}</TableHead>
                      <TableHead>{t('colReason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.unplaced.map((u) => (
                      <TableRow key={u.studentId}>
                        <TableCell className="font-medium">{nameOf(u.studentId)}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-normal">{u.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {result.data.alreadyEnrolled.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">
                {t('alreadyTitle', { count: result.data.alreadyEnrolled.length })}
              </p>
              <p className="text-muted-foreground text-xs">{t('alreadyHint')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {result.data.alreadyEnrolled.map((a) => (
                  <li key={a.studentId}>
                    <ToneBadge tone="sky" dot={false}>
                      {nameOf(a.studentId)}
                    </ToneBadge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.dryRun && <p className="text-muted-foreground text-xs">{t('previewNote')}</p>}
        </div>
      )}
    </section>
  );
}
