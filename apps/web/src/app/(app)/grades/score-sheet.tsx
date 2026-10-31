'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, PersonCell, TONES, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

interface Row {
  value: string;
  note: string;
}

/** Nilai terketik menjadi angka; null bila kosong, NaN bila bukan angka. Koma desimal diterima. */
const parseValue = (text: string) => {
  const s = text.trim().replace(',', '.');
  return s === '' ? null : Number(s);
};

/** Lembar input nilai satu penilaian: satu baris per siswa, Enter atau panah bawah pindah ke baris berikutnya. */
export function ScoreSheet({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dirty, setDirty] = useState(false);

  const key = ['assessment-scores', school.schoolId, assessmentId];
  const sheet = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/assessments/{id}/scores', { params: { ...header, path: { id: assessmentId } } }),
      ),
  });
  useEffect(() => {
    if (!sheet.data) return;
    setRows(
      Object.fromEntries(
        sheet.data.students.map((s) => [
          s.studentId,
          { value: s.value === null ? '' : String(s.value), note: s.note ?? '' },
        ]),
      ),
    );
    setDirty(false);
  }, [sheet.data]);

  const max = sheet.data?.assessment.maxScore ?? 0;
  const invalid = (text: string) => {
    const v = parseValue(text);
    return v !== null && (!Number.isFinite(v) || v < 0 || v > max);
  };
  const anyInvalid = Object.values(rows).some((r) => invalid(r.value));

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/assessments/{id}/scores', {
          params: { ...header, path: { id: assessmentId } },
          body: {
            records: Object.entries(rows).map(([studentId, r]) => ({
              studentId,
              value: parseValue(r.value),
              note: r.note.trim() || null,
            })),
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('scoresSaved'));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['assessments', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-48 w-full" />;
  if (!sheet.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(sheet.error))}</AlertDescription>
      </Alert>
    );
  const { assessment, canInput, students } = sheet.data;

  const patch = (id: string, p: Partial<Row>) => {
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { value: '', note: '' }), ...p } }));
    setDirty(true);
  };
  /** Enter atau panah bawah/atas memindahkan fokus ke isian nilai di baris lain. */
  const move = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    const delta = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-score-row="${index + delta}"]`);
    next?.focus();
    next?.select();
  };
  const filled = Object.values(rows).filter((r) => r.value.trim() !== '').length;

  const pct = students.length ? (filled / students.length) * 100 : 0;

  return (
    <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="bg-card grid gap-3 rounded-2xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button size="sm" variant="ghost" onClick={onClose}>
              <ArrowLeft className="size-4" /> {t('back')}
            </Button>
            <div className="min-w-0">
              <div className="font-heading truncate font-semibold">{assessment.title}</div>
              <div className="text-muted-foreground text-sm">
                {formatCalendarDate(locale, assessment.date)} · {t('maxScore')}: {assessment.maxScore}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ToneBadge tone={filled >= students.length && students.length > 0 ? 'emerald' : 'amber'}>
              {t('filledOf', { filled, total: students.length })}
            </ToneBadge>
            {canInput && (
              <Button disabled={!dirty || anyInvalid || save.isPending} onClick={() => save.mutate()}>
                {t('save')}
              </Button>
            )}
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={students.length}
          aria-valuenow={filled}
          aria-label={t('filledHeader')}
          className="bg-muted h-1.5 overflow-hidden rounded-full"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              pct >= 100 ? TONES.emerald.bar : TONES.violet.bar,
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {!canInput && (
        <Alert>
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      )}
      {students.length === 0 ? (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noStudentsTitle')}
          body={t('noStudents')}
        />
      ) : (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div
            aria-hidden
            className="bg-muted/50 text-muted-foreground hidden grid-cols-[2rem_minmax(0,1.4fr)_9rem_minmax(0,1fr)] items-center gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid"
          >
            <span>#</span>
            <span>{t('student')}</span>
            <span>{t('score')}</span>
            <span>{t('note')}</span>
          </div>
          <ul className="divide-y">
            {students.map((s, i) => {
              const row = rows[s.studentId] ?? { value: '', note: '' };
              const bad = invalid(row.value);
              const empty = row.value.trim() === '';
              return (
                <li
                  key={s.studentId}
                  className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.4fr)_9rem_minmax(0,1fr)]"
                >
                  <span className="text-muted-foreground hidden pt-2 text-sm tabular-nums md:block">
                    {i + 1}
                  </span>
                  <PersonCell name={s.name} sub={s.nis} className="md:pt-0.5" />
                  <div>
                    <Input
                      data-score-row={i}
                      inputMode="decimal"
                      disabled={!canInput}
                      aria-label={`${t('score')} ${s.name}`}
                      aria-invalid={bad}
                      placeholder={`/ ${max}`}
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        bad && 'text-destructive',
                        !bad && !empty && 'border-violet-400/60 bg-violet-50/60 dark:bg-violet-500/10',
                      )}
                      value={row.value}
                      onChange={(e) => patch(s.studentId, { value: e.target.value })}
                      onKeyDown={(e) => move(e, i)}
                    />
                    {bad && <p className="text-destructive mt-1 text-xs">{t('outOfRange', { max })}</p>}
                  </div>
                  <Input
                    className="col-span-2 md:col-span-1"
                    disabled={!canInput}
                    aria-label={`${t('note')} ${s.name}`}
                    placeholder={t('note')}
                    maxLength={200}
                    value={row.note}
                    onChange={(e) => patch(s.studentId, { note: e.target.value })}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {dirty && canInput && (
        <div
          role="status"
          className="bg-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          <p className="text-muted-foreground text-sm">{t('unsaved')}</p>
          <Button disabled={anyInvalid || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
