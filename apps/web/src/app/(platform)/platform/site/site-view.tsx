'use client';

import type { SiteContent } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Globe, ImageIcon, Type } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useStaff } from '../../platform-shell';
import { QueryError } from '../platform-kit';
import { SiteContentPanel } from './site-content-panel';
import { SiteImagesPanel } from './site-images-panel';

type Tab = 'images' | 'content';

/** Situs Edusync: ikon, gambar, dan isi halaman utama yang bisa diubah staf platform tanpa menyentuh kode. */
export function SiteView() {
  const t = useTranslations('platformSite');
  const { role } = useStaff();
  const canEdit = role === 'admin';
  const [tab, setTab] = useState<Tab>('images');

  const site = useQuery({
    queryKey: ['platform-site'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/site')),
  });

  const tabs = [
    { key: 'images', icon: ImageIcon, label: t('tabImages') },
    { key: 'content', icon: Type, label: t('tabContent') },
  ] as const;

  return (
    <PageBody>
      <PageHeader
        icon={Globe}
        tone="violet"
        title={t('title')}
        description={canEdit ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          <a
            href="/site-preview"
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ExternalLink className="size-4" aria-hidden /> {t('preview')}
          </a>
        }
      />
      <p className="text-muted-foreground -mt-3 text-xs">{t('previewHint')}</p>

      <div
        role="tablist"
        aria-label={t('title')}
        className="bg-muted inline-flex w-fit max-w-full gap-1 rounded-xl p-1"
      >
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === key
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {site.isPending ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !site.data ? (
        <QueryError error={site.error} onRetry={() => site.refetch()} />
      ) : tab === 'images' ? (
        <SiteImagesPanel assets={site.data.assets} canEdit={canEdit} />
      ) : (
        <SiteContentPanel
          saved={site.data.content as SiteContent}
          customized={site.data.customized}
          canEdit={canEdit}
        />
      )}
    </PageBody>
  );
}
