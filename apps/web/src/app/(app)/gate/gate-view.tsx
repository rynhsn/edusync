'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  DoorOpen,
  FileCheck2,
  HeartPulse,
  Hourglass,
  LogIn,
  LogOut,
  Radio,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ENTER, ProgressRing, STATUS_TONE, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  IconTile,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

const SUMMARY = ['present', 'late', 'excused', 'sick', 'absent', 'notYet'] as const;
const SUMMARY_ICON = {
  present: UserCheck,
  late: Clock,
  excused: FileCheck2,
  sick: HeartPulse,
  absent: UserX,
  notYet: Hourglass,
} as const;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '–';

const toneOfStatus = (s: string) => STATUS_TONE[s as keyof typeof STATUS_TONE] ?? 'slate';

/** Gerbang hari ini: ringkasan kehadiran dan status masuk/pulang dari tap kartu di kiosk. Menyegarkan sendiri. */
export function GateView() {
  const t = useTranslations('gate');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const date = todayIso();
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');

  const me = useQuery({
    queryKey: ['duty-me', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/duty-roster/me', { params: header })),
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
  const daily = useQuery({
    queryKey: ['gate-daily', school.schoolId, date, classId],
    refetchInterval: 10_000,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/gate/daily', {
          params: { ...header, query: { date, ...(classId ? { classId } : {}) } },
        }),
      ),
  });
  const all = daily.data?.students ?? [];
  const students = all.filter((s) =>
    q.trim() ? s.name.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );
  const summary = daily.data?.summary;

  // Linimasa tap: tiap catatan masuk/pulang menjadi satu peristiwa, terbaru di atas.
  const events = useMemo(() => {
    const out: { id: string; name: string; sub: string; at: string; kind: 'in' | 'late' | 'out' }[] = [];
    for (const s of all) {
      if (s.checkInAt)
        out.push({
          id: `${s.studentId}-in`,
          name: s.name,
          sub: s.className,
          at: s.checkInAt,
          kind: s.status === 'late' ? 'late' : 'in',
        });
      if (s.checkOutAt)
        out.push({ id: `${s.studentId}-out`, name: s.name, sub: s.className, at: s.checkOutAt, kind: 'out' });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [all]);

  const total = summary ? SUMMARY.reduce((n, k) => n + summary[k], 0) : 0;
  const here = summary ? summary.present + summary.late : 0;
  const rate = total > 0 ? Math.round((here / total) * 100) : 0;
  const EVENT_META = {
    in: { label: t('eventIn'), tone: 'emerald', icon: LogIn },
    late: { label: t('eventLate'), tone: 'amber', icon: Clock },
    out: { label: t('eventOut'), tone: 'sky', icon: LogOut },
  } as const;

  return (
    <PageBody>
      <PageHeader
        icon={DoorOpen}
        tone={MODULE_TONE.attendance}
        title={t('gateTitle')}
        description={t('gateSubtitle')}
        actions={
          me.data && (
            <ToneBadge tone={me.data.onDuty ? 'emerald' : 'slate'} className="px-3 py-1 text-sm">
              {me.data.onDuty ? t('youOnDuty') : me.data.canCover ? t('youManager') : t('notOnDuty')}
            </ToneBadge>
          )
        }
      />

      {daily.data?.closed && (
        <Alert>
          <AlertDescription>{t('closedToday', { title: daily.data.closed.title })}</AlertDescription>
        </Alert>
      )}

      {daily.isPending && (
        <div className="grid gap-4" aria-busy>
          <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
            <Skeleton className="h-36 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {SUMMARY.map((k) => (
                <Skeleton key={k} className="h-[4.5rem] rounded-2xl" />
              ))}
            </div>
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {summary && (
        <div className={cn(ENTER, 'grid gap-3 lg:grid-cols-[18rem_1fr]')}>
          <div className="bg-card flex items-center gap-4 rounded-2xl border p-4">
            <ProgressRing value={rate} size={88} stroke={9} tone="emerald">
              <span className="font-heading text-lg font-semibold tabular-nums">{rate}%</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="font-heading font-semibold">{t('attendanceRate')}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t('rateOf', { present: here, total })}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {t('live')} · {t('liveHint')}
              </p>
            </div>
          </div>
          <StatGrid className="lg:grid-cols-3">
            {SUMMARY.map((k) => (
              <StatCard
                key={k}
                label={t(`summary.${k}`)}
                value={summary[k]}
                icon={SUMMARY_ICON[k]}
                tone={STATUS_TONE[k]}
              />
            ))}
          </StatGrid>
        </div>
      )}

      {daily.data && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="grid gap-3">
            <Toolbar className="gap-3">
              <SelectField
                aria-label={t('class')}
                className="sm:w-48"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">{t('allClasses')}</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <div className="relative min-w-44 flex-1 sm:max-w-60">
                <Search
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  aria-label={t('search')}
                  placeholder={t('search')}
                  className="pl-9"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
                {t('shown', { shown: students.length, total: all.length })}
              </p>
            </Toolbar>

            {students.length === 0 ? (
              <EmptyPanel
                icon={Users}
                tone={MODULE_TONE.attendance}
                title={all.length === 0 ? t('noStudents') : t('noMatch')}
                body={all.length === 0 ? t('noStudentsBody') : undefined}
              />
            ) : (
              <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
                {students.map((s, i) => (
                  <li
                    key={s.studentId}
                    style={stagger(i)}
                    className={cn(
                      ENTER,
                      'hover:bg-muted/40 grid gap-2 px-4 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4',
                    )}
                  >
                    <PersonCell name={s.name} sub={[s.className, s.nis].filter(Boolean).join(' · ')} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end">
                      {s.status ? (
                        <ToneBadge tone={toneOfStatus(s.status)}>{t(`status_${s.status}`)}</ToneBadge>
                      ) : (
                        <ToneBadge tone="slate">{t('summary.notYet')}</ToneBadge>
                      )}
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-sm tabular-nums">
                        <LogIn aria-hidden className="size-3.5" />
                        <span className="sr-only">{t('checkIn')}</span>
                        {clock(s.checkInAt)}
                      </span>
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-sm tabular-nums">
                        <LogOut aria-hidden className="size-3.5" />
                        <span className="sr-only">{t('checkOut')}</span>
                        {clock(s.checkOutAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="bg-card grid gap-3 rounded-2xl border p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading flex items-center gap-2 font-semibold">
                <Radio aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
                {t('timelineTitle')}
              </h2>
            </div>
            {events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <IconTile icon={Radio} tone={MODULE_TONE.attendance} />
                <p className="font-medium">{t('timelineEmpty')}</p>
                <p className="text-muted-foreground max-w-56 text-sm">{t('timelineEmptyBody')}</p>
              </div>
            ) : (
              <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-border">
                {events.map((e, i) => {
                  const meta = EVENT_META[e.kind];
                  return (
                    <li
                      key={e.id}
                      style={stagger(i)}
                      className={cn(
                        ENTER,
                        'relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3',
                      )}
                    >
                      <PersonCell name={e.name} sub={e.sub} className="contents [&>div]:col-start-2" />
                      <div className="col-start-3 row-start-1 grid justify-items-end gap-1">
                        <ToneBadge tone={meta.tone} dot={false}>
                          <meta.icon aria-hidden className="size-3" />
                          {meta.label}
                        </ToneBadge>
                        <span className="text-muted-foreground text-xs tabular-nums">{clock(e.at)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>
      )}
    </PageBody>
  );
}
