'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Target, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TONES, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  MAX_OBJECTIVES_PER_ASSESSMENT,
  type ObjectiveLite,
  type OutcomeGroup,
  objectiveLabel,
  pickableGroups,
  selectedObjectives,
  toggleObjective,
} from '@/lib/objective-achievement';
import { cn } from '@/lib/utils';

interface Props {
  subjectId: string;
  /** Id TP yang terpilih. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** TP yang sudah terkait ke penilaian ini (untuk menampilkan versi lama yang sudah nonaktif). */
  linked: readonly ObjectiveLite[];
  /** Komponen penilaian formatif: TP hanya menjadi kemajuan, tidak menentukan ketercapaian untuk rapor. */
  feedback: boolean;
}

/**
 * Pemilih tujuan pembelajaran (TP) pada formulir penilaian: banyak pilihan, dengan pencarian, dikelompokkan per CP, batas
 * 20 TP. TP nonaktif (versi lama) tampil bila sudah terkait, tetapi tidak dapat ditambahkan baru.
 */
export function ObjectivePicker({ subjectId, value, onChange, linked, feedback }: Props) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [limitHit, setLimitHit] = useState(false);

  // Kunci sama dengan layar Perangkat ajar (hanya yang aktif), jadi hasilnya dipakai bersama.
  const outcomes = useQuery({
    queryKey: ['teaching-plan', 'outcomes', school.schoolId, subjectId, false],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/subjects/{subjectId}/outcomes', {
          params: { ...header, path: { subjectId }, query: { includeInactive: 'false' } },
        }),
      ),
  });
  const outcomeList = (outcomes.data?.outcomes ?? []).filter((o) => o.objectiveCount > 0);
  const objectiveQueries = useQueries({
    queries: outcomeList.map((o) => ({
      queryKey: ['teaching-plan', 'objectives', school.schoolId, o.id, false],
      queryFn: async () =>
        unwrap(
          await api.GET('/v1/outcomes/{id}/objectives', {
            params: { ...header, path: { id: o.id }, query: { includeInactive: 'false' } },
          }),
        ),
    })),
  });
  const loading = outcomes.isPending || objectiveQueries.some((q) => q.isPending);
  const failed = outcomes.error ?? objectiveQueries.find((q) => q.error)?.error;

  const groups: OutcomeGroup[] = outcomeList.map((o, i) => ({
    outcomeId: o.id,
    outcomeCode: o.code,
    phase: o.phase,
    objectives: (objectiveQueries[i]?.data?.objectives ?? []).map((x) => ({
      id: x.id,
      code: x.code,
      description: x.description,
      active: x.active,
    })),
  }));
  const shown = pickableGroups(groups, query);
  const known = groups.flatMap((g) => g.objectives);
  const picked = selectedObjectives(value, linked, known);
  const atLimit = value.length >= MAX_OBJECTIVES_PER_ASSESSMENT;
  const hasActive = pickableGroups(groups, '').length > 0;

  function toggle(id: string) {
    const r = toggleObjective(value, id);
    setLimitHit(r.limited);
    onChange(r.ids);
  }

  return (
    <div className="grid content-start gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{t('objPickerLabel')}</span>
        <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
          {t('objPickerCount', { count: value.length, max: MAX_OBJECTIVES_PER_ASSESSMENT })}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{t('objPickerHint')}</p>
      {feedback && (
        <p className={cn('rounded-lg px-2.5 py-1.5 text-xs', TONES.slate.soft)}>
          {t('objPickerFeedbackNote')}
        </p>
      )}

      {picked.length > 0 && (
        <ul className="grid gap-1.5" aria-label={t('objPickerSelected')}>
          {picked.map((o) => (
            <li
              key={o.id}
              className="bg-muted/50 flex items-start gap-2 rounded-lg border py-1 pr-1 pl-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 py-1.5 break-words">
                {objectiveLabel(o)}
                {!o.active && (
                  <>
                    {' '}
                    <ToneBadge tone="amber" dot={false} className="align-middle">
                      {t('objPickerOld')}
                    </ToneBadge>
                  </>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 md:size-8"
                aria-label={t('objPickerRemove', { name: objectiveLabel(o) })}
                onClick={() => toggle(o.id)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {picked.some((o) => !o.active) && (
        <p className="text-muted-foreground text-xs">{t('objPickerOldNote')}</p>
      )}

      {loading && <Skeleton className="h-11 rounded-lg" aria-busy />}
      {failed && !loading && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(failed))}</AlertDescription>
        </Alert>
      )}
      {!loading && !failed && !hasActive && (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <Target className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t('objPickerEmpty')}{' '}
            <Link href="/teaching-plan" className="text-foreground font-medium underline underline-offset-2">
              {t('objPickerEmptyLink')}
            </Link>
          </span>
        </p>
      )}

      {!loading && !failed && hasActive && (
        <>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-between md:min-h-8"
            aria-expanded={expanded}
            aria-controls="assessment-objective-list"
            onClick={() => setExpanded((e) => !e)}
          >
            <span>{expanded ? t('objPickerHide') : t('objPickerShow')}</span>
            {expanded ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </Button>
          {expanded && (
            <div id="assessment-objective-list" className="grid gap-2">
              <Input
                id="assessment-objective-search"
                type="search"
                className="min-h-11 md:min-h-8"
                aria-label={t('objPickerSearch')}
                placeholder={t('objPickerSearch')}
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Enter di kolom cari tidak boleh mengirim formulir penilaian.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
              />
              {(limitHit || atLimit) && (
                <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
                  {t('objPickerLimit', { max: MAX_OBJECTIVES_PER_ASSESSMENT })}
                </p>
              )}
              <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border">
                {shown.length === 0 && (
                  <p className="text-muted-foreground p-3 text-sm">{t('objPickerNoMatch')}</p>
                )}
                {shown.map((g) => (
                  <fieldset key={g.outcomeId} className="min-w-0 border-b last:border-b-0">
                    <legend className="bg-muted/60 text-muted-foreground sticky top-0 z-[1] w-full px-3 py-1.5 text-xs font-medium">
                      {t('objPickerOutcome', { phase: g.phase })}
                      {g.outcomeCode ? ` · ${g.outcomeCode}` : ''}
                    </legend>
                    {g.objectives.map((o) => {
                      const on = value.includes(o.id);
                      const id = `assessment-objective-${o.id}`;
                      return (
                        <label
                          key={o.id}
                          htmlFor={id}
                          className={cn(
                            'flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/40',
                            !on && atLimit && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          <Checkbox
                            id={id}
                            className="mt-0.5"
                            checked={on}
                            disabled={!on && atLimit}
                            onCheckedChange={() => toggle(o.id)}
                          />
                          <span className="min-w-0 break-words">{objectiveLabel(o)}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
