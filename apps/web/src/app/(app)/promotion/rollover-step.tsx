'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  allowedRolloverOptions,
  isRolloverPart,
  permissionForOption,
  type RolloverOptions,
  type RolloverWarningCode,
  rolloverWarnings,
  sendableRolloverOptions,
} from './promotion-logic';
import { StepError } from './step-error';

type Options = RolloverOptions;

export function RolloverStep({
  sourceId,
  targetId,
  sourceName,
  targetName,
}: {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
}) {
  const t = useTranslations('promotion');
  const tp = useTranslations('permissions');
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<Options>({
    copyClasses: true,
    copyAssignments: true,
    // Kalender tiap tahun berbeda: salin hanya bila dipilih dan tanggalnya diperiksa ulang.
    copyCalendar: false,
    copyCurriculum: true,
    copyTeachingPlans: true,
  });
  // Bagian tanpa izin spesifik dinonaktifkan dan tidak pernah dikirim true (API melewatinya dengan peringatan).
  const allowed = allowedRolloverOptions(can);
  const sent = sendableRolloverOptions(options, can);
  const anyOption = Object.values(sent).some(Boolean);
  const nothingAllowed = !Object.values(allowed).some(Boolean);
  const permissionLabel = (permission: string) => {
    const key = permission.replace(':', '_');
    return tp.has(key as never) ? tp(key as never) : permission;
  };

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => ({
      dryRun,
      data: unwrap(
        await api.POST('/v1/academic-years/{id}/rollover', {
          params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
          body: { targetYearId: targetId, ...sent, dryRun },
        }),
      ),
    }),
    onSuccess: ({ dryRun, data }) => {
      if (dryRun) return;
      toast.success(
        t('rolloverDone', {
          classes: data.classesCreated,
          assignments: data.assignmentsCreated,
          events: data.eventsCreated,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['promotions', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['curriculum-allocations', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['curriculum-versions', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['teaching-plan'] });
    },
  });
  const result = run.data;
  const warnings = result ? rolloverWarnings(result.data) : [];

  /** Parameter peringatan yang berupa ID teknis (bagian, izin) diganti nama yang mudah dibaca. */
  function warningParams(code: string, params: Record<string, string | number>) {
    if (code !== 'part_skipped_no_permission' || !isRolloverPart(params.part)) return params;
    return {
      ...params,
      part: t(`rolloverPart.${params.part}`),
      permission: permissionLabel(String(params.permission)),
    };
  }

  function toggle(key: keyof Options, value: boolean) {
    setOptions((o) => ({ ...o, [key]: value }));
    run.reset();
  }

  const rows: { key: keyof Options; label: string; hint: string }[] = [
    { key: 'copyClasses', label: t('copyClasses'), hint: t('copyClassesHint') },
    { key: 'copyAssignments', label: t('copyAssignments'), hint: t('copyAssignmentsHint') },
    { key: 'copyCalendar', label: t('copyCalendar'), hint: t('copyCalendarHint') },
    { key: 'copyCurriculum', label: t('copyCurriculum'), hint: t('copyCurriculumHint') },
    { key: 'copyTeachingPlans', label: t('copyTeachingPlans'), hint: t('copyTeachingPlansHint') },
  ];

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="promo-rollover-title">
      <div>
        <h2 id="promo-rollover-title" className="font-heading text-lg font-semibold">
          {t('rolloverTitle')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {t('rolloverHelp', { source: sourceName, target: targetName })}
        </p>
      </div>

      <fieldset className="bg-card grid gap-3 rounded-2xl border p-4">
        <legend className="sr-only">{t('rolloverOptions')}</legend>
        {rows.map((r) => {
          const ok = allowed[r.key];
          return (
            <div key={r.key} className="flex items-start gap-3">
              <Checkbox
                id={`promo-${r.key}`}
                className="mt-1"
                checked={sent[r.key]}
                disabled={!ok}
                aria-describedby={ok ? undefined : `promo-${r.key}-need`}
                onCheckedChange={(v) => toggle(r.key, v === true)}
              />
              <Label
                htmlFor={`promo-${r.key}`}
                className={cn(
                  'grid min-h-11 content-start gap-0.5',
                  ok ? 'cursor-pointer' : 'cursor-not-allowed',
                )}
              >
                <span className={cn('text-sm font-medium', !ok && 'opacity-70')}>{r.label}</span>
                <span className="text-muted-foreground text-xs font-normal">{r.hint}</span>
                {!ok && (
                  <span
                    id={`promo-${r.key}-need`}
                    className="text-xs font-medium text-amber-700 dark:text-amber-400"
                  >
                    {t('needsPermission', { permission: permissionLabel(permissionForOption(r.key)) })}
                  </span>
                )}
              </Label>
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!anyOption || run.isPending} onClick={() => run.mutate(true)}>
          <Eye className="size-4" aria-hidden /> {run.isPending ? t('working') : t('preview')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button disabled={!anyOption || run.isPending}>
              <Play className="size-4" aria-hidden /> {t('runRollover')}
            </Button>
          }
          title={t('rolloverConfirmTitle')}
          description={t('rolloverConfirmBody', { source: sourceName, target: targetName })}
          confirmLabel={t('runRollover')}
          pending={run.isPending}
          onConfirm={async () => {
            try {
              await run.mutateAsync(false);
            } catch {
              // Galat tampil di bawah tombol.
            }
          }}
        />
        {!anyOption && (
          <p className="text-muted-foreground text-xs">
            {nothingAllowed ? t('noPartPermission') : t('pickOne')}
          </p>
        )}
      </div>

      {run.isError && <StepError error={run.error} />}

      {result && (
        <div className={cn('grid gap-3', REVEAL)} aria-live="polite">
          <ToneBadge tone={result.dryRun ? 'amber' : 'emerald'} className="w-fit">
            {result.dryRun ? t('previewBadge') : t('doneBadge')}
          </ToneBadge>
          <StatGrid>
            <StatCard
              icon={Copy}
              tone="teal"
              label={t('classesCreated')}
              value={result.data.classesCreated}
              hint={t('classesSkipped', { count: result.data.classesSkipped })}
            />
            <StatCard
              icon={Copy}
              tone="violet"
              label={t('assignmentsCreated')}
              value={result.data.assignmentsCreated}
            />
            <StatCard icon={Copy} tone="sky" label={t('eventsCreated')} value={result.data.eventsCreated} />
            {sent.copyCurriculum && (
              <>
                <StatCard
                  icon={Copy}
                  tone="amber"
                  label={t('allocationsCreated')}
                  value={result.data.allocationsCreated ?? 0}
                />
                <StatCard
                  icon={Copy}
                  tone="emerald"
                  label={t('versionsCreated')}
                  value={result.data.versionsCreated ?? 0}
                />
              </>
            )}
            {sent.copyTeachingPlans && (
              <StatCard
                icon={Copy}
                tone="rose"
                label={t('flowsCreated')}
                value={result.data.flowsCreated ?? 0}
                hint={(result.data.flowsCreated ?? 0) > 0 ? t('flowsCreatedHint') : undefined}
              />
            )}
          </StatGrid>
          {warnings.length > 0 ? (
            <Alert>
              <AlertTitle>{t('warningsTitle', { count: warnings.length })}</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {warnings.map((w) => (
                    <li key={`${w.code ?? 'text'}:${w.fallback}`}>
                      {w.code === 'part_skipped_no_permission' && !isRolloverPart(w.params.part)
                        ? w.fallback
                        : w.code
                          ? t(
                              `rolloverWarning.${w.code as RolloverWarningCode}`,
                              warningParams(w.code, w.params),
                            )
                          : w.fallback}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noWarnings')}</p>
          )}
          {result.dryRun && <p className="text-muted-foreground text-xs">{t('previewNote')}</p>}
        </div>
      )}
    </section>
  );
}
