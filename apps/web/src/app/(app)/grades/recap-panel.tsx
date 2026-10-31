'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Gauge, TrendingUp, TriangleAlert, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
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
import { errorKey } from '@/lib/errors';
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
    const blob = await buildExport(
      t('recapSheet'),
      [
        t('student'),
        t('nis'),
        ...data.components.map((c) => `${c.name} (${c.weight}%)`),
        t('finalScore'),
        t('predicate'),
      ],
      data.students.map((s) => [
        s.name,
        s.nis,
        ...data.components.map((c) => s.perComponent.find((p) => p.componentId === c.id)?.average ?? null),
        s.final,
        s.predicate,
      ]),
      { textColumns: [2], widths: [30, 16, ...data.components.map(() => 16), 14, 10] },
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
  const { stats } = data;
  const total = data.students.length;
  const dist = PREDICATES.map((p) => ({ p, n: data.students.filter((s) => s.predicate === p).length }));
  const distTotal = dist.reduce((n, d) => n + d.n, 0);

  return (
    <div className="grid gap-4">
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
          hint={t('kkmInfo', { kkm: data.settings.kkm })}
        />
        <StatCard
          icon={Users}
          tone="sky"
          label={t('filledStudents')}
          value={`${stats.filled}/${total}`}
          progress={total ? (stats.filled / total) * 100 : 0}
        />
      </StatGrid>

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
          <div className="bg-card hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th scope="col" className="w-10 px-3 py-2.5 text-left font-medium">
                    #
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">
                    {t('student')}
                  </th>
                  {data.components.map((c) => (
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((s, i) => (
                  <tr key={s.studentId} className="hover:bg-muted/30 transition-colors">
                    <td className="text-muted-foreground px-3 py-2.5 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <PersonCell name={s.name} sub={s.nis} />
                    </td>
                    {data.components.map((c) => {
                      const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            'px-3 py-2.5 text-right tabular-nums',
                            v === null || v === undefined
                              ? 'text-muted-foreground'
                              : v < data.settings.kkm && TONES.rose.text,
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Layar sempit: satu kartu per siswa. */}
          <ul className="grid gap-2 md:hidden">
            {data.students.map((s, i) => (
              <li
                key={s.studentId}
                className="bg-card grid gap-3 rounded-2xl border p-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
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
                {s.belowKkm && (
                  <ToneBadge tone="rose" dot={false} className="w-fit">
                    {t('belowKkmBadge')}
                  </ToneBadge>
                )}
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  {data.components.map((c) => {
                    const v = s.perComponent.find((p) => p.componentId === c.id)?.average;
                    return (
                      <div key={c.id} className="bg-muted/50 rounded-lg px-2 py-1.5">
                        <dt className="text-muted-foreground truncate">{c.name}</dt>
                        <dd
                          className={cn(
                            'font-semibold tabular-nums',
                            v !== null && v !== undefined && v < data.settings.kkm && TONES.rose.text,
                          )}
                        >
                          {fmt(v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
