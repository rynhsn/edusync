'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { hhmm } from '../shared';
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

  // Tidak ada endpoint rinci; ekskul dicari dari daftar (kuncinya sama dengan halaman daftar).
  const list = useQuery({
    queryKey: ['extracurriculars', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/extracurriculars', { params: header })),
  });
  const item = list.data?.find((x) => x.id === id);

  if (list.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-24 w-full" />
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
  const details = [
    item.coachName ? `${t('coach')}: ${item.coachName}` : null,
    schedule,
    item.location ? `${t('location')}: ${item.location}` : null,
  ].filter(Boolean);

  return (
    <PageBody>
      <PageHeader
        title={item.name}
        description={[...details, item.description].filter(Boolean).join(' · ')}
        actions={
          <>
            <Badge variant="outline">{t(`category.${item.category}`)}</Badge>
            <Badge variant={item.active ? 'secondary' : 'outline'}>
              {item.active ? t('active') : t('inactive')}
            </Badge>
            <Button variant="outline" nativeButton={false} render={<Link href="/extracurriculars" />}>
              ← {t('back')}
            </Button>
          </>
        }
      />
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        {TABS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? 'secondary' : 'ghost'}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {t(`tab.${k}`)}
          </Button>
        ))}
      </div>
      {tab === 'members' && <MembersPanel id={id} canWrite={item.canManage} />}
      {tab === 'sessions' && <SessionsPanel id={id} canWrite={item.canManage} />}
      {tab === 'assessment' && <AssessmentPanel id={id} canWrite={item.canManage} />}
      {tab === 'report' && <ReportPanel id={id} />}
    </PageBody>
  );
}
