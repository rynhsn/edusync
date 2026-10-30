'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Megaphone, Pin } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { excerpt, isoDay } from '@/lib/announcements';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';

/** Pengumuman terbaru untuk staf (umpan /v1/announcements/feed); tidak tampil bila tak punya izin atau modulnya mati. */
export function AnnouncementsWidget() {
  const { school, can, hasModule } = useSchool();
  if (!can('announcement:read') || !hasModule('announcements')) return null;
  return <Widget schoolId={school.schoolId} manage={can('announcement:manage')} />;
}

function Widget({ schoolId, manage }: { schoolId: string; manage: boolean }) {
  const t = useTranslations('announcements');
  const locale = useLocale() as Locale;
  const feed = useQuery({
    queryKey: ['announcements-feed', schoolId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/announcements/feed', {
          params: { header: schoolHeader(schoolId), query: { limit: 4 } },
        }),
      ),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading flex items-center gap-2 text-lg">
          <span className="bg-accent text-accent-foreground grid size-8 place-items-center rounded-lg">
            <Megaphone className="size-4" aria-hidden />
          </span>
          {t('feedTitle')}
        </CardTitle>
        <Link
          href="/announcements"
          className="text-primary focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-3"
        >
          {manage ? t('feedManage') : t('feedAll')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {feed.isPending && <Skeleton className="h-20 w-full" />}
        {feed.isError && <p className="text-muted-foreground text-sm">{t('feedLoadError')}</p>}
        {feed.data && feed.data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('feedEmpty')}</p>
        )}
        {feed.data && feed.data.items.length > 0 && (
          <ul className="divide-y">
            {feed.data.items.map((a) => (
              <li key={a.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                >
                  {a.category === 'agenda' ? (
                    <CalendarDays className="size-4" />
                  ) : (
                    <Megaphone className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-heading flex items-center gap-1.5 text-sm font-semibold">
                    {a.pinned && (
                      <Pin className="text-primary size-3.5 shrink-0" aria-label={t('pinnedBadge')} />
                    )}
                    <span className="truncate">{a.title}</span>
                  </p>
                  <p className="text-muted-foreground line-clamp-1 text-xs">{excerpt(a.body, 120)}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {a.eventDate
                      ? t('eventOn', { date: formatCalendarDate(locale, a.eventDate) })
                      : a.publishedAt
                        ? t('publishedOn', { date: formatCalendarDate(locale, isoDay(a.publishedAt)) })
                        : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
