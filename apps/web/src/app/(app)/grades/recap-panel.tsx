'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Gauge, TrendingUp, TriangleAlert, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ReportSourceBadge } from '@/components/report-source-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  TONES,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { belowKkmApplies, splitComponents } from '@/lib/assessment-category';
import { errorKey } from '@/lib/errors';
import { isFromReport } from '@/lib/grading-config';
import { formatKkm, pickKkm } from '@/lib/kktp';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';
import { PREDICATES, PredicateBadge, predicateTone, ScoreChip } from './grade-ui';

interface Props {
  semesterId: string;
  classId: string;
  subjectId: string;
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : String(n));

/** Rekap nilai satu mata pelajaran: rata-rata per komponen, nilai akhir berbobot, predikat, dan penanda di bawah KKM. */
export function RecapPanel({ semesterId, classId, subjectId }: Props) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const recap = useQuery({
    queryKey: ['grading-recap', school.schoolId, semesterId, classId, subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/grading/recap', {
          params: { ...header, query: { semesterId, classId, subjectId } },
        }),
      ),
  });

  const data = recap.data;

  async function exportExcel() {
    if (!data || data.students.length === 0) return void toast.info(t('exportEmpty'));
    const { counted, feedback } = splitComponents(data.components);
    const blob = await buildExport(
      t('recapSheet'),
      [
        t('student'),
        t('nis'),
        ...counted.map((c) => `${c.name} (${c.weight}%)`),
        t('finalScore'),
        t('predicate'),
        ...feedback.map((c) => `${c.name} (${t('feedbackShort')})`),
      ],
      data.students.map((s) => [
        s.name,
        s.nis,
        ...counted.map((c) => s.perComponent.find((p) => p.componentId === c.id)?.average ?? null),
        s.final,
        s.predicate,
        ...feedback.map((c) => s.perComponent.find((p) => p.componentId === c.id)?.average ?? null),
      ]),
      { textColumns: [2], widths: [30, 16, ...counted.map(() => 16), 14, 10, ...feedback.map(() => 18)] },
    );
    saveBlob(blob, `rekap-nilai-${school.schoolSlug}.xlsx`);
  }

  if (recap.isPending)
    return (
      <div className="grid gap-4" aria-busy>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 4).map((k) => (
            <Skeleton key={k} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(recap.error))}</AlertDescription>
      </Alert>
    );
  // KKM efektif mapel (KKTP, boleh desimal); tanpa itu KKM sekolah.
  const kkm = pickKkm(data.kkm, data.settings.kkm);
  const { stats } = data;
  // Komponen yang dihitung ke nilai akhir, dan umpan balik (formatif) yang tampil terpisah dan tidak diwarnai merah.
  const { counted, feedback } = splitComponents(data.components);
  const hasFeedback = feedback.length > 0;
  const total = data.students.length;
  const dist = PREDICATES.map((p) => ({ p, n: data.students.filter((s) => s.predicate === p).length }));
  const distTotal = dist.reduce((n, d) => n + d.n, 0);

  return (
    <div className="grid gap-4">
      {isFromReport(data) && (
        <div
          role="note"
          className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', TONES.sky.soft)}
        >
          <ReportSourceBadge label={t('fromReportBadge')} className="shrink-0" />
          <p className="min-w-0">{t('fromReportNote')}</p>
        </div>
      )}
      <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
        <StatCard
          icon={Gauge}
          tone={MODULE_TONE.academic}
          label={t('average')}
          value={fmt(stats.average)}
          hint={`${t('lowest')}: ${fmt(stats.min)}`}
        />
        <StatCard icon={TrendingUp} tone="emerald" label={t('highest')} value={fmt(stats.max)} />
        <StatCard
          icon={TriangleAlert}
          tone={stats.belowKkmCount > 0 ? 'rose' : 'slate'}
          label={t('belowKkm')}
          value={stats.belowKkmCount}
          hint={t('kkmInfo', { kkm: formatKkm(kkm) })}
        />
        <StatCard
          icon={Users}
          tone="sky"
          label={t('filledStudents')}
          value={`${stats.filled}/${total}`}
          progress={total ? (stats.filled / total) * 100 : 0}
        />
      </StatGrid>
      {hasFeedback && (
        <p role="note" className="text-muted-foreground text-xs">
          {t('recapFeedbackNote')}
        </p>
      )}

      <Toolbar className="justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-muted-foreground shrink-0 text-xs font-medium">{t('distribution')}</span>
          {distTotal > 0 ? (
            <div
              role="img"
              aria-label={dist.map((d) => `${d.p}: ${d.n}`).join(', ')}
              className="flex h-2.5 min-w-24 max-w-xs flex-1 overflow-hidden rounded-full"
            >
              {dist
                .filter((d) => d.n > 0)
                .map((d) => (
                  <div
                    key={d.p}
                    className={TONES[predicateTone(d.p)].bar}
                    style={{ width: `${(d.n / distTotal) * 100}%` }}
                  />
                ))}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
          <div className="hidden flex-wrap gap-1.5 sm:flex">
            {dist.map((d) => (
              <ToneBadge key={d.p} tone={predicateTone(d.p)} dot={false}>
                {d.p} · {d.n}
              </ToneBadge>
            ))}
          </div>
        </div>
        <Button variant="outline" disabled={total === 0} onClick={exportExcel}>
          <Download className="size-4" /> {t('exportExcel')}
        </Button>
      </Toolbar>

      {total === 0 ? (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noStudentsTitle')}
          body={t('noStudents')}
        />
      ) : (
        <>
          {/* Layar lebar: tabel rekap dengan sel nilai bernada. */}
          <div className="bg-card hidden overflow-x-auto rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th scope="col" className="w-10 px-3 py-2.5 text-left font-medium">
                    #
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">
                    {t('student')}
                  </th>
                  {counted.map((c) => (
                    <th key={c.id} scope="col" className="px-3 py-2.5 text-right font-medium">
                      {c.name} <span className="font-normal opacity-70">({c.weight}%)</span>
                    </th>
                  ))}
                  <th scope="col" className="border-l px-3 py-2.5 text-right font-medium">
                    {t('finalScore')}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">
                    {t('predicate')}
                  </th>
                  {feedback.map((c, k) => (
                    <th
                      key={c.id}
                      scope="col"
                      className={cn('px-3 py-2.5 text-right font-medium', k === 0 && 'border-l')}
                    >
                      {c.name} <span className="block text-[11px] font-normal">{t('feedbackShort')}</span>
                    </th>
                  ))}
                  {hasFeedback && (
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {t('feedbackAverage')}
                      <span className="block text-[11px] font-normal">{t('feedbackShort')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((s, i) => (
                  <tr key={s.studentId} className="hover:bg-muted/30 transition-colors">
                    <td className="text-muted-foreground px-3 py-2.5 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <PersonCell name={s.name} sub={s.nis} />
                    </td>
                    {counted.map((c) => {
                      const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            'px-3 py-2.5 text-right tabular-nums',
                            v === null || v === undefined
                              ? 'text-muted-foreground'
                              : belowKkmApplies(c, v, kkm) && TONES.rose.text,
                          )}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                    <td className="border-l px-3 py-2.5 text-right">
                      {s.final === null || s.final === undefined ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <ScoreChip predicate={s.predicate} below={s.belowKkm}>
                          {fmt(s.final)}
                        </ScoreChip>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PredicateBadge predicate={s.predicate} />
                        {s.belowKkm && (
                          <ToneBadge tone="rose" dot={false}>
                            {t('belowKkmBadge')}
                          </ToneBadge>
                        )}
                        {isFromReport(s) && <ReportSourceBadge label={t('fromReportBadge')} />}
                      </div>
                    </td>
                    {feedback.map((c, k) => {
                      const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            'text-muted-foreground px-3 py-2.5 text-right tabular-nums',
                            k === 0 && 'border-l',
                          )}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                    {hasFeedback && (
                      <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                        {s.formative ? (
                          <>
                            {fmt(Math.round(s.formative.average * 10) / 10)}{' '}
                            <span className="text-xs">({s.formative.count})</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Layar sempit: satu kartu per siswa. */}
          <ul className="grid content-start gap-2 md:hidden">
            {data.students.map((s, i) => (
              <li
                key={s.studentId}
                className="bg-card grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border p-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <PersonCell name={s.name} sub={s.nis ? `${i + 1} · ${s.nis}` : String(i + 1)} />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PredicateBadge predicate={s.predicate} />
                    {s.final !== null && s.final !== undefined && (
                      <ScoreChip predicate={s.predicate} below={s.belowKkm}>
                        {fmt(s.final)}
                      </ScoreChip>
                    )}
                  </div>
                </div>
                {(s.belowKkm || isFromReport(s)) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.belowKkm && (
                      <ToneBadge tone="rose" dot={false} className="w-fit">
                        {t('belowKkmBadge')}
                      </ToneBadge>
                    )}
                    {isFromReport(s) && <ReportSourceBadge label={t('fromReportBadge')} />}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {counted.map((c) => {
                    const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                    return (
                      <div key={c.id} className="bg-muted/50 rounded-lg px-2 py-1.5">
                        <dt className="text-muted-foreground break-words">{c.name}</dt>
                        <dd
                          className={cn(
                            'font-semibold tabular-nums',
                            belowKkmApplies(c, v, kkm) && TONES.rose.text,
                          )}
                        >
                          {fmt(v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {hasFeedback && (
                  <div className="grid gap-1.5 rounded-xl border border-dashed p-2.5">
                    <p className="text-muted-foreground text-xs font-medium">{t('feedbackHeading')}</p>
                    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      {feedback.map((c) => {
                        const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                        return (
                          <div key={c.id} className="rounded-lg px-2 py-1">
                            <dt className="text-muted-foreground break-words">{c.name}</dt>
                            <dd className="font-semibold tabular-nums">{fmt(v)}</dd>
                          </div>
                        );
                      })}
                      {s.formative && (
                        <div className="rounded-lg px-2 py-1">
                          <dt className="text-muted-foreground break-words">{t('feedbackAverage')}</dt>
                          <dd className="font-semibold tabular-nums">
                            {fmt(Math.round(s.formative.average * 10) / 10)}{' '}
                            <span className="text-muted-foreground font-normal">({s.formative.count})</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
