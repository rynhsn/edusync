'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, ShieldCheck, TriangleAlert, Wand2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ListSkeleton } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyPanel } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  buildChoiceBody,
  type CellState,
  cellKey,
  countChanges,
  indexCells,
  isChecked,
  isChoiceLocked,
  normalizeUnmatchedReason,
  stateOf,
  toggleDraft,
} from '@/lib/subject-choice';
import { ChoiceSummary } from './choice-summary';

const SOURCE_KEY = {
  choice: 'sourceChoice',
  religion: 'sourceReligion',
  arts: 'sourceArts',
  admin: 'sourceAdmin',
} as const;

interface ReligionResult {
  created: number;
  existing: number;
  unmatched: { studentId: string; studentName: string; religion: string | null; reason: string }[];
}

/** Matriks murid x mapel pilihan (tabel di layar lebar, kartu per murid di layar sempit) dan ringkasan aturan. */
export function ChoicesPanel({ classId, onGoSubjects }: { classId: string; onGoSubjects: () => void }) {
  const t = useTranslations('subjectChoices');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [semesterChoice, setSemesterChoice] = useState('');
  const [locked, setLocked] = useState<'save' | 'religion' | null>(null);
  const [religionResult, setReligionResult] = useState<ReligionResult | null>(null);

  const matrix = useQuery({
    queryKey: ['subject-choices', school.schoolId, classId, 'matrix'],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes/{id}/subject-choices', { params: { ...header, path: { id: classId } } }),
      ),
  });
  const summary = useQuery({
    queryKey: ['subject-choices', school.schoolId, classId, 'summary', semesterChoice],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes/{id}/subject-choices/summary', {
          params: {
            ...header,
            path: { id: classId },
            query: semesterChoice ? { semesterId: semesterChoice } : {},
          },
        }),
      ),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['subject-choices', school.schoolId, classId] });
    queryClient.invalidateQueries({ queryKey: ['subject-participation', school.schoolId, classId] });
    queryClient.invalidateQueries({ queryKey: ['student-subject-choices', school.schoolId] });
  };

  const cells = indexCells(matrix.data?.entries ?? []);
  const body = buildChoiceBody(cells, draft);
  const changeCount = countChanges(body);

  const warned = (warnings: { studentId: string }[]) => {
    const n = new Set(warnings.map((w) => w.studentId)).size;
    if (n > 0) toast.warning(t('savedWithWarnings', { count: n }));
    else toast.success(t('saved'));
  };

  const save = useMutation({
    mutationFn: async (override: boolean) =>
      unwrap(
        await api.PUT('/v1/classes/{id}/subject-choices', {
          params: { ...header, path: { id: classId } },
          body: buildChoiceBody(cells, draft, override),
        }),
      ),
    onSuccess: (res) => {
      setDraft(new Map());
      refresh();
      warned(res.warnings);
    },
  });
  const religion = useMutation({
    mutationFn: async (override: boolean) =>
      unwrap(
        await api.POST('/v1/classes/{id}/subject-choices/from-religion', {
          params: { ...header, path: { id: classId } },
          body: { override },
        }),
      ),
    onSuccess: (res) => {
      setReligionResult(res);
      refresh();
      warned(res.warnings);
    },
  });

  /** Galat terkunci: pemegang izin kurikulum boleh menimpa setelah konfirmasi; yang lain hanya diberi tahu. */
  function onFail(kind: 'save' | 'religion') {
    return (e: unknown) => {
      if (isChoiceLocked(e) && can('curriculum:manage')) setLocked(kind);
      else if (isChoiceLocked(e)) toast.error(t('lockedNoOverride'));
      else toast.error(te(errorKey(e)));
    };
  }
  async function overrideRun() {
    try {
      if (locked === 'save') await save.mutateAsync(true);
      else await religion.mutateAsync(true);
    } catch (e) {
      toast.error(te(errorKey(e)));
      throw e;
    }
  }

  if (matrix.isPending) return <ListSkeleton rows={5} stats={0} />;
  if (matrix.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(matrix.error))}</AlertDescription>
      </Alert>
    );
  }
  const m = matrix.data;
  const canManage = m.canManage;
  const busy = save.isPending || religion.isPending;
  const religionOffered = m.subjects.some((s) => s.religionVariant);

  if (m.subjects.length === 0) {
    return (
      <EmptyPanel
        icon={ListChecks}
        tone="violet"
        title={t('noChoiceSubjects')}
        body={t('noChoiceSubjectsBody')}
        action={
          <Button variant="outline" className="max-lg:min-h-11" onClick={onGoSubjects}>
            {t('goSubjects')}
          </Button>
        }
      />
    );
  }

  const set = (key: string, want: boolean) => setDraft((cur) => toggleDraft(cells, cur, key, want));
  const semesterName = new Map(m.semesters.map((s) => [s.id, s.name]));

  /** Kotak centang satu sel, dengan keterangan sumber atau tanda khusus. */
  const cellNote = (state: CellState) => {
    if (state.kind === 'partial') {
      return t('partialSemesters', {
        names: state.semesterIds.map((id) => semesterName.get(id) ?? '').join(', '),
      });
    }
    if (state.kind === 'year') return t(SOURCE_KEY[state.source]);
    return '';
  };
  const box = (studentName: string, subjectName: string, studentId: string, subjectId: string) => {
    const key = cellKey(studentId, subjectId);
    const state = stateOf(cells, key);
    return (
      <Checkbox
        id={`cell-${key}`}
        aria-label={`${studentName}: ${subjectName}`}
        checked={isChecked(cells, draft, key)}
        disabled={!canManage || busy || state.kind === 'partial'}
        onCheckedChange={(v) => set(key, v === true)}
      />
    );
  };
  const mismatchBadge = (key: string) => {
    const s = stateOf(cells, key);
    return s.kind !== 'none' && s.religionMismatch && !draft.has(key) ? (
      <span className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300">
        <TriangleAlert aria-hidden className="size-3.5" />
        {t('religionMismatch')}
      </span>
    ) : null;
  };

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('choicesIntro')}</p>
      {!canManage && (
        <Alert>
          <ShieldCheck aria-hidden />
          <AlertDescription>{t('readOnlyBody')}</AlertDescription>
        </Alert>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="max-lg:min-h-11 max-sm:w-full"
            disabled={changeCount === 0 || busy}
            onClick={() => save.mutate(false, { onError: onFail('save') })}
          >
            {changeCount > 0 ? t('saveWithCount', { count: changeCount }) : t('save')}
          </Button>
          {changeCount > 0 && (
            <Button
              variant="ghost"
              className="max-lg:min-h-11"
              disabled={busy}
              onClick={() => setDraft(new Map())}
            >
              {t('discard')}
            </Button>
          )}
          {religionOffered && (
            <Button
              variant="outline"
              className="max-lg:min-h-11 max-sm:w-full sm:ml-auto"
              disabled={busy}
              onClick={() => religion.mutate(false, { onError: onFail('religion') })}
            >
              <Wand2 aria-hidden className="size-4" />
              {t('fillReligion')}
            </Button>
          )}
        </div>
      )}
      {canManage && religionOffered && (
        <p className="text-muted-foreground -mt-2 text-xs">{t('fillReligionHint')}</p>
      )}

      {religionResult && (
        <Alert>
          <Wand2 aria-hidden />
          <AlertDescription className="grid gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-foreground text-sm">
                {t('religionResult', { created: religionResult.created, existing: religionResult.existing })}
              </p>
              <button
                type="button"
                aria-label={t('dismiss')}
                className="text-muted-foreground hover:text-foreground -m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md"
                onClick={() => setReligionResult(null)}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {religionResult.unmatched.length > 0 && (
              <div>
                <p className="text-foreground text-sm font-medium">{t('unmatchedTitle')}</p>
                <ul className="mt-1 grid gap-1 text-sm">
                  {religionResult.unmatched.map((u) => (
                    <li key={u.studentId}>
                      <span className="text-foreground font-medium">{u.studentName}</span>
                      {': '}
                      {t(`reason_${normalizeUnmatchedReason(u.reason)}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {m.students.length === 0 ? (
        <EmptyPanel icon={ListChecks} tone="violet" title={t('noStudents')} body={t('noStudentsBody')} />
      ) : (
        <>
          <div className="bg-card hidden overflow-x-auto rounded-2xl border lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="bg-card sticky left-0 z-10 min-w-48 px-3 py-2 font-medium">
                    {t('colStudent')}
                  </th>
                  {m.subjects.map((s) => (
                    <th key={s.subjectId} scope="col" className="min-w-28 px-2 py-2 text-center font-medium">
                      <span className="line-clamp-2">{s.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.students.map((st) => (
                  <tr key={st.id} className="border-b last:border-0">
                    <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-2 text-left font-normal">
                      <span className="block font-medium">{st.name}</span>
                      {st.nis && <span className="text-muted-foreground block text-xs">{st.nis}</span>}
                    </th>
                    {m.subjects.map((s) => {
                      const key = cellKey(st.id, s.subjectId);
                      const state = stateOf(cells, key);
                      const note = draft.has(key) ? '' : cellNote(state);
                      return (
                        <td key={s.subjectId} className="px-2 py-1.5 text-center align-top">
                          <div className="grid justify-items-center gap-0.5">
                            {box(st.name, s.name, st.id, s.subjectId)}
                            {note && <span className="text-muted-foreground text-xs">{note}</span>}
                            {mismatchBadge(key)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 lg:hidden">
            {m.students.map((st) => (
              <li key={st.id} className="bg-card rounded-2xl border">
                <p className="border-b px-3 py-2 text-sm font-medium">
                  {st.name}
                  {st.nis && <span className="text-muted-foreground font-normal"> · {st.nis}</span>}
                </p>
                <ul className="divide-y">
                  {m.subjects.map((s) => {
                    const key = cellKey(st.id, s.subjectId);
                    const state = stateOf(cells, key);
                    const note = draft.has(key) ? '' : cellNote(state);
                    return (
                      <li key={s.subjectId}>
                        <label
                          htmlFor={`cell-${key}`}
                          className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 has-disabled:cursor-default"
                        >
                          {box(st.name, s.name, st.id, s.subjectId)}
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="text-sm break-words">{s.name}</span>
                            {(note || mismatchBadge(key)) && (
                              <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                                {note}
                                {mismatchBadge(key)}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {summary.isPending && <ListSkeleton rows={2} stats={0} />}
      {summary.data && (
        <ChoiceSummary
          summary={summary.data}
          semesters={m.semesters}
          semesterId={semesterChoice || summary.data.semesterId || ''}
          onSemester={setSemesterChoice}
        />
      )}
      {summary.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(summary.error))}</AlertDescription>
        </Alert>
      )}

      <ConfirmDialog
        open={locked !== null}
        onOpenChange={(o) => !o && setLocked(null)}
        title={t('lockedTitle')}
        description={t('lockedBody')}
        confirmLabel={t('lockedConfirm')}
        destructive
        pending={busy}
        onConfirm={overrideRun}
      />
    </div>
  );
}
