'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { TahfidzBanner } from '../shared';
import { EntriesPanel } from './entries-panel';
import { MembersPanel } from './members-panel';
import { ProgressPanel } from './progress-panel';

const TABS = ['entries', 'progress', 'members'] as const;
type Tab = (typeof TABS)[number];

export function HalaqahDetailView({ id }: { id: string }) {
  const t = useTranslations('tahfidz');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [tab, setTab] = useState<Tab>('entries');

  // Tidak ada endpoint rinci; halaqah dicari dari daftar (semua tahun ajaran).
  const list = useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/tahfidz/halaqah', { params: { ...header, query: {} } })),
  });
  const item = list.data?.find((x) => x.id === id);

  const back = (
    <Button variant="outline" nativeButton={false} render={<Link href="/tahfidz" />}>
      <ArrowLeft className="size-4" /> {t('back')}
    </Button>
  );

  if (list.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </PageBody>
    );
  }
  if (!item) {
    return (
      <PageBody>
        <PageHeader title={t('title')} actions={back} />
        <Alert variant="destructive">
          <AlertDescription>{t('notFound')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <TahfidzBanner>
        <PageHeader
          title={item.name}
          description={[item.mentorName ?? t('noMentor'), item.scheduleNote].filter(Boolean).join(' · ')}
          actions={
            <>
              <Badge variant="secondary">{t('memberCount', { count: item.memberCount })}</Badge>
              {!item.active && <Badge variant="outline">{t('inactive')}</Badge>}
              {back}
            </>
          }
        />
      </TahfidzBanner>
      <div className="flex w-fit max-w-full flex-wrap rounded-xl border p-0.5">
        {TABS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant="ghost"
            aria-pressed={tab === k}
            className={cn(tab === k && 'bg-chart-5/15 text-foreground hover:bg-chart-5/20')}
            onClick={() => setTab(k)}
          >
            {t(`tab.${k}`)}
          </Button>
        ))}
      </div>
      {tab === 'entries' && (
        <EntriesPanel halaqahId={id} yearId={item.academicYearId} canWrite={item.canManage} />
      )}
      {tab === 'progress' && <ProgressPanel halaqahId={id} canWrite={item.canManage} />}
      {tab === 'members' && (
        <MembersPanel halaqahId={id} yearId={item.academicYearId} canWrite={item.canManage} />
      )}
    </PageBody>
  );
}
