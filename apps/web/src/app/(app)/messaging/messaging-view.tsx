'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConnectionPanel } from './connection-panel';
import { HistoryPanel } from './history-panel';
import { SettingsPanel } from './settings-panel';

type Tab = 'connection' | 'settings' | 'history';
const TABS: Tab[] = ['connection', 'settings', 'history'];

export function MessagingView() {
  const t = useTranslations('messaging');
  const { can } = useSchool();
  const [tab, setTab] = useState<Tab>('connection');

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
  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={readOnly ? `${t('subtitle')} ${t('readOnly')}` : t('subtitle')}
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
      {tab === 'connection' && <ConnectionPanel />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'history' && <HistoryPanel />}
    </PageBody>
  );
}
