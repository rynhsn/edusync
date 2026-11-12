'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronsUp, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { ImportStepper } from '@/components/import-parts';
import { ListSkeleton, REVEAL } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { ApplyStep } from './apply-step';
import { DecisionsStep, useDecisions } from './decisions-step';
import { defaultSourceId, eligibleTargets, isBlocked, studentNames } from './promotion-logic';
import { RolloverStep } from './rollover-step';

const LAST_STEP = 3;

export function PromotionView() {
  const t = useTranslations('promotion');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const allowed = can('promotion:manage');

  const [step, setStep] = useState(0);
  const [pickedSource, setPickedSource] = useState<string | null>(null);
  const [pickedTarget, setPickedTarget] = useState('');

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed,
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });
  const list = years.data ?? [];
  const sourceId = pickedSource ?? defaultSourceId(list);
  const source = list.find((y) => y.id === sourceId);
  const targets = eligibleTargets(list, sourceId);
  const target = targets.find((y) => y.id === pickedTarget);
  const ready = !!source && !!target;

  const decisions = useDecisions(sourceId, allowed && ready && step >= 2);

  const show = (iso: string) => formatCalendarDate(locale, iso);
  const yearLabel = (y: { name: string; isActive: boolean }) =>
    y.isActive ? `${y.name} (${t('activeSuffix')})` : y.name;

  // Langkah keputusan: siswa tingkat akhir wajib diputuskan eksplisit sebelum lanjut ke penerapan.
  const nextBlocked = step === 2 && (decisions.query.isPending || isBlocked(decisions.blockers));
  const labels = [t('stepYears'), t('stepRollover'), t('stepDecisions'), t('stepApply')];

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={ChevronsUp}
          tone={MODULE_TONE.academic}
          title={t('title')}
          description={t('subtitle')}
        />
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        icon={ChevronsUp}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
      />

      <Alert>
        <ShieldCheck className="size-4" aria-hidden />
        <AlertDescription>
          <span className="font-medium">{t('safeTitle')}</span> {t('safeBody')}
        </AlertDescription>
      </Alert>

      <ImportStepper step={step} labels={labels} ariaLabel={t('stepsLabel')} />

      {years.isPending && <ListSkeleton rows={2} stats={0} />}
      {years.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(years.error))}</AlertDescription>
        </Alert>
      )}

      {years.data && step === 0 && (
        <section className={cn('grid gap-4', REVEAL)} aria-labelledby="promo-years-title">
          <div>
            <h2 id="promo-years-title" className="font-heading text-lg font-semibold">
              {t('yearsTitle')}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('yearsHelp')}</p>
          </div>

          {list.length === 0 ? (
            <EmptyPanel
              icon={CalendarDays}
              tone="teal"
              title={t('noYears')}
              body={t('noYearsBody')}
              action={
                <Button nativeButton={false} render={<Link href="/academic-years" />}>
                  {t('yearsLink')}
                </Button>
              }
            />
          ) : (
            <div className="bg-card grid gap-4 rounded-2xl border p-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="promo-source">{t('sourceLabel')}</Label>
                <SelectField
                  id="promo-source"
                  value={sourceId}
                  onChange={(e) => {
                    setPickedSource(e.target.value);
                    setPickedTarget('');
                  }}
                >
                  {list.map((y) => (
                    <option key={y.id} value={y.id}>
                      {yearLabel(y)}
                    </option>
                  ))}
                </SelectField>
                <p className="text-muted-foreground text-xs">
                  {source ? `${show(source.startsOn)} – ${show(source.endsOn)}. ` : ''}
                  {t('sourceHint')}
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="promo-target">{t('targetLabel')}</Label>
                <SelectField
                  id="promo-target"
                  value={pickedTarget}
                  placeholder={t('pickTarget')}
                  disabled={targets.length === 0}
                  onChange={(e) => setPickedTarget(e.target.value)}
                >
                  {targets.map((y) => (
                    <option key={y.id} value={y.id}>
                      {yearLabel(y)}
                    </option>
                  ))}
                </SelectField>
                {targets.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('noTarget')}{' '}
                    <Link href="/academic-years" className="font-medium underline underline-offset-2">
                      {t('yearsLink')}
                    </Link>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {target ? `${show(target.startsOn)} – ${show(target.endsOn)}. ` : ''}
                    {t('targetHint')}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {years.data && ready && step === 1 && (
        <RolloverStep
          key={`${sourceId}:${target.id}`}
          sourceId={sourceId}
          targetId={target.id}
          sourceName={source.name}
          targetName={target.name}
        />
      )}
      {years.data && ready && step === 2 && <DecisionsStep state={decisions} />}
      {years.data && ready && step === 3 && (
        <ApplyStep
          key={`${sourceId}:${target.id}`}
          sourceId={sourceId}
          targetId={target.id}
          sourceName={source.name}
          targetName={target.name}
          unsaved={decisions.summary.unsaved}
          decided={decisions.summary.total}
          names={studentNames(decisions.classes)}
        />
      )}

      {years.data && list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ArrowLeft className="size-4" aria-hidden /> {t('prev')}
          </Button>
          {step < LAST_STEP && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {nextBlocked && isBlocked(decisions.blockers) && (
                <p role="status" className="max-w-xs text-xs font-medium text-amber-700 dark:text-amber-300">
                  {decisions.blockers.missingFinal > 0
                    ? t('blockedMissingFinal', { count: decisions.blockers.missingFinal })
                    : t('blockedInvalidDetails', { count: decisions.blockers.invalidDetails })}
                </p>
              )}
              <Button
                disabled={!ready || nextBlocked}
                onClick={() => setStep((s) => Math.min(LAST_STEP, s + 1))}
              >
                {t('next')} <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      )}
    </PageBody>
  );
}
