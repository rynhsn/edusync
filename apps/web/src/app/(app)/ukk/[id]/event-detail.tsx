'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileBadge, Info, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { ukkKey } from '../lib';
import { PatternBadge, StatusBadge } from '../shared';
import { AssessorsPanel } from './assessors-panel';
import { DocumentsPanel } from './documents-panel';
import { ResultsPanel } from './results-panel';
import { SummaryPanel } from './summary-panel';

type Tab = 'summary' | 'assessors' | 'results' | 'documents';

/** Detail satu kegiatan UKK: ringkasan, penguji, hasil per murid, dan dokumen (nomor sertifikat/surat keterangan). */
export function EventDetail({ id }: { id: string }) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school } = useSchool();
  const [tab, setTab] = useState<Tab>('summary');

  const event = useQuery({
    queryKey: ukkKey(school.schoolId, 'event', id),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/ukk/events/{id}', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
  });

  const tabs: { key: Tab; label: string; icon: typeof Info }[] = [
    { key: 'summary', label: t('tabs.summary'), icon: Info },
    { key: 'assessors', label: t('tabs.assessors'), icon: UsersRound },
    { key: 'results', label: t('tabs.results'), icon: ClipboardList },
    { key: 'documents', label: t('tabs.documents'), icon: FileBadge },
  ];

  if (event.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-24 rounded-xl" aria-busy />
        <Skeleton className="h-64 rounded-xl" aria-busy />
      </PageBody>
    );
  }
  if (event.isError) {
    return (
      <PageBody>
        <PageHeader title={t('detailTitle')} actions={<BackLink href="/ukk" />} />
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(event.error))}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  const e = event.data;

  return (
    <PageBody>
      <PageHeader
        title={e.title}
        description={`${e.concentrationName} · ${e.semesterName}`}
        actions={<BackLink href="/ukk" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <PatternBadge pattern={e.pattern} />
        <StatusBadge status={e.status} />
      </div>

      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        className="bg-muted grid w-full grid-cols-2 gap-1 rounded-xl p-1 lg:flex lg:w-fit lg:overflow-x-auto"
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`ukk-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`ukk-panel-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-center text-sm font-medium transition-colors outline-none focus-visible:ring-3 max-lg:min-h-11 lg:shrink-0 lg:whitespace-nowrap',
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`ukk-panel-${tab}`} aria-labelledby={`ukk-tab-${tab}`}>
        {tab === 'summary' && <SummaryPanel event={e} />}
        {tab === 'assessors' && <AssessorsPanel event={e} />}
        {tab === 'results' && <ResultsPanel event={e} />}
        {tab === 'documents' && <DocumentsPanel event={e} />}
      </div>
    </PageBody>
  );
}
