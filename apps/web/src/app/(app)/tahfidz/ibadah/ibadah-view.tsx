'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2, MoonStar, Save } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';
import { fmtPercent, GeoPattern, MiniBar, ProgressRing, shiftIso, TahfidzBanner, todayIso } from '../shared';

type Tab = 'sheet' | 'report';

/** Pilihan cakupan: halaqah (h:id) atau kelas (c:id), tahun ajaran aktif. */
function useScope() {
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [choice, setChoice] = useState('');
  const halaqah = useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, 'active'],
    queryFn: async () => unwrap(await api.GET('/v1/tahfidz/halaqah', { params: { ...header, query: {} } })),
  });
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const options = [
    ...(halaqah.data ?? [])
      .filter((h) => h.active)
      .map((h) => ({ value: `h:${h.id}`, kind: 'h' as const, name: h.name })),
    ...(classes.data ?? []).map((c) => ({ value: `c:${c.id}`, kind: 'c' as const, name: c.name })),
  ];
  const value = options.some((o) => o.value === choice) ? choice : (options[0]?.value ?? '');
  const query = value.startsWith('h:')
    ? { halaqahId: value.slice(2) }
    : value.startsWith('c:')
      ? { classId: value.slice(2) }
      : null;
  const label = options.find((o) => o.value === value)?.name ?? '';
  return { options, value, setChoice, query, label, loading: halaqah.isPending || years.isPending };
}

function ScopeSelect({ scope }: { scope: ReturnType<typeof useScope> }) {
  const t = useTranslations('tahfidz');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="ib-scope">{t('group')}</Label>
      <SelectField
        id="ib-scope"
        className="w-64"
        value={scope.value}
        onChange={(e) => scope.setChoice(e.target.value)}
      >
        {scope.options.length === 0 && <option value="">{t('chooseGroup')}</option>}
        {scope.options.some((o) => o.kind === 'h') &&
          scope.options
            .filter((o) => o.kind === 'h')
            .map((o) => (
              <option key={o.value} value={o.value}>
                {t('groupHalaqah')}: {o.name}
              </option>
            ))}
        {scope.options
          .filter((o) => o.kind === 'c')
          .map((o) => (
            <option key={o.value} value={o.value}>
              {t('groupClass')}: {o.name}
            </option>
          ))}
      </SelectField>
    </div>
  );
}

