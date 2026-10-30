'use client';

import { CalendarDays, Pin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import type { AnnouncementCategory } from '@/lib/announcements';
import { accentVars, paragraphs } from '@/lib/announcements';
import { formatCalendarDate } from '@/lib/format-date';
import '../../site/site.css';

export interface PreviewData {
  title: string;
  body: string;
  category: AnnouncementCategory;
  eventDate: string;
  pinned: boolean;
  expires: string;
}

/**
 * Pratinjau pengumuman seperti halaman detail di situs publik (memakai gaya yang sama, warna aksen sekolah).
 * Murni tampilan: tidak memanggil API.
 */
export function AnnouncementPreview({ data, accent }: { data: PreviewData; accent?: string | null }) {
  const t = useTranslations('announcements');
  const locale = useLocale() as Locale;
  const paras = paragraphs(data.body);
  return (
    <div
      className="site-root bg-background overflow-hidden rounded-2xl border shadow-sm"
      style={accentVars(accent ?? null)}
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="site-chip" data-cat={data.category}>
            {t(`category.${data.category}`)}
          </span>
          {data.pinned && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
              <Pin className="size-3.5" aria-hidden /> {t('pinnedBadge')}
            </span>
          )}
        </div>
        <h3 className="font-heading text-2xl font-bold tracking-tight text-balance">
          {data.title.trim() || <span className="text-muted-foreground">{t('previewUntitled')}</span>}
        </h3>
        {data.category === 'agenda' && data.eventDate && (
          <div className="site-card site-feature flex items-center gap-3 p-3">
            <CalendarDays className="size-6 shrink-0 text-[var(--sa-text)]" aria-hidden />
            <p className="font-heading font-semibold">
              {t('eventOn', { date: formatCalendarDate(locale, data.eventDate) })}
            </p>
          </div>
        )}
        <div className="site-prose text-base">
          {paras.length > 0 ? (
            paras.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: pratinjau paragraf statis
              <p key={i}>{p}</p>
            ))
          ) : (
            <p className="text-muted-foreground">{t('previewBodyEmpty')}</p>
          )}
        </div>
        {data.expires && (
          <p className="text-muted-foreground text-xs">
            {t('expiresOn', { date: formatCalendarDate(locale, data.expires) })}
          </p>
        )}
      </div>
    </div>
  );
}
