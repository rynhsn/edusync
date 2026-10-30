'use client';

import { CalendarDays, Megaphone, Newspaper, Pin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import type { PortalAnnouncement } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { EmptyState } from './ui-bits';

const ICONS = { news: Newspaper, agenda: CalendarDays, notice: Megaphone } as const;
const TINT = {
  news: 'bg-chart-1/15 text-chart-1',
  agenda: 'bg-chart-2/20 text-foreground',
  notice: 'bg-chart-3/15 text-chart-3',
} as const;

function Item({ a }: { a: PortalAnnouncement }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const Icon = ICONS[a.category];
  const date = a.category === 'agenda' ? a.eventDate : a.publishedAt;
  return (
    <li className="bg-card rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TINT[a.category])}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="text-muted-foreground font-medium tracking-wide uppercase">
              {t(`category.${a.category}`)}
            </span>
            {a.pinned && (
              <span className="text-primary inline-flex items-center gap-1 font-medium">
                <Pin className="size-3" aria-hidden /> {t('pinned')}
              </span>
            )}
            {date && (
              <span className="text-muted-foreground">{formatCalendarDate(locale, date.slice(0, 10))}</span>
            )}
          </div>
          <p className="font-heading mt-0.5 font-semibold">{a.title}</p>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">{a.excerpt}</p>
        </div>
      </div>
    </li>
  );
}

/** Daftar pengumuman sekolah untuk portal (dari ikhtisar anak). */
export function AnnouncementsList({ items }: { items: PortalAnnouncement[] }) {
  const t = useTranslations('portal');
  if (items.length === 0)
    return <EmptyState title={t('announcementsEmptyTitle')} body={t('announcementsEmptyBody')} />;
  return (
    <ul className="grid gap-3">
      {items.map((a) => (
        <Item key={a.id} a={a} />
      ))}
    </ul>
  );
}
