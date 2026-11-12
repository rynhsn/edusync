'use client';

import { useQuery } from '@tanstack/react-query';
import { BookCopy, CalendarDays, LibraryBig, ListChecks, ShieldCheck, Target } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { AdoptPanel } from './adopt-panel';
import { KktpPanel } from './kktp-panel';
import { StructurePanel } from './structure-panel';
import { VersionsPanel } from './versions-panel';

const TABS = ['structure', 'versions', 'kktp', 'adopt'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS = { structure: ListChecks, versions: CalendarDays, kktp: Target, adopt: BookCopy } as const;
const TAB_LABEL = {
  structure: 'tabStructure',
  versions: 'tabVersions',
  kktp: 'tabKktp',
  adopt: 'tabAdopt',
} as const;

/** Struktur kurikulum: JP per mapel, versi kurikulum per tingkat, dan adopsi mapel dari bank kurikulum. */
export function CurriculumView() {
  const t = useTranslations('curriculum');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const allowed = can('subject:read');
  const canWrite = can('curriculum:manage');

  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.find((k) => k === requested) ?? 'structure');
  const [yearChoice, setYearChoice] = useState('');

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const list = years.data ?? [];
  const yearId =
    list.find((y) => y.id === yearChoice)?.id ?? list.find((y) => y.isActive)?.id ?? list[0]?.id ?? '';

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={LibraryBig}
          tone={MODULE_TONE.master}
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
        icon={LibraryBig}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={canWrite ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
      />

      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        className="bg-muted flex w-full gap-0.5 overflow-x-auto rounded-xl p-0.5 sm:w-fit"
      >
        {TABS.map((k) => {
          const Icon = TAB_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              id={`cur-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`cur-panel-${k}`}
              onClick={() => setTab(k)}
              className={cn(
                'focus-visible:ring-ring/60 inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2',
                tab === k
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(TAB_LABEL[k])}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`cur-panel-${tab}`} aria-labelledby={`cur-tab-${tab}`} className="grid gap-4">
        {tab !== 'adopt' && tab !== 'kktp' && (
          <>
            {years.isPending && <ListSkeleton rows={2} stats={0} />}
            {years.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(years.error))}</AlertDescription>
              </Alert>
            )}
            {years.data && list.length === 0 && (
              <EmptyPanel
                icon={CalendarDays}
                tone={MODULE_TONE.master}
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
                <div className="grid content-start gap-2 sm:max-w-xs">
                  <Label htmlFor="cur-year">{t('year')}</Label>
                  <SelectField
                    id="cur-year"
                    className={TOUCH_SELECT}
                    value={yearId}
                    onChange={(e) => setYearChoice(e.target.value)}
                  >
                    {list.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.isActive ? `${y.name} (${t('activeSuffix')})` : y.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                {tab === 'structure' && <StructurePanel yearId={yearId} canWrite={canWrite} />}
                {tab === 'versions' && <VersionsPanel yearId={yearId} canWrite={canWrite} />}
              </>
            )}
          </>
        )}
        {tab === 'kktp' && <KktpPanel canWrite={canWrite} />}
        {tab === 'adopt' && <AdoptPanel canAdopt={can('subject:manage')} />}
      </div>
    </PageBody>
  );
}
