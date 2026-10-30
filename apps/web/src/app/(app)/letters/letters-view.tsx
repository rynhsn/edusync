'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FilePlus2, Inbox, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { IncomingDialog } from './incoming-dialog';
import {
  type Direction,
  EnvelopeArt,
  type LetterStatus,
  STATUS_LABEL,
  StatusBadge,
  useHeader,
} from './shared';
import './letters.css';

const PAGE = 25;
const STATUSES: LetterStatus[] = ['draft', 'signed', 'revoked'];

/** Daftar surat dengan dua tampilan: surat keluar dan surat masuk. */
export function LettersView() {
  const t = useTranslations('letters');
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const { header } = useHeader();
  const manage = can('letter:manage');

  const [direction, setDirection] = useState<Direction>('outgoing');
  const [status, setStatus] = useState<LetterStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const baseQuery = {
    direction,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(debounced ? { q: debounced } : {}),
  };
  const list = useQuery({
    queryKey: ['letters', school.schoolId, 'list', baseQuery, status, page],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/letters', {
          params: {
            header,
            query: { ...baseQuery, ...(status ? { status } : {}), limit: PAGE, offset: page * PAGE },
          },
        }),
      ),
  });

  // Hitungan per status untuk chip penyaring (permintaan kecil: hanya total).
  const counts = useQuery({
    queryKey: ['letters', school.schoolId, 'counts', baseQuery],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const one = async (s?: LetterStatus) =>
        unwrap(
          await api.GET('/v1/letters', {
            params: { header, query: { ...baseQuery, ...(s ? { status: s } : {}), limit: 1 } },
          }),
        ).total;
      const [all, draft, signed, revoked] = await Promise.all([
        one(),
        one('draft'),
        one('signed'),
        one('revoked'),
      ]);
      return { all, draft, signed, revoked };
    },
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const incoming = direction === 'incoming';
  const filtered = !!(status || from || to || debounced);

  function changeDirection(d: Direction) {
    setDirection(d);
    setStatus('');
    setPage(0);
  }

  return (
    <PageBody className="lt-scope">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          manage &&
          (incoming ? (
            <Button onClick={() => setRecording(true)}>
              <Inbox className="size-4" /> {t('recordIncoming')}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link href="/letters/new" />}>
              <FilePlus2 className="size-4" /> {t('newOutgoing')}
            </Button>
          ))
        }
      />

      {/* Tab arah surat */}
      <div
        role="tablist"
        aria-label={t('title')}
        className="bg-muted inline-flex w-fit max-w-full gap-1 rounded-xl p-1"
      >
        {(['outgoing', 'incoming'] as const).map((d) => {
          const Icon = d === 'outgoing' ? Send : Inbox;
          const active = direction === d;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeDirection(d)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'bg-card text-[var(--lt-ink)] shadow-sm ring-1 ring-[color-mix(in_oklab,var(--lt-ink)_25%,transparent)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(d === 'outgoing' ? 'tabOutgoing' : 'tabIncoming')}
            </button>
          );
        })}
      </div>

      <Card className="gap-4 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              className="pl-8"
              aria-label={t('search')}
              placeholder={t('searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="w-44">
            <DatePicker
              aria-label={t('from')}
              placeholder={t('from')}
              value={from}
              clearable
              onChange={(v) => {
                setFrom(v);
                setPage(0);
              }}
            />
          </div>
          <div className="w-44">
            <DatePicker
              aria-label={t('to')}
              placeholder={t('to')}
              value={to}
              clearable
              onChange={(v) => {
                setTo(v);
                setPage(0);
              }}
            />
          </div>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0" aria-label={t('statusFilter')}>
          {(['', ...STATUSES] as const).map((s) => {
            const n = counts.data ? counts.data[s === '' ? 'all' : s] : null;
            const active = status === s;
            return (
              <button
                key={s || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStatus(s);
                  setPage(0);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  active
                    ? 'border-[var(--lt-ink)] bg-[var(--lt-ink-soft)] text-[var(--lt-ink)]'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {s === '' ? t('statusAll') : t(STATUS_LABEL[s])}
                {n !== null && <span className="tabular-nums opacity-70">{n}</span>}
              </button>
            );
          })}
        </fieldset>

        {list.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        )}

        {list.isPending && <Skeleton className="h-48 w-full" />}

        {list.data && list.data.items.length === 0 && (
          <div className="lt-fade-up grid place-items-center gap-3 px-4 py-12 text-center">
            <EnvelopeArt className="w-36" />
            <p className="font-heading text-lg font-medium">
              {filtered ? t('emptyFiltered') : incoming ? t('emptyIncomingTitle') : t('emptyOutgoingTitle')}
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {filtered ? t('emptyFilteredBody') : incoming ? t('emptyIncomingBody') : t('emptyOutgoingBody')}
            </p>
            {manage &&
              !filtered &&
              (incoming ? (
                <Button onClick={() => setRecording(true)}>
                  <Inbox className="size-4" /> {t('recordIncoming')}
                </Button>
              ) : (
                <Button nativeButton={false} render={<Link href="/letters/new" />}>
                  <FilePlus2 className="size-4" /> {t('newOutgoing')}
                </Button>
              ))}
          </div>
        )}

        {list.data && list.data.items.length > 0 && (
          <div className="-mx-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('number')}</TableHead>
                  <TableHead>{t('subject')}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {incoming ? t('sender') : t('recipient')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">{t('date')}</TableHead>
                  <TableHead className="pr-4">{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((l) => (
                  <TableRow key={l.id} className="group">
                    <TableCell className="pl-4 font-mono text-xs whitespace-nowrap">{l.number}</TableCell>
                    <TableCell className="max-w-[16rem] min-w-0">
                      <Link
                        href={`/letters/${l.id}`}
                        className="font-medium underline-offset-4 outline-none group-hover:text-[var(--lt-ink)] hover:underline focus-visible:underline"
                      >
                        {l.subject}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-[14rem] truncate md:table-cell">
                      {l.party}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                      {formatCalendarDate(locale, l.letterDate)}
                    </TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t('pageOf', { page: page + 1, pages })}</span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label={t('prev')}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label={t('next')}
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {manage && <IncomingDialog open={recording} onOpenChange={setRecording} />}
    </PageBody>
  );
}
