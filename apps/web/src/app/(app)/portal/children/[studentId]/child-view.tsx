'use client';

import { Award, BookHeart, CalendarCheck, ChevronLeft, Megaphone, Receipt, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { AnnouncementsList } from '../../announcements-list';
import { useOverview, usePortalMe } from '../../queries';
import { ChildAvatar, EmptyState } from '../../ui-bits';
import { AttendanceTab } from './attendance-tab';
import { GradesTab } from './grades-tab';
import { InvoicesTab } from './invoices-tab';
import { ReportsTab } from './reports-tab';
import { TahfidzTab } from './tahfidz-tab';

const TABS = [
  { key: 'attendance', icon: CalendarCheck },
  { key: 'grades', icon: Award },
  { key: 'invoices', icon: Receipt },
  { key: 'reports', icon: ScrollText },
  { key: 'tahfidz', icon: BookHeart },
  { key: 'news', icon: Megaphone },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

export function ChildView({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabKey = isTab(tabParam) ? tabParam : 'attendance';
  const me = usePortalMe();
  const overview = useOverview(studentId);
  const child = me.data?.children.find((c) => c.id === studentId) ?? overview.data?.child;

  const go = (key: TabKey) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  // Anak yang bukan milik akun ini: daftar anak sudah dimuat tetapi tidak memuat id tersebut.
  if (me.data && !child) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState
          title={t('childNotFoundTitle')}
          body={t('childNotFoundBody')}
          action={
            <Link
              href="/portal"
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('backHome')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl content-start gap-5 pb-24 md:pb-6">
      <Link
        href="/portal"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> {t('backHome')}
      </Link>

      <header className="flex items-center gap-3">
        {child ? (
          <ChildAvatar name={child.name} className="size-14 text-lg" />
        ) : (
          <span className="bg-muted size-14 animate-pulse rounded-2xl motion-reduce:animate-none" />
        )}
        <div className="min-w-0">
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">
            {child?.name ?? '…'}
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {child ? [child.className, child.nis].filter(Boolean).join(' · ') || t('noClass') : ''}
          </p>
        </div>
      </header>

      {/* Tab atas untuk layar lebar */}
      <div
        role="tablist"
        aria-label={t('sections')}
        className="bg-muted hidden gap-1 rounded-2xl p-1 md:flex"
      >
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls="portal-panel"
            onClick={() => go(key)}
            className={cn(
              'focus-visible:ring-ring/50 flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
              tab === key
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden /> {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div
        id="portal-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        key={tab}
        className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
      >
        {tab === 'attendance' && <AttendanceTab studentId={studentId} />}
        {tab === 'grades' && <GradesTab studentId={studentId} />}
        {tab === 'invoices' && <InvoicesTab studentId={studentId} />}
        {tab === 'reports' && <ReportsTab studentId={studentId} />}
        {tab === 'tahfidz' && <TahfidzTab studentId={studentId} />}
        {tab === 'news' && <AnnouncementsList items={overview.data?.announcements.items ?? []} />}
      </div>

      {/* Navigasi bawah untuk ponsel */}
      <nav
        aria-label={t('sections')}
        className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-6">
          {TABS.map(({ key, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => go(key)}
                className={cn(
                  'focus-visible:ring-ring/50 flex w-full flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  tab === key ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors motion-reduce:transition-none',
                    tab === key && 'bg-primary/12',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="max-w-full truncate">{t(`tabs.${key}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
