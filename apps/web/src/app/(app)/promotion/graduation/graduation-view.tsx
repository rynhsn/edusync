'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, GraduationCap, ListChecks, Scale, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DecisionsPanel } from './decisions-panel';
import { ExamsPanel } from './exams-panel';
import { useGraduationError } from './graduation-shared';
import { PolicyPanel } from './policy-panel';
import { TemplateCard } from './template-card';

type Tab = 'decisions' | 'exams' | 'policy';
const TAB_ICONS = { decisions: ListChecks, exams: ClipboardList, policy: Scale } as const;

/**
 * Kelulusan: kriteria (kebijakan) per tahun ajaran, nilai ujian satuan pendidikan, saran nilai kelulusan, penetapan oleh sekolah,
 * nomor SKL/ijazah, dan cetak SKL dan transkrip. Status lulus murid baru berlaku saat kenaikan kelas diterapkan.
 */
export function GraduationView() {
  const t = useTranslations('graduation');
  const tp = useTranslations('promotion');
  const err = useGraduationError();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const readable = can('graduation:read');
  const manage = can('graduation:manage');

  const [yearChoice, setYearChoice] = useState('');
  const [tabChoice, setTabChoice] = useState<Tab | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: readable,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const list = years.data ?? [];
  const year = list.find((y) => y.id === yearChoice) ?? list.find((y) => y.isActive) ?? list[0];
  const yearId = year?.id ?? '';

  const policy = useQuery({
    queryKey: ['graduation', school.schoolId, yearId, 'policy'],
    enabled: readable && !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/graduation-policy', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
  });
  const policyView = policy.data?.policy ?? null;

  if (!readable) {
    return (
      <PageBody>
        <PageHeader
          icon={GraduationCap}
          tone={MODULE_TONE.academic}
          title={t('title')}
          description={t('subtitle')}
          actions={<BackLink href="/promotion" label={t('backToPromotion')} />}
        />
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  const tabs: Tab[] = ['decisions', 'exams', 'policy'];
  const current: Tab = tabChoice ?? (policy.data && !policyView && manage ? 'policy' : 'decisions');

  return (
    <PageBody>
      <PageHeader
        icon={GraduationCap}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
        actions={<BackLink href="/promotion" label={t('backToPromotion')} />}
      />

      <Alert>
        <ShieldCheck className="size-4" aria-hidden />
        <AlertDescription>
          <span className="font-medium">{t('principleTitle')}</span> {t('principleBody')}
        </AlertDescription>
      </Alert>

      {years.isPending && <ListSkeleton rows={2} stats={0} />}
      {years.isError && (
        <Alert variant="destructive">
          <AlertDescription>{err(years.error)}</AlertDescription>
        </Alert>
      )}
      {years.data && list.length === 0 && (
        <EmptyPanel
          icon={CalendarDays}
          tone={MODULE_TONE.academic}
          title={t('noYears')}
          body={t('noYearsBody')}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/academic-years" />}>
              {t('yearsLink')}
            </Button>
          }
        />
      )}

      {years.data && list.length > 0 && (
        <>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="grad-year">{t('year')}</Label>
            <SelectField
              id="grad-year"
              className={TOUCH_SELECT}
              value={yearId}
              onChange={(e) => {
                setYearChoice(e.target.value);
                setTabChoice(null);
              }}
            >
              {list.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.isActive ? `${y.name} (${tp('activeSuffix')})` : y.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div
            role="tablist"
            aria-label={t('tabsLabel')}
            className="bg-muted grid w-full grid-cols-3 gap-0.5 rounded-xl p-0.5 lg:flex lg:w-fit"
          >
            {tabs.map((k) => {
              const Icon = TAB_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`grad-tab-${k}`}
                  aria-selected={current === k}
                  aria-controls={`grad-panel-${k}`}
                  onClick={() => setTabChoice(k)}
                  className={cn(
                    'focus-visible:ring-ring/60 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-center text-sm font-medium outline-none transition-colors focus-visible:ring-2 lg:min-h-0 lg:px-3 lg:whitespace-nowrap',
                    current === k
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-4 max-sm:hidden" />
                  {t(`tabs.${k}`)}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`grad-panel-${current}`}
            aria-labelledby={`grad-tab-${current}`}
            className="grid gap-4"
          >
            {policy.isPending && <ListSkeleton rows={3} stats={0} />}
            {policy.isError && (
              <Alert variant="destructive">
                <AlertDescription>{err(policy.error)}</AlertDescription>
              </Alert>
            )}
            {policy.data && current === 'policy' && (
              <>
                <PolicyPanel key={yearId} yearId={yearId} policy={policyView} />
                <TemplateCard />
              </>
            )}
            {policy.data && current === 'exams' && <ExamsPanel key={yearId} yearId={yearId} />}
            {policy.data && current === 'decisions' && (
              <DecisionsPanel
                key={yearId}
                yearId={yearId}
                yearName={year?.name ?? ''}
                policy={policyView}
                onGoPolicy={() => setTabChoice('policy')}
              />
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
