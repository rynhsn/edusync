'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Snowflake } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, MODULE_TONE, TONES, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  classNamesFromReportFinal,
  formatFrozenAt,
  invalidateGradingConfig,
  originMessageKey,
  syncAction,
} from '@/lib/grading-config';
import { semesterLabel } from '@/lib/semester-label';
import { cn } from '@/lib/utils';

/**
 * Status konfigurasi nilai satu semester. "Beku" berarti aturan nilai semester itu (KKM, predikat, cara hitung, komponen,
 * KKTP) tersimpan sendiri, jadi rapor yang sudah terbit tidak berubah walau aturan sekolah diubah kemudian.
 */
export function SemesterConfigCard() {
  const t = useTranslations('grades');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [choice, setChoice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const list = semesters.data ?? [];
  const active = list.find((s) => s.isActive);
  const semester = list.find((s) => s.id === choice) ?? active ?? list[0];
  const semesterId = semester?.id ?? '';

  const config = useQuery({
    queryKey: ['grading-semester-config', school.schoolId, semesterId],
    enabled: semesterId !== '',
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters/{id}/grading-config', {
          params: { ...header, path: { id: semesterId } },
        }),
      ),
  });
  const cfg = config.data;

  const sync = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/semesters/{id}/grading-config/sync', {
          params: { ...header, path: { id: semesterId } },
        }),
      ),
    onSuccess: (r) => {
      setSyncError(null);
      toast.success(r.changed ? t('syncDone') : t('syncNoChange'));
      invalidateGradingConfig(queryClient, school.schoolId);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'report_final') {
        const names = classNamesFromReportFinal(e.message);
        setSyncError(
          names.length > 0
            ? t('syncBlockedFinal', { classes: names.join(', ') })
            : t('syncBlockedFinalNoNames'),
        );
        // Jumlah rapor final di layar mungkin sudah usang; muat ulang supaya tombol ikut menyesuaikan.
        invalidateGradingConfig(queryClient, school.schoolId);
      } else setSyncError(te(errorKey(e)));
    },
  });

  const action = cfg ? syncAction(cfg) : 'none';
  const isFrozen = cfg?.frozen === true;

  return (
    <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex items-start gap-3">
        <IconTile icon={Snowflake} tone={MODULE_TONE.academic} />
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold">{t('semCfgTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('semCfgHint')}</p>
        </div>
      </div>

      {semesters.isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {semesters.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(semesters.error))}</AlertDescription>
        </Alert>
      )}
      {semesters.data && list.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('semCfgNoSemester')}</p>
      )}

      {list.length > 0 && (
        <div className="grid content-start gap-2 sm:max-w-xs">
          <Label htmlFor="semcfg-semester">{t('semester')}</Label>
          <SelectField
            id="semcfg-semester"
            value={semesterId}
            onChange={(e) => {
              setChoice(e.target.value);
              setSyncError(null);
            }}
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {semesterLabel(s)}
                {s.isActive ? ` (${t('semCfgActiveSuffix')})` : ''}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {semesterId !== '' && config.isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {semesterId !== '' && config.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(config.error))}</AlertDescription>
        </Alert>
      )}

      {cfg && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={isFrozen ? 'sky' : 'emerald'} dot={false}>
              {isFrozen && <Snowflake aria-hidden className="size-3" />}
              {t(isFrozen ? 'semCfgFrozen' : 'semCfgLive')}
            </ToneBadge>
            {isFrozen && (
              <ToneBadge tone={cfg.matchesLive ? 'emerald' : 'amber'} dot={false}>
                {t(cfg.matchesLive ? 'semCfgSame' : 'semCfgDiffers')}
              </ToneBadge>
            )}
            {cfg.finalReportCount > 0 && (
              <ToneBadge tone="slate" dot={false}>
                {t('semCfgFinalCount', { reports: cfg.finalReportCount, classes: cfg.finalClassCount })}
              </ToneBadge>
            )}
          </div>

          <p className="text-muted-foreground text-sm">
            {t(isFrozen ? 'semCfgWhatFrozen' : 'semCfgWhatLive')}
          </p>

          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {isFrozen && (
              <>
                <div className="bg-muted/50 min-w-0 rounded-xl px-3 py-2">
                  <dt className="text-muted-foreground text-xs">{t('semCfgOrigin')}</dt>
                  <dd className="text-sm font-medium break-words">{t(originMessageKey(cfg.origin))}</dd>
                </div>
                <div className="bg-muted/50 min-w-0 rounded-xl px-3 py-2">
                  <dt className="text-muted-foreground text-xs">{t('semCfgFrozenAt')}</dt>
                  <dd className="text-sm font-medium break-words tabular-nums">
                    {formatFrozenAt(locale, cfg.frozenAt)}
                  </dd>
                </div>
              </>
            )}
            <div className="bg-muted/50 min-w-0 rounded-xl px-3 py-2">
              <dt className="text-muted-foreground text-xs">{t('semCfgRules')}</dt>
              <dd className="text-sm font-medium break-words tabular-nums">
                {t('semCfgRulesValue', {
                  kkm: cfg.settings.kkm,
                  a: cfg.settings.predicateA,
                  b: cfg.settings.predicateB,
                  c: cfg.settings.predicateC,
                })}
              </dd>
            </div>
            <div className="bg-muted/50 min-w-0 rounded-xl px-3 py-2">
              <dt className="text-muted-foreground text-xs">{t('semCfgComponents')}</dt>
              <dd className="text-sm font-medium break-words">
                {cfg.components.length === 0
                  ? '-'
                  : cfg.components.map((c) => `${c.name} ${c.weight}%`).join(' · ')}
                {cfg.criteriaCount !== null && cfg.criteriaCount > 0 && (
                  <span className="text-muted-foreground block text-xs font-normal">
                    {t('semCfgCriteria', { count: cfg.criteriaCount })}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {isFrozen && !cfg.matchesLive && (
            <div role="status" className={cn('grid gap-2 rounded-xl border p-3 text-sm', TONES.amber.soft)}>
              <p className="font-medium">{t('semCfgDiffersTitle')}</p>
              <p>{t('semCfgDiffersBody')}</p>
              {action === 'blocked' && <p>{t('semCfgBlockedHint')}</p>}
              {action === 'sync' && can('grade:configure') && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 bg-background md:h-8"
                    disabled={sync.isPending}
                    onClick={() => {
                      setSyncError(null);
                      setConfirming(true);
                    }}
                  >
                    {t('semCfgSyncButton')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {syncError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{syncError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('semCfgSyncButton')}
        description={t('semCfgSyncConfirm', { semester: semester ? semesterLabel(semester) : '' })}
        confirmLabel={t('semCfgSyncConfirmButton')}
        pending={sync.isPending}
        onConfirm={async () => {
          try {
            await sync.mutateAsync();
          } catch {
            // Galat tampil di kartu (onError); dialog ditutup supaya pesannya terbaca.
          }
        }}
      />
    </Card>
  );
}
