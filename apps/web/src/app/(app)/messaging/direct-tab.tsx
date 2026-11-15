'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BatchHistory } from './batch-history';
import { DirectPanel } from './direct-panel';
import { useMessagingCtx } from './shared';

type View = 'compose' | 'batches';

/** Tab "Pesan langsung": kirim ke penerima terpilih (izin message:send) dan riwayat batch (message:read). */
export function DirectTab() {
  const t = useTranslations('messaging.direct');
  const { canSend } = useMessagingCtx();
  const [view, setView] = useState<View>(canSend ? 'compose' : 'batches');
  const views: View[] = canSend ? ['compose', 'batches'] : ['batches'];
  return (
    <div className="grid gap-4">
      {!canSend && (
        <Alert>
          <AlertDescription>{t('readOnlyNote')}</AlertDescription>
        </Alert>
      )}
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        {views.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={view === k ? 'secondary' : 'ghost'}
            aria-pressed={view === k}
            className="min-h-11 md:min-h-8"
            onClick={() => setView(k)}
          >
            {t(`view.${k}`)}
          </Button>
        ))}
      </div>
      {view === 'compose' && canSend ? <DirectPanel onSent={() => setView('batches')} /> : <BatchHistory />}
    </div>
  );
}
