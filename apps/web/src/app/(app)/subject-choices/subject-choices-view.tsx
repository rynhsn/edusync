'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ListChecks, ListTodo, Scale, School, ShieldCheck } from 'lucide-react';
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
import { ChoicesPanel } from './choices-panel';
import { ParticipationPanel } from './participation-panel';
import { RulesPanel } from './rules-panel';

type Tab = 'choices' | 'subjects' | 'rules';
const TAB_ICONS = { choices: ListChecks, subjects: ListTodo, rules: Scale } as const;
const TAB_LABEL = { choices: 'tabChoices', subjects: 'tabSubjects', rules: 'tabRules' } as const;

/** Pilihan mata pelajaran: tandai mapel berbasis pilihan, catat pilihan murid, lihat peringatan, kelola aturan sekolah. */
export function SubjectChoicesView() {
  const t = useTranslations('subjectChoices');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const allowed = can('class:read');
  const canRules = can('subject_choice:manage');

  const presetClass = useSearchParams().get('classId') ?? '';
  const [tab, setTab] = useState<Tab>('choices');
  const [yearChoice, setYearChoice] = useState('');
  const [classChoice, setClassChoice] = useState(presetClass);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearList = years.data ?? [];
  const yearId =
    yearList.find((y) => y.id === yearChoice)?.id ??
    yearList.find((y) => y.isActive)?.id ??
    yearList[0]?.id ??
    '';

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: allowed && !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const classList = classes.data ?? [];
  const classId = classList.find((c) => c.id === classChoice)?.id ?? classList[0]?.id ?? '';

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={ListChecks}
          tone={MODULE_TONE.academic}
          title={t('title')}
          description={t('subtitle')}
        />
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  const tabs: Tab[] = canRules ? ['choices', 'subjects', 'rules'] : ['choices', 'subjects'];
  const current: Tab = tabs.includes(tab) ? tab : 'choices';

  return (
    <PageBody>
      <PageHeader
        icon={ListChecks}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
      />

      {years.isPending && <ListSkeleton rows={2} stats={0} />}
      {years.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(years.error))}</AlertDescription>
        </Alert>
      )}
      {years.data && yearList.length === 0 && (
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

      {years.data && yearList.length > 0 && (
        <>
          <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="sc-year">{t('year')}</Label>
              <SelectField
                id="sc-year"
                className={TOUCH_SELECT}
                value={yearId}
                onChange={(e) => {
                  setYearChoice(e.target.value);
                  setClassChoice('');
                }}
              >
                {yearList.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="sc-class">{t('class')}</Label>
              <SelectField
                id="sc-class"
                className={TOUCH_SELECT}
                value={classId}
                disabled={classList.length === 0}
                onChange={(e) => setClassChoice(e.target.value)}
              >
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <div
            role="tablist"
            aria-label={t('tabsLabel')}
            className={cn(
              'bg-muted grid w-full gap-0.5 rounded-xl p-0.5 lg:flex lg:w-fit',
              tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
            )}
          >
            {tabs.map((k) => {
              const Icon = TAB_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`sc-tab-${k}`}
                  aria-selected={current === k}
                  aria-controls={`sc-panel-${k}`}
                  onClick={() => setTab(k)}
                  className={cn(
                    'focus-visible:ring-ring/60 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-center text-sm font-medium outline-none transition-colors focus-visible:ring-2 lg:min-h-0 lg:px-3 lg:whitespace-nowrap',
                    current === k
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-4 max-sm:hidden" />
                  {t(TAB_LABEL[k])}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`sc-panel-${current}`}
            aria-labelledby={`sc-tab-${current}`}
            className="grid gap-4"
          >
            {current === 'rules' ? (
              <RulesPanel yearId={yearId} />
            ) : classes.isPending ? (
              <ListSkeleton rows={3} stats={0} />
            ) : classId === '' ? (
              <EmptyPanel
                icon={School}
                tone={MODULE_TONE.academic}
                title={t('noClasses')}
                body={t('noClassesBody')}
              />
            ) : current === 'subjects' ? (
              <ParticipationPanel key={classId} classId={classId} />
            ) : (
              <ChoicesPanel key={classId} classId={classId} onGoSubjects={() => setTab('subjects')} />
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
