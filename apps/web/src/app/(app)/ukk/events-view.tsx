'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { EventDialog } from './event-dialog';
import { UKK_PATTERN_LIST, UKK_STATUS_LIST, type UkkEventRow, ukkKey } from './lib';
import { PatternBadge, StatusBadge, useUkkConcentrations, useUkkYears } from './shared';

/** Daftar kegiatan UKK per tahun ajaran: saringan konsentrasi/status/pola, kartu di layar sempit, tabel di layar lebar. */
export function EventsView() {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const manage = can('ukk:manage');
  const years = useUkkYears();
  const concentrations = useUkkConcentrations();
  const [yearChoice, setYearChoice] = useState('');
  const [concentrationId, setConcentrationId] = useState('');
  const [status, setStatus] = useState('');
  const [pattern, setPattern] = useState('');
  const [open, setOpen] = useState(false);

  const yearList = years.data ?? [];
  const yearId = yearChoice || (yearList.find((y) => y.isActive) ?? yearList[0])?.id || '';

  const events = useQuery({
    queryKey: ukkKey(school.schoolId, 'events', yearId, concentrationId, status, pattern),
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/ukk/events', {
          params: {
            header: schoolHeader(school.schoolId),
            query: {
              academicYearId: yearId,
              ...(concentrationId ? { concentrationId } : {}),
              ...(status ? { status: status as UkkEventRow['status'] } : {}),
              ...(pattern ? { pattern: pattern as UkkEventRow['pattern'] } : {}),
            },
          },
        }),
      ),
  });
  const list = events.data ?? [];
  const filtered = !!concentrationId || !!status || !!pattern;
  const dates = (e: UkkEventRow) =>
    e.startsOn
      ? e.endsOn && e.endsOn !== e.startsOn
        ? `${formatCalendarDate(locale, e.startsOn)} - ${formatCalendarDate(locale, e.endsOn)}`
        : formatCalendarDate(locale, e.startsOn)
      : '-';

  const newButton = (
    <Button className="max-sm:min-h-11" onClick={() => setOpen(true)}>
      <Plus className="size-4" aria-hidden /> {t('newEvent')}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          <>
            {manage && newButton}
            {manage && (
              <Button variant="outline" nativeButton={false} render={<Link href="/ukk/settings" />}>
                <Settings2 className="size-4" aria-hidden /> {t('settingsTitle')}
              </Button>
            )}
          </>
        }
      />

      <EventDialog open={open} onOpenChange={setOpen} event={null} defaultYearId={yearId} />

      <Toolbar className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="uk-f-year">{t('filters.year')}</Label>
          <SelectField
            id="uk-f-year"
            className={TOUCH_SELECT}
            value={yearId}
            onChange={(e) => setYearChoice(e.target.value)}
          >
            {yearList.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="uk-f-con">{t('filters.concentration')}</Label>
          <SelectField
            id="uk-f-con"
            className={TOUCH_SELECT}
            value={concentrationId}
            onChange={(e) => setConcentrationId(e.target.value)}
          >
            <option value="">{t('filters.all')}</option>
            {(concentrations.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="uk-f-pattern">{t('filters.pattern')}</Label>
          <SelectField
            id="uk-f-pattern"
            className={TOUCH_SELECT}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          >
            <option value="">{t('filters.all')}</option>
            {UKK_PATTERN_LIST.map((p) => (
              <option key={p} value={p}>
                {t(`patterns.${p}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="uk-f-status">{t('filters.status')}</Label>
          <SelectField
            id="uk-f-status"
            className={TOUCH_SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('filters.all')}</option>
            {UKK_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </Toolbar>

      {events.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(events.error))}</AlertDescription>
        </Alert>
      )}

      {years.isPending || events.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" aria-busy />
          ))}
        </div>
      ) : events.isError ? null : list.length === 0 ? (
        <EmptyPanel
          icon={ClipboardCheck}
          tone="violet"
          title={filtered ? t('noMatch') : t('emptyTitle')}
          body={filtered ? undefined : t('emptyBody')}
          action={manage && !filtered ? newButton : undefined}
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {list.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/ukk/${e.id}`}
                  className="bg-card hover:bg-muted/40 focus-visible:ring-ring/50 grid min-h-11 content-start gap-2 rounded-xl border p-4 outline-none focus-visible:ring-3"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <PatternBadge pattern={e.pattern} />
                    <StatusBadge status={e.status} />
                  </span>
                  <span className="font-heading min-w-0 text-base font-semibold break-words">{e.title}</span>
                  <span className="text-muted-foreground min-w-0 text-xs break-words">
                    {e.concentrationName} · {e.semesterName}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                    <span>{dates(e)}</span>
                    <span>{t('counts', { assessors: e.assessorCount, students: e.studentCount })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="bg-card hidden overflow-x-auto rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.event')}</TableHead>
                  <TableHead>{t('columns.concentration')}</TableHead>
                  <TableHead>{t('columns.pattern')}</TableHead>
                  <TableHead>{t('columns.semester')}</TableHead>
                  <TableHead>{t('columns.date')}</TableHead>
                  <TableHead className="text-right">{t('columns.students')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link href={`/ukk/${e.id}`} className="hover:underline">
                        {e.title}
                      </Link>
                    </TableCell>
                    <TableCell>{e.concentrationName}</TableCell>
                    <TableCell>
                      <PatternBadge pattern={e.pattern} />
                    </TableCell>
                    <TableCell>{e.semesterName}</TableCell>
                    <TableCell className="whitespace-nowrap">{dates(e)}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.studentCount}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </PageBody>
  );
}
