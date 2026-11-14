'use client';

import { UKK_MAX_ATTEMPTS, type UkkWeights } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Info, Lock, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  buildItems,
  canRetake,
  type Edits,
  editingAttemptNo,
  fieldText,
  isDirty,
  lastAttempt,
  liveResult,
  type ScoreField,
  scoreInvalid,
  type UkkEvent,
  type UkkStudent,
  ukkKey,
} from '../lib';

/** Nilai satu murid: angka 0-100 (koma desimal diterima) dan kategori yang dihitung langsung dari skala. */
export function ResultsPanel({ event }: { event: UkkEvent }) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('ukk:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [edits, setEdits] = useState<Edits>({});
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const key = ukkKey(school.schoolId, 'results', event.id);
  const results = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/ukk/events/{id}/results', { params: { ...header, path: { id: event.id } } })),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
    // Hasil yang masuk rapor mengubah rapor draf.
    queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
  };

  const data = results.data;
  const weights: UkkWeights | null = data?.weights ?? null;
  const students = data?.students ?? [];
  const closed = data?.event.status === 'closed';
  const canAssess = data?.canAssess ?? false;
  const readOnlyAll = closed || !canAssess;
  const frozen = (s: UkkStudent) => readOnlyAll || s.reportFinal;
  const bands = data?.bands ?? [];

  const build = buildItems(
    students.filter((s) => !frozen(s)),
    edits,
    weights,
  );
  const dirtyCount = build.items.length;
  const hasInvalid = build.invalid;
  const frozenCount = students.filter((s) => s.reportFinal).length;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/ukk/events/{id}/results', {
          params: { ...header, path: { id: event.id } },
          body: { items: build.items },
        }),
      ),
    onSuccess: () => {
      setEdits({});
      setError(null);
      setAttempted(false);
      toast.success(t('results.saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const retake = useMutation({
    mutationFn: async (studentId: string) =>
      unwrap(
        await api.POST('/v1/ukk/events/{id}/results/{studentId}/retake', {
          params: { ...header, path: { id: event.id, studentId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('results.retaken'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const numbering = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/ukk/events/{id}/numbers', { params: { ...header, path: { id: event.id } } }),
      ),
    onSuccess: (r) => {
      toast.success(
        r.numbered.length === 0
          ? t('results.numberNone')
          : t('results.numbered', { n: r.numbered.length, skipped: r.skipped }),
      );
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function trySave() {
    setAttempted(true);
    if (hasInvalid || dirtyCount === 0) return;
    save.mutate();
  }

  const setField = (s: UkkStudent, field: ScoreField, value: string) =>
    setEdits((prev) => ({ ...prev, [s.studentId]: { ...prev[s.studentId], [field]: value } }));
  const resetRow = (s: UkkStudent) =>
    setEdits((prev) => {
      const { [s.studentId]: _drop, ...rest } = prev;
      return rest;
    });

  function view(s: UkkStudent) {
    const d = edits[s.studentId];
    const dirty = !frozen(s) && isDirty(s, d);
    const live = liveResult(s, d, weights, bands);
    const a = lastAttempt(s);
    const final = dirty ? live.final : (a?.finalScore ?? null);
    const band = dirty
      ? live.band
        ? { label: live.band.label, competent: live.band.competent }
        : null
      : a?.bandLabel
        ? { label: a.bandLabel, competent: a.competent }
        : null;
    return { d, dirty, final, band, attemptNo: editingAttemptNo(s), a };
  }

  const bandChip = (band: { label: string; competent: boolean | null } | null) => {
    if (!band) return <span className="text-muted-foreground text-xs">{t('results.notScored')}</span>;
    return (
      <ToneBadge tone={band.competent === true ? 'emerald' : band.competent === false ? 'rose' : 'slate'}>
        {band.label}
      </ToneBadge>
    );
  };

  const scoreInput = (s: UkkStudent, field: ScoreField, idPrefix: string) => {
    const v = view(s);
    const value = fieldText(s, v.d, field);
    const bad = scoreInvalid(value);
    const label = t('results.scoreFor', { name: s.name, field: t(`results.${field}`) });
    // Dengan bobot, nilai akhir dihitung server: tampil sebagai angka, bukan isian.
    if (field === 'final' && weights) {
      return (
        <span className="text-base font-semibold tabular-nums">
          <span className="sr-only">{label}: </span>
          {v.final ?? '-'}
        </span>
      );
    }
    return (
      <Input
        id={`${idPrefix}-${s.studentId}-${field}`}
        className="h-11 w-full text-right tabular-nums md:h-8 md:w-24"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={bad || undefined}
        disabled={frozen(s)}
        value={value}
        onChange={(e) => setField(s, field, e.target.value)}
      />
    );
  };

  const dirtyBadge = (s: UkkStudent) => {
    return view(s).dirty ? (
      <ToneBadge tone="amber" dot={false}>
        {t('results.unsaved')}
      </ToneBadge>
    ) : null;
  };

  const retakeButton = (s: UkkStudent) => {
    const v = view(s);
    const maxed = (lastAttempt(s)?.attemptNo ?? 0) >= UKK_MAX_ATTEMPTS;
    if (frozen(s)) return null;
    return (
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            className="h-11 max-sm:w-full md:h-8"
            disabled={!canRetake(s, v.d, UKK_MAX_ATTEMPTS) || retake.isPending}
            title={maxed ? t('results.maxAttempts', { n: UKK_MAX_ATTEMPTS }) : undefined}
          >
            <RotateCcw className="size-4" aria-hidden /> {t('results.retake')}
          </Button>
        }
        title={t('results.retakeTitle')}
        description={t('results.retakeBody', { name: s.name })}
        confirmLabel={t('results.retake')}
        pending={retake.isPending}
        onConfirm={() => retake.mutateAsync(s.studentId)}
      />
    );
  };

  const history = (s: UkkStudent) => {
    const last = editingAttemptNo(s);
    const prev = s.attempts.filter((a) => a.attemptNo < last).sort((a, b) => a.attemptNo - b.attemptNo);
    if (prev.length === 0) return null;
    return (
      <ul className="text-muted-foreground grid gap-0.5 text-xs">
        {prev.map((a) => (
          <li key={a.attemptNo} className="break-words">
            {t('results.previous', {
              n: a.attemptNo,
              score: a.finalScore ?? '-',
              band: a.bandLabel ?? t('results.notScored'),
            })}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="grid gap-4 pb-2">
      {closed && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertDescription>{t('results.closedBanner')}</AlertDescription>
        </Alert>
      )}
      {!closed && data && !canAssess && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertDescription>{t('results.noAssessBanner')}</AlertDescription>
        </Alert>
      )}
      {frozenCount > 0 && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertDescription>{t('results.reportFinalBanner', { count: frozenCount })}</AlertDescription>
        </Alert>
      )}
      {data && (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {weights
              ? t('results.weightsHint', { practice: weights.practice, theory: weights.theory })
              : t('results.directHint')}{' '}
            {data.inReport ? t('results.inReportNote') : ''}
          </span>
        </p>
      )}

      {manage && data && students.length > 0 && (
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-11 max-sm:w-full md:h-8"
            disabled={numbering.isPending || dirtyCount > 0}
            onClick={() => numbering.mutate()}
          >
            <Hash className="size-4" aria-hidden /> {t('results.numberDocs')}
          </Button>
          <p className="text-muted-foreground mt-1 text-xs">{t('results.numberHint')}</p>
        </div>
      )}

      {results.isPending ? (
        <Skeleton className="h-48 rounded-xl" aria-busy />
      ) : results.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(results.error))}</AlertDescription>
        </Alert>
      ) : students.length === 0 ? (
        <EmptyPanel icon={Info} tone="violet" title={t('results.emptyTitle')} body={t('results.emptyBody')} />
      ) : (
        <>
          <ul className="grid gap-3 lg:hidden">
            {students.map((s) => {
              const v = view(s);
              return (
                <li
                  key={s.studentId}
                  className={cn(
                    'bg-card grid gap-3 rounded-xl border p-4',
                    v.dirty && 'ring-2 ring-amber-400/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading font-semibold break-words">{s.name}</p>
                      <p className="text-muted-foreground text-xs break-words">
                        {[s.className, s.nis].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ToneBadge tone="violet" dot={false}>
                      {t('results.attemptNo', { n: v.attemptNo })}
                    </ToneBadge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-xs" htmlFor={`m-${s.studentId}-practice`}>
                      <span className="text-muted-foreground">{t('results.practice')}</span>
                      {scoreInput(s, 'practice', 'm')}
                    </label>
                    <label className="grid gap-1 text-xs" htmlFor={`m-${s.studentId}-theory`}>
                      <span className="text-muted-foreground">{t('results.theory')}</span>
                      {scoreInput(s, 'theory', 'm')}
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {weights ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground text-xs">{t('results.final')}: </span>
                        <span className="font-semibold tabular-nums">{v.final ?? '-'}</span>
                      </p>
                    ) : (
                      <label
                        className="grid min-w-28 flex-1 gap-1 text-xs"
                        htmlFor={`m-${s.studentId}-final`}
                      >
                        <span className="text-muted-foreground">{t('results.final')}</span>
                        {scoreInput(s, 'final', 'm')}
                      </label>
                    )}
                    {bandChip(v.band)}
                    {dirtyBadge(s)}
                    {s.reportFinal && (
                      <ToneBadge tone="slate" dot={false}>
                        <Lock className="size-3" aria-hidden /> {t('results.reportFinal')}
                      </ToneBadge>
                    )}
                  </div>
                  {history(s)}
                  {!frozen(s) && (
                    <div className="flex flex-wrap gap-2">
                      {retakeButton(s)}
                      {v.dirty && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 max-sm:flex-1"
                          onClick={() => resetRow(s)}
                        >
                          <Undo2 className="size-4" aria-hidden /> {t('discard')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="bg-card hidden overflow-x-auto rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('results.student')}</TableHead>
                  <TableHead className="text-right">{t('results.practice')}</TableHead>
                  <TableHead className="text-right">{t('results.theory')}</TableHead>
                  <TableHead className="text-right">{t('results.final')}</TableHead>
                  <TableHead>{t('results.band')}</TableHead>
                  <TableHead>{t('results.attempt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => {
                  const v = view(s);
                  return (
                    <TableRow key={s.studentId} className={cn(v.dirty && 'bg-amber-50 dark:bg-amber-500/10')}>
                      <TableCell className="min-w-48">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {[s.className, s.nis].filter(Boolean).join(' · ')}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">{scoreInput(s, 'practice', 't')}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">{scoreInput(s, 'theory', 't')}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">{scoreInput(s, 'final', 't')}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {bandChip(v.band)}
                          {dirtyBadge(s)}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex flex-wrap items-center gap-2">
                          <ToneBadge tone="violet" dot={false}>
                            {t('results.attemptNo', { n: v.attemptNo })}
                          </ToneBadge>
                          {s.reportFinal && (
                            <ToneBadge tone="slate" dot={false}>
                              <Lock className="size-3" aria-hidden /> {t('results.reportFinal')}
                            </ToneBadge>
                          )}
                          {retakeButton(s)}
                        </div>
                        {history(s)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {!readOnlyAll && (
            <div className="bg-background/90 sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur">
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm">
                <Info className="size-4 shrink-0" aria-hidden />
                <span className="truncate" aria-live="polite">
                  {dirtyCount > 0 ? t('results.dirty', { n: dirtyCount }) : t('results.clean')}
                </span>
              </div>
              {error && (
                <span role="alert" className="text-destructive text-sm">
                  {error}
                </span>
              )}
              {attempted && hasInvalid && (
                <span aria-live="polite" className="text-destructive text-sm">
                  {t('results.invalid')}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-8"
                disabled={dirtyCount === 0 && Object.keys(edits).length === 0}
                onClick={() => {
                  setEdits({});
                  setError(null);
                  setAttempted(false);
                }}
              >
                <Undo2 className="size-4" aria-hidden /> {t('discard')}
              </Button>
              <Button
                type="button"
                className="h-11 md:h-8"
                disabled={dirtyCount === 0 || save.isPending}
                onClick={trySave}
              >
                <Save className="size-4" aria-hidden /> {t('results.save')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
