'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { ToneBadge } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  authorName: string;
  authorSide: 'school' | 'platform';
  body: string;
  createdAt: string;
  /** Catatan khusus staf (hanya ada di konsol platform). */
  internal?: boolean;
}

/**
 * Percakapan bergaya obrolan. Pesan dari sisi pembaca rata kanan, sisi lawan rata kiri; catatan internal diberi
 * bingkai putus-putus berwarna kuning agar tidak tertukar dengan balasan publik.
 */
export function ChatThread({
  messages,
  viewerSide,
}: {
  messages: ChatMessage[];
  viewerSide: 'school' | 'platform';
}) {
  const t = useTranslations('support.thread');
  const ti = useTranslations('platformSupport.detail');
  const format = useFormatter();
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <ol className="grid gap-3" aria-label={t('conversation')}>
      {messages.map((m) => {
        const mine = m.authorSide === viewerSide;
        const team = m.authorSide === 'platform';
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'grid max-w-[min(100%,40rem)] min-w-0 gap-1.5 rounded-2xl border px-4 py-3',
                m.internal
                  ? 'border-amber-500/60 border-dashed bg-amber-500/10'
                  : mine
                    ? 'bg-primary/10 border-primary/20'
                    : 'bg-card',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-semibold">
                  {viewerSide === 'school' && mine ? t('you') : m.authorName}
                </span>
                {team && viewerSide === 'school' && <ToneBadge tone="teal">{t('team')}</ToneBadge>}
                {m.internal && (
                  <ToneBadge tone="amber" dot={false}>
                    {ti('internalBadge')}
                  </ToneBadge>
                )}
                <time dateTime={m.createdAt} className="text-muted-foreground">
                  {when(m.createdAt)}
                </time>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
