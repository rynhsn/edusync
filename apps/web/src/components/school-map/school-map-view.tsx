'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSchoolTimezone, todayIso } from '@/lib/school-time';
import { BUILDINGS } from './geometry';
import { useDutyMe, useLiveSnapshot, useTodayLessons } from './live-data';
import { describeBuildings, mergeActivity } from './logic';
import { lineText, type MapT, SchoolMap } from './school-map';
import type { BuildingKind, LiveEvent } from './types';

/** Jam peristiwa menurut zona waktu sekolah. */
const clock = {
  format: (at: Date) =>
    new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: getSchoolTimezone(),
    }).format(at),
};

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-0.5">
        <span className="font-heading text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </CardContent>
    </Card>
  );
}

/** Beranda "sekolah hidup": peta, ringkasan angka, aktivitas terbaru, dan meja guru. */
export function SchoolMapView() {
  const t = useTranslations('schoolMap') as unknown as MapT;
  const { school, can, hasModule } = useSchool();
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<LiveEvent[]>([]);

  const attendanceOn = hasModule('attendance') && can('attendance:read');
  const snapshotQ = useLiveSnapshot(school.schoolId);
  const snapshot = snapshotQ.data ?? null;
  const duty = useDutyMe(school.schoolId, attendanceOn);

  const canTeachers = can('teacher:read');
  const infos = useMemo(
    () =>
      describeBuildings(snapshot, {
        onDuty: attendanceOn ? (duty.data?.onDuty ?? null) : null,
        canOpenTeachers: canTeachers,
      }),
    [snapshot, attendanceOn, duty.data?.onDuty, canTeachers],
  );

  const hrefs: Record<BuildingKind, string | null> = {
    gate: attendanceOn ? '/gate' : null,
    classes: attendanceOn ? '/lessons' : null,
    teachers: canTeachers ? '/teachers' : attendanceOn ? '/lessons' : null,
    office:
      hasModule('finance') && can('finance:pay')
        ? '/finance'
        : hasModule('finance') && can('finance:read')
          ? '/finance/invoices'
          : null,
    field: hasModule('extracurricular') && can('extracurricular:read') ? '/extracurriculars' : null,
    mail: hasModule('messaging') && can('message:read') ? '/messaging' : null,
  };

  const onActivity = useCallback((events: LiveEvent[]) => {
    if (events.length > 0) setActivity((prev) => mergeActivity(prev, events));
  }, []);

  const showNames = can('student:read');
  const att = snapshot?.attendance ?? null;
  const running = snapshot?.lessons?.running.length;

  // Meja guru: jam pelajaran miliknya hari ini (pengurus sudah punya halaman jam pelajaran penuh).
  const showDesk = attendanceOn && !can('attendance:configure');
  const date = todayIso();
  const lessons = useTodayLessons(school.schoolId, date, showDesk);
  const mine = (lessons.data?.lessons ?? [])
    .filter((l) => l.mine)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const activeModules = BUILDINGS.filter((b) => infos[b.kind] !== null);

  return (
    <div className="grid gap-6">
      <SchoolMap
        schoolId={school.schoolId}
        snapshot={snapshot}
        infos={infos}
        hrefs={hrefs}
        watchEvents={attendanceOn}
        onActivity={onActivity}
      />

      {snapshotQ.isError && !snapshot && (
        <div
          className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
          role="alert"
        >
          <span className="text-muted-foreground">{t('unavailable')}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['live', 'snapshot', school.schoolId] })}
          >
            {t('retry')}
          </Button>
        </div>
      )}

      {(att || running !== undefined) && (
        <section aria-label={t('statsTitle')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {att && <StatCard label={t('statPresent')} value={att.present + att.late} />}
          {att && <StatCard label={t('statLate')} value={att.late} />}
          {att && <StatCard label={t('statNotYet')} value={att.notYet} />}
          {running !== undefined && <StatCard label={t('statRunning')} value={running} />}
        </section>
      )}

      <div className={showDesk ? 'grid gap-6 lg:grid-cols-[1.4fr_1fr]' : 'grid gap-6'}>
        {attendanceOn && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">{t('activityTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('activityEmpty')}</p>
              ) : (
                <ul className="grid gap-1.5" aria-live="polite">
                  {activity.map((e) => {
                    const who = (showNames && e.studentName) || t('anonymous');
                    const Icon = e.kind === 'arrival' ? LogIn : LogOut;
                    return (
                      <li
                        key={e.id}
                        className="sm-in bg-muted/50 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm"
                      >
                        <Icon
                          className={
                            e.kind === 'arrival'
                              ? 'text-primary size-4 shrink-0'
                              : 'text-muted-foreground size-4 shrink-0'
                          }
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {t(e.kind === 'arrival' ? 'arrivalLine' : 'departureLine', { who })}
                          {e.className && <span className="text-muted-foreground"> · {e.className}</span>}
                        </span>
                        <time className="text-muted-foreground text-xs tabular-nums" dateTime={e.at}>
                          {clock.format(new Date(e.at))}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {showDesk && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">{t('deskTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {mine.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {lessons.isPending
                    ? t('deskLoading')
                    : lessons.data?.closed
                      ? t('deskClosed')
                      : t('deskEmpty')}
                </p>
              ) : (
                <ul className="grid gap-2">
                  {mine.map((l) => {
                    const done = l.total > 0 && l.filled >= l.total;
                    return (
                      <li key={l.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                        <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold">
                          {l.periodNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.subjectName}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {l.className} · {t('deskFilled', { filled: l.filled, total: l.total })}
                          </span>
                        </span>
                        {done ? (
                          <span className="text-muted-foreground text-xs">{t('deskDone')}</span>
                        ) : (
                          <Link
                            href="/lessons"
                            className="text-primary hover:bg-accent focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-3"
                          >
                            {t('deskFill')}
                            <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {activeModules.length > 0 && (
        <section aria-labelledby="sm-modules" className="grid gap-3">
          <h2 id="sm-modules" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('modulesTitle')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeModules.map(({ kind }) => {
              const info = infos[kind];
              const href = hrefs[kind];
              if (!info) return null;
              const content = (
                <>
                  <span className="font-heading block font-semibold">{t(`b_${kind}`)}</span>
                  {info.lines.map((l) => (
                    <span key={l.key} className="text-muted-foreground block text-sm">
                      {lineText(t, l)}
                    </span>
                  ))}
                </>
              );
              return (
                <li key={kind}>
                  {href ? (
                    <Link
                      href={href}
                      className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 block rounded-xl border p-3 transition-colors outline-none focus-visible:ring-3"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="bg-card rounded-xl border p-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
