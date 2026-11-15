'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConnectionPanel } from './connection-panel';
import { DirectTab } from './direct-tab';
import { HistoryPanel } from './history-panel';
import { hasLetterHandoff } from './letter-handoff';
import { OptOutPanel } from './optout-panel';
import { SettingsPanel } from './settings-panel';

type Tab = 'connection' | 'settings' | 'history' | 'direct' | 'optout';

export function MessagingView() {
  const t = useTranslations('messaging');
  const { can } = useSchool();
  const [tab, setTab] = useState<Tab>('connection');

  // Datang dari tombol "Kirim lewat WhatsApp" di halaman surat: langsung ke pesan langsung.
  useEffect(() => {
    if (hasLetterHandoff()) setTab('direct');
  }, []);

  if (!can('message:read')) {
    return (
      <PageBody>
        <PageHeader title={t('title')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  const readOnly = !can('message:manage');
  const tabs: Tab[] = [
    'connection',
    'settings',
    'direct',
    'history',
    ...(readOnly ? [] : (['optout'] as const)),
  ];
  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={readOnly ? `${t('subtitle')} ${t('readOnly')}` : t('subtitle')}
      />
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        {tabs.map((k) => (
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
      {tab === 'connection' && <ConnectionPanel />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'direct' && <DirectTab />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'optout' && <OptOutPanel />}
    </PageBody>
  );
}
