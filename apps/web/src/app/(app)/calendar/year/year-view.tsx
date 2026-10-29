'use client';

import { buildYearPlanner, type EventType } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { saveBlob } from '@/lib/sheet';
import { KIND_COLORS, LEGEND, monthName, weekdayNames } from './planner-style';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-heading text-3xl font-semibold ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/** Kalender tahunan: 12 bulan sekaligus dengan penanda berwarna, hari efektif, dan unduhan PDF. */
export function YearView() {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [yearChoice, setYearChoice] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState<5 | 6>(5);
  const [generating, setGenerating] = useState(false);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const year =
    years.data?.find((y) => y.id === (yearChoice || years.data?.find((x) => x.isActive)?.id)) ??
    years.data?.[0];

  const calendar = useQuery({
    queryKey: ['calendar', school.schoolId, year?.id, daysPerWeek],
    enabled: !!year,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/calendar', {
          params: { ...header, path: { id: year?.id as string }, query: { daysPerWeek } },
        }),
      ),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, year?.id],
    enabled: !!year,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: year?.id } } })),
  });

  // Penanda di grid hanya dari acara cakupan sekolah; acara kelas tampil di daftar.
  const months = useMemo(
    () =>
      year && calendar.data
        ? buildYearPlanner(
            year,
            calendar.data.events.filter((e) => e.scope === 'school'),
          )
        : [],
    [year, calendar.data],
  );
  const heads = weekdayNames(locale);
  const typeLabel = (x: EventType) => t(x);
  const range = (a: string, b: string) =>
    a === b
      ? formatCalendarDate(locale, a)
      : `${formatCalendarDate(locale, a)} – ${formatCalendarDate(locale, b)}`;
  const className = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? null;

  async function downloadPdf() {
    if (!year || !calendar.data) return;
    setGenerating(true);
    try {
      const [{ pdf }, { CalendarPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./calendar-pdf'),
      ]);
      const doc = (
        <CalendarPdf
          locale={locale}
          schoolName={school.schoolName}
          yearName={year.name}
          months={months}
          days={calendar.data.days}
          events={calendar.data.events.map((e) => ({
            id: e.id,
            type: e.type,
            title: e.title,
            range: range(e.startsOn, e.endsOn),
            className: className(e.classId),
          }))}
          labels={{
            title: t('pdfTitle'),
            effective: t('effective'),
            workdays: t('workdays'),
            closures: t('closures'),
            eventsTitle: t('eventsTitle'),
            types: { holiday: t('holiday'), break: t('break'), exam: t('exam'), activity: t('activity') },
            weekend: t('weekend'),
            generated: t('generated', {
              date: formatCalendarDate(locale, new Date().toISOString().slice(0, 10)),
            }),
          }}
        />
      );
      saveBlob(
        await pdf(doc).toBlob(),
        `kalender-akademik-${school.schoolSlug}-${year.name.replace('/', '-')}.pdf`,
      );
    } catch {
      toast.error(t('pdfError'));
    } finally {
      setGenerating(false);
    }
  }

  if (years.isPending) return <Skeleton className="h-64 w-full" />;
  if (!year) return <p className="text-muted-foreground text-sm">{t('noYears')}</p>;

  return (
    <div className="grid w-full gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            nativeButton={false}
            render={<Link href="/calendar" />}
          >
            <ArrowLeft className="size-4" /> {t('backToList')}
          </Button>
          <p className="text-primary text-sm font-medium">{school.schoolName}</p>
          <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">
            {t('title')} {year.name}
          </h1>
        </div>
        <Button onClick={downloadPdf} disabled={generating || !calendar.data}>
          <Download className="size-4" /> {generating ? t('generating') : t('downloadPdf')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="year-year">{t('year')}</Label>
          <SelectField id="year-year" value={year.id} onChange={(e) => setYearChoice(e.target.value)}>
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="year-week">{t('workweek')}</Label>
          <SelectField
            id="year-week"
            value={String(daysPerWeek)}
            onChange={(e) => setDaysPerWeek(e.target.value === '6' ? 6 : 5)}
          >
            <option value="5">{t('days5')}</option>
            <option value="6">{t('days6')}</option>
          </SelectField>
        </div>
      </div>

      {calendar.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('effective')} value={calendar.data.days.effective} tone="text-primary" />
          <Stat label={t('workdays')} value={calendar.data.days.workdays} />
          <Stat label={t('closures')} value={calendar.data.days.nonEffective} tone="text-destructive" />
          <Stat label={t('totalDays')} value={calendar.data.days.total} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {LEGEND.map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span
              className="size-3.5 rounded-sm border"
              style={{ backgroundColor: KIND_COLORS[k].bg, borderColor: KIND_COLORS[k].border }}
            />
            {typeLabel(k)}
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span
            className="size-3.5 rounded-sm border"
            style={{ backgroundColor: KIND_COLORS.weekend.bg, borderColor: KIND_COLORS.weekend.border }}
          />
          {t('weekend')}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {months.map((m) => (
          <section key={`${m.year}-${m.month}`} className="bg-card rounded-xl border p-4 shadow-xs">
            <h2 className="font-heading text-primary mb-2 text-base font-semibold capitalize">
              {monthName(locale, m.year, m.month)} {m.year}
            </h2>
            <div className="grid grid-cols-7 gap-1 text-center">
              {heads.map((h) => (
                <span key={h} className="text-muted-foreground pb-1 text-[11px]">
                  {h.slice(0, 3)}
                </span>
              ))}
              {m.weeks.flat().map((c) => {
                const color = c.inMonth && c.kind ? KIND_COLORS[c.kind] : null;
                return (
                  <span
                    key={c.date}
                    title={
                      c.inMonth && c.kind
                        ? c.kind === 'weekend'
                          ? t('weekend')
                          : typeLabel(c.kind)
                        : undefined
                    }
                    className="grid aspect-square place-items-center rounded-md text-xs tabular-nums"
                    style={
                      color ? { backgroundColor: color.bg, color: color.fg, fontWeight: 600 } : undefined
                    }
                  >
                    {c.inMonth ? c.day : ''}
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {calendar.data && calendar.data.events.length > 0 && (
        <section className="bg-card rounded-xl border p-4">
          <h2 className="font-heading mb-3 text-lg font-semibold">{t('eventsTitle')}</h2>
          <ul className="divide-y">
            {calendar.data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span
                  className="w-20 rounded-md px-2 py-0.5 text-center text-xs font-medium"
                  style={{ backgroundColor: KIND_COLORS[e.type].bg, color: KIND_COLORS[e.type].fg }}
                >
                  {typeLabel(e.type)}
                </span>
                <span className="text-muted-foreground w-64">{range(e.startsOn, e.endsOn)}</span>
                <span className="font-medium">
                  {e.title}
                  {className(e.classId) && (
                    <span className="text-muted-foreground font-normal"> · {className(e.classId)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
