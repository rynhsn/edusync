'use client';

import { BookHeart, ChevronRight, Coins, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatRupiah } from '@/lib/money';
import type { PortalMe } from '@/lib/portal-api';
import { AnnouncementsList } from './announcements-list';
import { attendanceTone, dayPart } from './logic';
import { useOverview, usePortalMe } from './queries';
import { CardsSkeleton, ChildAvatar, EmptyState, Ring } from './ui-bits';

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: 'alert' | 'ok';
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-xl px-3 py-2">
      <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold ${tone === 'alert' ? 'text-destructive' : tone === 'ok' ? 'text-chart-5' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Kartu ringkas satu anak: kehadiran, tunggakan, nilai terbaru, tahfidz. */
function ChildCard({ child }: { child: PortalMe['children'][number] }) {
  const t = useTranslations('portal');
  const overview = useOverview(child.id);
  const o = overview.data;
  const pct = o?.attendance.available ? o.attendance.percent : null;
  const score = o?.grades.recentScores[0];
  const outstanding = o?.invoices.outstandingTotal ?? 0;

  return (
    <Link
      href={`/portal/children/${child.id}`}
      className="group bg-card hover:border-primary/40 focus-visible:ring-ring/50 relative grid gap-4 overflow-hidden rounded-3xl border p-4 shadow-xs transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span
        aria-hidden
        className="bg-primary/5 pointer-events-none absolute -top-10 -right-10 size-32 rounded-full"
      />
      <div className="flex items-center gap-3">
        <ChildAvatar name={child.name} />
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-lg leading-tight font-semibold">{child.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {[child.className, child.nis].filter(Boolean).join(' · ') || t('noClass')}
          </p>
        </div>
        <Ring
          percentage={pct}
          tone={attendanceTone(pct)}
          label={pct === null ? t('attendanceNoData') : t('attendanceAria', { percent: Math.round(pct) })}
        />
      </div>

      {overview.isPending ? (
        <div className="grid grid-cols-3 gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-muted/60 h-12 animate-pulse rounded-xl motion-reduce:animate-none" />
          ))}
        </div>
      ) : overview.isError ? (
        <p className="text-muted-foreground text-sm">{t('overviewError')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat
            icon={Coins}
            label={t('arrears')}
            value={outstanding > 0 ? formatRupiah(outstanding) : t('arrearsNone')}
            tone={outstanding > 0 ? 'alert' : 'ok'}
          />
          <Stat
            icon={Star}
            label={t('latestGrade')}
            value={score ? `${Math.round((score.value / score.maxScore) * 100)} · ${score.subject}` : '–'}
          />
          <Stat
            icon={BookHeart}
            label={t('tahfidz')}
            value={o?.tahfidz.available ? t('ayahs', { count: o.tahfidz.ayahs }) : '–'}
          />
        </div>
      )}

      <span className="text-primary flex items-center justify-end gap-0.5 text-sm font-medium">
        {t('openChild')}
        <ChevronRight
          className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </Link>
  );
}

export function PortalHome() {
  const t = useTranslations('portal');
  const { userName, school } = useSchool();
  const me = usePortalMe();
  const news = useOverview(me.data?.children[0]?.id);
  const first = userName.trim().split(/\s+/)[0] ?? userName;

  return (
    <div className="mx-auto grid w-full max-w-3xl content-start gap-6 pb-6">
      <section className="from-primary/12 via-accent to-chart-2/15 relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 sm:p-7">
        <svg
          aria-hidden
          viewBox="0 0 200 120"
          className="text-primary/15 pointer-events-none absolute -right-6 -bottom-4 h-36 w-auto"
          fill="currentColor"
        >
          <circle cx="150" cy="40" r="34" />
          <circle cx="170" cy="86" r="18" />
          <path d="M20 112c20-30 44-42 74-42s56 12 76 42Z" />
        </svg>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Sparkles className="text-chart-2 size-4" aria-hidden /> {school.schoolName}
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t(`greeting.${dayPart()}`, { name: first })}
        </h1>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">{t('heroSub')}</p>
      </section>

      <section className="grid gap-3" aria-labelledby="portal-children">
        <h2 id="portal-children" className="font-heading text-lg font-semibold">
          {me.data?.kind === 'student' ? t('myProfile') : t('childrenTitle')}
        </h2>
        {me.isPending && <CardsSkeleton />}
        {me.isError && (
          <EmptyState
            title={
              me.error instanceof ApiError && me.error.status === 403
                ? t('notLinkedTitle')
                : t('loadErrorTitle')
            }
            body={
              me.error instanceof ApiError && me.error.status === 403
                ? t('notLinkedBody')
                : t('loadErrorBody')
            }
            action={
              <Button variant="outline" size="sm" onClick={() => me.refetch()}>
                {t('retry')}
              </Button>
            }
          />
        )}
        {me.data && !me.data.linked && <EmptyState title={t('notLinkedTitle')} body={t('notLinkedBody')} />}
        {me.data?.linked && me.data.children.length === 0 && (
          <EmptyState title={t('noChildrenTitle')} body={t('noChildrenBody')} />
        )}
        <div className="grid gap-4">
          {me.data?.children.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="portal-news">
        <h2 id="portal-news" className="font-heading text-lg font-semibold">
          {t('announcementsTitle')}
        </h2>
        <AnnouncementsList items={news.data?.announcements.items ?? []} />
      </section>
    </div>
  );
}
