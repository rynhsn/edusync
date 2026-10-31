'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ClipboardCheck, FileBarChart, MapPin, UserRound, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { categoryMeta, hhmm } from '../shared';
import { useExtracurricularCategories } from '../use-categories';
import { AssessmentPanel } from './assessment-panel';
import { MembersPanel } from './members-panel';
import { ReportPanel } from './report-panel';
import { SessionsPanel } from './sessions-panel';

const TABS = ['members', 'sessions', 'assessment', 'report'] as const;
type Tab = (typeof TABS)[number];

export function ExtracurricularDetailView({ id }: { id: string }) {
  const t = useTranslations('extracurricular');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [tab, setTab] = useState<Tab>('members');
  const categories = useExtracurricularCategories();

  // Tidak ada endpoint rinci; ekskul dicari dari daftar (kuncinya sama dengan halaman daftar).
  const list = useQuery({
    queryKey: ['extracurriculars', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/extracurriculars', { params: header })),
  });
  const item = list.data?.find((x) => x.id === id);

  if (list.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 4).map((k) => (
            <Skeleton key={k} className="h-24 rounded-2xl" />
          ))}
        </div>
      </PageBody>
    );
  }
  if (!item) {
    return (
      <PageBody>
        <PageHeader
          title={t('title')}
          actions={
            <Button variant="outline" nativeButton={false} render={<Link href="/extracurriculars" />}>
              ← {t('back')}
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription>{t('notFound')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const schedule = item.weekday
    ? `${t(`weekdays.${String(item.weekday) as '1'}`)}${
        item.startsAt ? ` ${hhmm(item.startsAt)}${item.endsAt ? `–${hhmm(item.endsAt)}` : ''}` : ''
      }`
    : t('noSchedule');
  const meta = categoryMeta(categories.data, item.category);
  const TAB_ICONS = {
    members: Users,
    sessions: CalendarClock,
    assessment: ClipboardCheck,
    report: FileBarChart,
  } as const;

  return (
    <PageBody>
      <PageHeader
        icon={meta.icon}
        tone={meta.tone}
        title={item.name}
        description={item.description ?? undefined}
        actions={
          <>
            <ToneBadge tone={meta.tone} dot={false}>
              {meta.label}
            </ToneBadge>
            <ToneBadge tone={item.active ? 'emerald' : 'slate'}>
              {item.active ? t('active') : t('inactive')}
            </ToneBadge>
            <Button variant="outline" nativeButton={false} render={<Link href="/extracurriculars" />}>
              ← {t('back')}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 lg:grid-cols-4">
        <StatCard icon={Users} tone={meta.tone} label={t('membersCount')} value={item.memberCount} />
        <StatCard
          icon={UserRound}
          tone="sky"
          label={t('coach')}
          value={<span className="text-base">{item.coachName ?? item.externalCoach ?? '-'}</span>}
        />
        <StatCard
          icon={CalendarClock}
          tone="amber"
          label={t('schedule')}
          value={<span className="text-base">{schedule}</span>}
        />
        <StatCard
          icon={MapPin}
          tone="emerald"
          label={t('location')}
          value={<span className="text-base">{item.location ?? '-'}</span>}
        />
      </div>
      <div role="tablist" className="bg-muted flex w-full gap-0.5 overflow-x-auto rounded-xl p-0.5 sm:w-fit">
        {TABS.map((k) => {
          const Icon = TAB_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'focus-visible:ring-ring/60 inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2',
                tab === k
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(`tab.${k}`)}
            </button>
          );
        })}
      </div>
      {tab === 'members' && <MembersPanel id={id} canWrite={item.canManage} />}
      {tab === 'sessions' && <SessionsPanel id={id} canWrite={item.canManage} />}
      {tab === 'assessment' && <AssessmentPanel id={id} canWrite={item.canManage} />}
      {tab === 'report' && <ReportPanel id={id} />}
    </PageBody>
  );
}