/** Lembar harian: matriks siswa x butir dengan tombol besar yang ramah sentuh. */
function SheetTab() {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const today = todayIso();
  const [date, setDate] = useState(today);
  const scope = useScope();
  // Perubahan yang belum disimpan: "studentId|itemId" -> nilai.
  const [edits, setEdits] = useState<Record<string, boolean>>({});

  const sheet = useQuery({
    queryKey: ['tahfidz-ibadah-sheet', school.schoolId, date, scope.value],
    enabled: scope.query !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/ibadah-sheet', {
          params: { ...header, query: { date, ...scope.query } },
        }),
      ),
  });

  // Ganti tanggal atau cakupan: buang perubahan yang belum disimpan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada perubahan tanggal dan cakupan.
  useEffect(() => setEdits({}), [date, scope.value]);

  const data = sheet.data;
  const cellValue = (studentId: string, itemId: string) => {
    const k = `${studentId}|${itemId}`;
    if (k in edits) return edits[k] as boolean;
    return data?.students.find((s) => s.studentId === studentId)?.done[itemId] ?? false;
  };

  const total = (data?.students.length ?? 0) * (data?.items.length ?? 0);
  const doneCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const s of data.students)
      for (const i of data.items) {
        const k = `${s.studentId}|${i.id}`;
        if (k in edits ? edits[k] : s.done[i.id]) n++;
      }
    return n;
  }, [data, edits]);
  const percent = total > 0 ? (doneCount / total) * 100 : 0;
  const dirty = Object.keys(edits).length;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/tahfidz/ibadah-sheet', {
          params: header,
          body: {
            date,
            records: Object.entries(edits).map(([k, done]) => {
              const [studentId, itemId] = k.split('|') as [string, string];
              return { studentId, itemId, done, note: null };
            }),
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tahfidz-ibadah-sheet', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['tahfidz-ibadah-report', school.schoolId] });
      setEdits({});
      toast.success(t('saved'));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const toggle = (studentId: string, itemId: string) => {
    const k = `${studentId}|${itemId}`;
    const next = !cellValue(studentId, itemId);
    const server = data?.students.find((s) => s.studentId === studentId)?.done[itemId] ?? false;
    setEdits((e) => {
      const copy = { ...e };
      if (next === server && server !== null) delete copy[k];
      else copy[k] = next;
      return copy;
    });
  };
  const setColumn = (itemId: string, on: boolean) => {
    if (!data) return;
    setEdits((e) => {
      const copy = { ...e };
      for (const s of data.students) copy[`${s.studentId}|${itemId}`] = on;
      return copy;
    });
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ib-date">{t('date')}</Label>
          <DatePicker id="ib-date" className="w-52" value={date} onChange={(v) => v <= today && setDate(v)} />
        </div>
        <ScopeSelect scope={scope} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {save.isPending ? t('saving') : dirty > 0 ? t('unsaved') : data ? t('saved') : ''}
          </span>
          <Button onClick={() => save.mutate()} disabled={dirty === 0 || save.isPending || !data?.canRecord}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{' '}
            {t('save')}
          </Button>
        </div>
      </div>

      {(scope.loading || sheet.isPending) && scope.query !== null && (
        <Skeleton className="h-64 w-full rounded-2xl" />
      )}
      {!scope.loading && scope.query === null && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">
          {t('pickGroupHint')}
        </Card>
      )}
      {sheet.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(sheet.error))}</AlertDescription>
        </Alert>
      )}

      {data && data.items.length === 0 && (
        <Card className="relative items-center overflow-hidden px-6 py-12 text-center">
          <GeoPattern className="text-chart-5 opacity-[0.07]" />
          <MoonStar className="text-chart-2 relative size-8" />
          <p className="text-muted-foreground relative text-sm">{t('noItems')}</p>
        </Card>
      )}
      {data && data.items.length > 0 && data.students.length === 0 && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">
          {t('noStudentsInGroup')}
        </Card>
      )}

      {data && data.items.length > 0 && data.students.length > 0 && (
        <>
          <Card className="from-chart-2/15 flex-row items-center gap-4 bg-gradient-to-r to-transparent p-4">
            <ProgressRing percent={percent} size={60} stroke={7} tone="gold" label={t('todaySummary')}>
              <span className="text-xs font-semibold tabular-nums">{fmtPercent(percent)}%</span>
            </ProgressRing>
            <div>
              <p className="font-heading font-semibold">{t('todaySummary')}</p>
              <p className="text-muted-foreground text-sm tabular-nums">
                {t('doneOf', { done: doneCount, total })}
              </p>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="bg-muted/40 sticky left-0 z-10 min-w-40 px-3 py-2 text-left font-medium">
                      {t('student')}
                    </th>
                    {data.items.map((i) => (
                      <th key={i.id} className="min-w-24 px-2 py-2 text-center font-medium">
                        <span className="block leading-tight">{i.name}</span>
                        {data.canRecord && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mt-1 rounded text-[11px] underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                            onClick={() => setColumn(i.id, true)}
                          >
                            {t('allOn')}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.studentId} className="even:bg-muted/20 border-b last:border-b-0">
                      <th
                        scope="row"
                        className="bg-card sticky left-0 z-10 max-w-48 truncate px-3 py-1.5 text-left font-medium"
                      >
                        {s.name}
                      </th>
                      {data.items.map((i) => {
                        const on = cellValue(s.studentId, i.id);
                        const changed = `${s.studentId}|${i.id}` in edits;
                        return (
                          <td key={i.id} className="p-1.5 text-center">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${s.name}: ${i.name}`}
                              disabled={!data.canRecord}
                              onClick={() => toggle(s.studentId, i.id)}
                              className={cn(
                                'focus-visible:ring-ring/50 mx-auto grid size-11 place-items-center rounded-xl border transition-all outline-none focus-visible:ring-3 active:scale-95 motion-reduce:transition-none',
                                on
                                  ? 'border-chart-5 bg-chart-5 text-white dark:text-black'
                                  : 'text-transparent hover:bg-muted',
                                changed && 'ring-chart-2 ring-2',
                                !data.canRecord && 'cursor-not-allowed opacity-60',
                              )}
                            >
                              <Check className="size-5" strokeWidth={3} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Laporan ibadah pada rentang tanggal: persen per butir dan per siswa, dengan ekspor Excel. */
function ReportTab() {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const today = todayIso();
  const [from, setFrom] = useState(shiftIso(today, -29));
  const [to, setTo] = useState(today);
  const scope = useScope();

  const report = useQuery({
    queryKey: ['tahfidz-ibadah-report', school.schoolId, scope.value, from, to],
    enabled: scope.query !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/ibadah-report', {
          params: { ...header, query: { from, to, ...scope.query } },
        }),
      ),
  });
  const data = report.data;

  // Persen per butir: gabungan seluruh siswa.
  const perItem = (data?.items ?? []).map((item) => {
    let done = 0;
    let all = 0;
    for (const s of data?.students ?? []) {
      const r = s.items.find((x) => x.itemId === item.id);
      done += r?.done ?? 0;
      all += r?.total ?? 0;
    }
    return { ...item, done, total: all, percent: all > 0 ? (done / all) * 100 : 0 };
  });
  const students = [...(data?.students ?? [])].sort((a, b) => b.percent - a.percent);
  const hasData = (data?.students ?? []).some((s) => s.total > 0);
  const tone = (p: number) => (p >= 75 ? 'emerald' : p >= 40 ? 'gold' : 'rose');

  async function exportExcel() {
    if (!data || !hasData) return toast.error(t('exportEmpty'));
    const headers = [t('student'), ...data.items.map((i) => i.name), `${t('percentDone')} (%)`];
    const rows = data.students.map((s) => [
      s.name,
      ...data.items.map((i) => {
        const r = s.items.find((x) => x.itemId === i.id);
        return r && r.total > 0 ? `${r.done}/${r.total}` : '-';
      }),
      s.percent,
    ]);
    const blob = await buildExport(t('report').slice(0, 30), headers, rows, {
      widths: [30, ...data.items.map(() => 16), 12],
    });
    saveBlob(blob, `ibadah-${scope.label.replace(/[^\w-]+/g, '-')}-${from}_${to}.xlsx`);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ibr-from">{t('from')}</Label>
          <DatePicker id="ibr-from" className="w-48" value={from} onChange={(v) => v <= to && setFrom(v)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ibr-to">{t('to')}</Label>
          <DatePicker id="ibr-to" className="w-48" value={to} onChange={(v) => v >= from && setTo(v)} />
        </div>
        <ScopeSelect scope={scope} />
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={!hasData}>
          <Download className="size-4" /> {t('exportExcel')}
        </Button>
      </div>

      {report.isPending && scope.query !== null && <Skeleton className="h-64 w-full rounded-2xl" />}
      {report.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(report.error))}</AlertDescription>
        </Alert>
      )}
      {data && !hasData && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">
          {t('reportEmpty')}
        </Card>
      )}

      {data && hasData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="content-start gap-4 p-5">
            <div>
              <h2 className="font-heading font-semibold">{t('perItem')}</h2>
              <p className="text-muted-foreground text-xs">
                {formatCalendarDate(locale, data.from)} – {formatCalendarDate(locale, data.to)}
              </p>
            </div>
            <ul className="grid gap-3">
              {perItem.map((i) => (
                <li key={i.id} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{i.name}</span>
                    <span className="font-medium tabular-nums">{fmtPercent(i.percent)}%</span>
                  </div>
                  <MiniBar percent={i.percent} tone={tone(i.percent)} className="h-2.5" />
                </li>
              ))}
            </ul>
          </Card>
          <Card className="content-start gap-4 p-5">
            <h2 className="font-heading font-semibold">{t('perStudent')}</h2>
            <ul className="grid max-h-[28rem] gap-2.5 overflow-y-auto pr-1">
              {students.map((s) => (
                <li key={s.studentId} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t('daysCount', { count: s.total })} ·{' '}
                      <span className="text-foreground text-sm font-medium">{fmtPercent(s.percent)}%</span>
                    </span>
                  </div>
                  <MiniBar percent={s.percent} tone={tone(s.percent)} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

export function IbadahView() {
  const t = useTranslations('tahfidz');
  const [tab, setTab] = useState<Tab>('sheet');
  return (
    <PageBody>
      <TahfidzBanner>
        <PageHeader title={t('ibadahTitle')} description={t('ibadahSubtitle')} />
      </TahfidzBanner>
      <div className="flex w-fit rounded-xl border p-0.5">
        {(['sheet', 'report'] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="ghost"
            aria-pressed={tab === k}
            className={cn(tab === k && 'bg-chart-5/15 text-foreground hover:bg-chart-5/20')}
            onClick={() => setTab(k)}
          >
            {k === 'sheet' ? t('tabSheet') : t('tabReport')}
          </Button>
        ))}
      </div>
      {tab === 'sheet' ? <SheetTab /> : <ReportTab />}
    </PageBody>
  );
}
