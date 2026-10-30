'use client';

import { ADMISSION_TRANSITIONS, type AdmissionStatus } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Link2, Search } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StudentIllustration } from '@/app/apply/illustrations';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';
import '@/app/apply/apply.css';
import { ApplicationDetail, NoteField } from './application-detail';
import { formatDateTime, STATUS_ORDER, STATUS_STYLE, StatusChip } from './shared';

/** Peralihan sah (kontrak). Nama canTransition bentrok dengan modul PKL di ekspor kontrak, jadi dihitung dari tabelnya. */
const canMove = (from: AdmissionStatus, to: AdmissionStatus) =>
  ADMISSION_TRANSITIONS[from]?.includes(to) ?? false;

const PAGE_SIZE = 25;
const CARD_STATUSES = ['submitted', 'verified', 'accepted', 'rejected', 'enrolled'] as const;
const BULK_TARGETS = ['verified', 'accepted', 'rejected'] as const;

/** 14 batang pendaftar harian; batang terakhir (hari ini) diberi warna aksen. */
function Sparkline({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 280;
  const h = 56;
  const gap = 4;
  const bar = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-14 w-full">
      {data.map((d, i) => {
        const bh = Math.max(3, (d.count / max) * (h - 4));
        return (
          <rect
            key={d.date}
            x={i * (bar + gap)}
            y={h - bh}
            width={bar}
            height={bh}
            rx={2}
            className={i === data.length - 1 ? 'fill-[var(--ap-orange)]' : 'fill-primary/35'}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function AdmissionsView() {
  const t = useTranslations('admissions');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('admission:manage');

  const [periodId, setPeriodId] = useState('');
  const [status, setStatus] = useState<'' | AdmissionStatus>('');
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<(typeof BULK_TARGETS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setNeedle(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  // Saringan berubah: kembali ke halaman pertama dan kosongkan pilihan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu oleh nilai saringan
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [periodId, status, needle]);

  const periods = useQuery({
    queryKey: ['admissions', school.schoolId, 'periods'],
    queryFn: async () => unwrap(await api.GET('/v1/admissions/periods', { params: header })),
  });
  const stats = useQuery({
    queryKey: ['admissions', school.schoolId, 'stats', periodId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/admissions/stats', {
          params: { ...header, query: periodId ? { periodId } : {} },
        }),
      ),
  });
  const list = useQuery({
    queryKey: ['admissions', school.schoolId, 'list', periodId, status, needle, page],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/admissions/applications', {
          params: {
            ...header,
            query: {
              ...(periodId ? { periodId } : {}),
              ...(status ? { status } : {}),
              ...(needle ? { q: needle } : {}),
              limit: PAGE_SIZE,
              offset: page * PAGE_SIZE,
            },
          },
        }),
      ),
    placeholderData: (prev) => prev,
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.id));
  const selectedItems = items.filter((i) => selected.has(i.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Aksi massal hanya ditawarkan bila ada pendaftar terpilih yang peralihannya sah.
  const applicable = useMemo(
    () => BULK_TARGETS.filter((to) => selectedItems.some((i) => canMove(i.status as AdmissionStatus, to))),
    [selectedItems],
  );

  const bulkMutation = useMutation({
    mutationFn: async (to: (typeof BULK_TARGETS)[number]) =>
      unwrap(
        await api.POST('/v1/admissions/applications/bulk-status', {
          params: header,
          body: { ids: [...selected], to, note: note.trim() || null },
        }),
      ),
    onSuccess: (res) => {
      if (res.failed > 0) toast.warning(t('bulkPartial', { updated: res.updated, failed: res.failed }));
      else toast.success(t('bulkDone', { updated: res.updated }));
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['admissions', school.schoolId] });
    },
    onError: (e) => setBulkError(te(errorKey(e))),
  });

  async function exportExcel() {
    setExporting(true);
    try {
      const rows: (string | number | null)[][] = [];
      for (let offset = 0; ; offset += 200) {
        const res = unwrap(
          await api.GET('/v1/admissions/applications', {
            params: {
              ...header,
              query: {
                ...(periodId ? { periodId } : {}),
                ...(status ? { status } : {}),
                ...(needle ? { q: needle } : {}),
                limit: 200,
                offset,
              },
            },
          }),
        );
        for (const a of res.items) {
          rows.push([
            a.regNumber,
            a.fullName,
            t(`genderLabel.${a.gender}`),
            a.birthDate,
            a.previousSchool,
            a.programName,
            a.guardianName,
            a.guardianPhone,
            t(`status.${a.status}`),
            a.createdAt.slice(0, 10),
          ]);
        }
        if (res.items.length < 200) break;
      }
      if (rows.length === 0) {
        toast.info(tm('exportEmpty'));
        return;
      }
      const blob = await buildExport(
        t('exportSheet'),
        [
          t('colReg'),
          t('colName'),
          t('gender'),
          t('colBirthDate'),
          t('previousSchool'),
          t('program'),
          t('guardianName'),
          t('guardianPhone'),
          t('colStatus'),
          t('colSubmitted'),
        ],
        rows,
        { textColumns: [1, 8], widths: [18, 28, 12, 14, 26, 20, 24, 16, 14, 14] },
      );
      saveBlob(blob, `spmb-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error(tm('exportError'));
    } finally {
      setExporting(false);
    }
  }

  const counts = stats.data?.counts;
  const quota = stats.data?.quota;
  const quotaPct = quota?.total ? Math.min(100, Math.round((quota.used / quota.total) * 100)) : 0;
  const noPeriods = periods.isSuccess && periods.data.length === 0;

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            {can('admission:manage') && (
              <Link href="/admissions/periods" className={buttonVariants({ variant: 'outline' })}>
                <Link2 className="size-4" aria-hidden /> {t('linkAndPeriods')}
              </Link>
            )}
            <Button type="button" variant="outline" disabled={exporting || total === 0} onClick={exportExcel}>
              <Download className="size-4" aria-hidden /> {exporting ? tm('exporting') : tm('export')}
            </Button>
          </>
        }
      />

      {/* Statistik */}
      <section aria-label={t('statsLabel')} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {CARD_STATUSES.map((s) => {
            const on = status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setStatus(on ? '' : s)}
                className={cn(
                  'bg-card focus-visible:ring-ring/50 relative overflow-hidden rounded-xl border p-3.5 text-left transition-all outline-none hover:shadow-md focus-visible:ring-3',
                  on && 'ring-primary ring-2',
                )}
              >
                <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', STATUS_STYLE[s].bar)} />
                <span className="text-muted-foreground block text-xs font-medium">{t(`stat.${s}`)}</span>
                {stats.isPending ? (
                  <Skeleton className="mt-1.5 h-8 w-12" />
                ) : (
                  <span className="font-heading mt-0.5 block text-3xl font-semibold tabular-nums">
                    {counts?.[s] ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="bg-card rounded-xl border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold">{t('trendTitle')}</h2>
              <span className="text-muted-foreground text-xs">
                {t('totalApplicants', { count: stats.data?.total ?? 0 })}
              </span>
            </div>
            {stats.data ? (
              <Sparkline data={stats.data.perDay} label={t('trendTitle')} />
            ) : (
              <Skeleton className="mt-2 h-14 w-full" />
            )}
          </div>
          <div className="bg-card rounded-xl border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold">{t('quotaTitle')}</h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {quota ? (quota.total === null ? t('quotaUnlimited') : `${quota.used} / ${quota.total}`) : ''}
              </span>
            </div>
            {quota?.total ? (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={quotaPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('quotaTitle')}
                  className="bg-muted mt-4 h-3 overflow-hidden rounded-full"
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      quotaPct >= 100 ? 'bg-rose-500' : quotaPct >= 85 ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">{t('quotaNote', { pct: quotaPct })}</p>
              </>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">{quota ? t('quotaNone') : ''}</p>
            )}
          </div>
        </div>
      </section>

      {/* Saringan */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label={tm('search')}
            className="pl-8"
            placeholder={t('searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <SelectField
            aria-label={t('period')}
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            <option value="">{t('allPeriods')}</option>
            {periods.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-full sm:w-48">
          <SelectField
            aria-label={t('colStatus')}
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | AdmissionStatus)}
          >
            <option value="">{t('allStatuses')}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {/* Bilah aksi massal */}
      {manage && selected.size > 0 && (
        <section
          aria-label={t('bulkLabel')}
          className="bg-primary/10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 px-3 py-2"
        >
          <span className="text-sm font-medium">{t('selectedCount', { count: selected.size })}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            {BULK_TARGETS.filter((to) => applicable.includes(to)).map((to) => (
              <Button
                key={to}
                type="button"
                size="sm"
                variant={to === 'rejected' ? 'outline' : 'default'}
                className={cn(to === 'rejected' && 'text-destructive')}
                onClick={() => {
                  setNote('');
                  setBulkError(null);
                  setBulk(to);
                }}
              >
                {t(`action.${to}`)}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('clearSelection')}
            </Button>
          </span>
        </section>
      )}

      {list.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}

      {list.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kerangka pemuatan statis
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="apply-root bg-card flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <StudentIllustration className="w-36" />
          <h2 className="font-heading text-lg font-semibold">
            {noPeriods
              ? t('emptyNoPeriodTitle')
              : needle || status || periodId
                ? t('emptyFilteredTitle')
                : t('emptyTitle')}
          </h2>
          <p className="text-muted-foreground max-w-md text-sm text-pretty">
            {noPeriods
              ? t('emptyNoPeriodBody')
              : needle || status || periodId
                ? t('emptyFilteredBody')
                : t('emptyBody')}
          </p>
          {noPeriods && manage && (
            <Link href="/admissions/periods" className={buttonVariants()}>
              {t('createPeriod')}
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {manage && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={allOnPage}
                      onCheckedChange={(v) => {
                        setSelected(v === true ? new Set(items.map((i) => i.id)) : new Set());
                      }}
                    />
                  </TableHead>
                )}
                <TableHead>{t('colName')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('previousSchool')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('colGuardian')}</TableHead>
                <TableHead className="hidden xl:table-cell">{t('colDocs')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('colSubmitted')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow
                  key={a.id}
                  data-state={selected.has(a.id) ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => setOpenId(a.id)}
                >
                  {manage && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={t('selectOne', { name: a.fullName })}
                        checked={selected.has(a.id)}
                        onCheckedChange={(v) => toggle(a.id, v === true)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium outline-none hover:underline focus-visible:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(a.id);
                      }}
                    >
                      {a.fullName}
                    </button>
                    <span className="text-muted-foreground block font-mono text-xs">{a.regNumber}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{a.previousSchool ?? '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {a.guardianName}
                    <span className="text-muted-foreground block text-xs">{a.guardianPhone}</span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell tabular-nums">{a.documentCount}</TableCell>
                  <TableCell>
                    <StatusChip status={a.status as AdmissionStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                    {formatDateTime(locale, a.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">{t('pageOf', { page: page + 1, pages, total })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('prevPage')}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('nextPage')}
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <FormDialog
        open={bulk !== null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={bulk ? t('bulkTitle', { action: t(`action.${bulk}`), count: selected.size }) : ''}
        description={bulk === 'accepted' || bulk === 'rejected' ? t('noteVisible') : t('bulkHint')}
        submitLabel={bulk ? t(`action.${bulk}`) : t('save')}
        error={bulkError}
        onSubmit={async () => {
          if (bulk) await bulkMutation.mutateAsync(bulk);
        }}
      >
        <NoteField id="bulk-note" value={note} onChange={setNote} />
      </FormDialog>

      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </PageBody>
  );
}
