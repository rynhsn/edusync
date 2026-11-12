'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, GitBranch, NotebookPen, ShieldCheck, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { FlowsPanel } from './flows-panel';
import { OutcomesPanel } from './outcomes-panel';

const TABS = ['outcomes', 'flows'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS = { outcomes: Target, flows: GitBranch } as const;
const TAB_LABEL = { outcomes: 'tabOutcomes', flows: 'tabFlows' } as const;

/**
 * Perangkat ajar saya: capaian dan tujuan pembelajaran (CP/TP) serta alur tujuan pembelajaran (ATP) per mapel.
 * Guru memilih dari mapel yang ia ampu; pengelola kurikulum dari semua mapel.
 */
export function TeachingPlanView() {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const allowed = can('subject:read');
  const canWrite = can('teaching_plan:write');
  const manager = can('curriculum:manage');

  const [tab, setTab] = useState<Tab>('outcomes');
  const [subjectChoice, setSubjectChoice] = useState('');

  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  // Guru (tanpa curriculum:manage) hanya melihat mapel yang ia ampu bila datanya tersedia; bila tidak (mis. modul
  // nilai dimatikan) semua mapel tampil dan server tetap menolak penulisan pada mapel yang bukan miliknya.
  const mine = useQuery({
    queryKey: ['grading-my-assignments', school.schoolId],
    enabled: allowed && !manager && can('grade:read'),
    retry: false,
    queryFn: async () => unwrap(await api.GET('/v1/grading/my-assignments', { params: header })),
  });

  const restrictedToMine = !manager && !!mine.data && !mine.data.all;
  const mySubjectIds = new Set(mine.data?.items.map((a) => a.subjectId) ?? []);
  const subjectList = (subjects.data ?? []).filter(
    (s) => s.active !== false && (!restrictedToMine || mySubjectIds.has(s.id)),
  );
  const subjectId = subjectList.some((s) => s.id === subjectChoice)
    ? subjectChoice
    : (subjectList[0]?.id ?? '');
  const subject = subjectList.find((s) => s.id === subjectId);
  const waiting = subjects.isPending || (!manager && can('grade:read') && mine.isPending);

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={NotebookPen}
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
        icon={NotebookPen}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={canWrite ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
      />

      {waiting && <ListSkeleton rows={3} stats={0} />}
      {subjects.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(subjects.error))}</AlertDescription>
        </Alert>
      )}
      {!waiting && subjects.data && subjectList.length === 0 && (
        <EmptyPanel
          icon={BookOpen}
          tone={MODULE_TONE.academic}
          title={t('noSubjects')}
          body={restrictedToMine ? t('noSubjectsTeacherBody') : t('noSubjectsBody')}
        />
      )}

      {!waiting && subject && (
        <>
          <div className="grid content-start gap-2 sm:max-w-sm">
            <Label htmlFor="tp-subject">{t('subject')}</Label>
            <SelectField
              id="tp-subject"
              className={TOUCH_SELECT}
              value={subjectId}
              onChange={(e) => setSubjectChoice(e.target.value)}
            >
              {subjectList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div
            role="tablist"
            aria-label={t('tabsLabel')}
            className="bg-muted grid w-full gap-0.5 rounded-xl p-0.5 lg:flex lg:w-fit lg:overflow-x-auto"
          >
            {TABS.map((k) => {
              const Icon = TAB_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`tp-tab-${k}`}
                  aria-selected={tab === k}
                  aria-controls={`tp-panel-${k}`}
                  onClick={() => setTab(k)}
                  className={cn(
                    'focus-visible:ring-ring/60 inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-center text-sm max-lg:min-h-11 font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2',
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

          <div
            role="tabpanel"
            id={`tp-panel-${tab}`}
            aria-labelledby={`tp-tab-${tab}`}
            className="grid gap-4"
          >
            {tab === 'outcomes' && <OutcomesPanel subjectId={subjectId} canWrite={canWrite} />}
            {tab === 'flows' && (
              <FlowsPanel
                key={subjectId}
                subjectId={subjectId}
                subjectName={`${subject.code} - ${subject.name}`}
                canWrite={canWrite}
              />
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
