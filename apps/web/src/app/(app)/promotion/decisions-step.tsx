'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock, NotebookPen, Save, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FieldError } from '@/components/form-field-error';
import { ListSkeleton, REVEAL, SearchBox } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, StatCard, StatGrid, TONES, type Tone, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  buildSavePayload,
  type Choices,
  chunk,
  type Decision,
  type Details,
  detailsChanged,
  effectiveDetails,
  filterStudents,
  initialChoices,
  invalidDetailsFor,
  isBlocked,
  isClassOpen,
  levelUnknownClasses,
  MAX_DETAIL_LENGTH,
  missingByClass,
  optionsFor,
  optionsForStudent,
  type PromotionClass,
  type PromotionStudent,
  SAVE_CHUNK,
  saveBlockers,
  setClassDecision,
  setClassMeetingDate,
  setDetail,
  summarize,
} from './promotion-logic';
import { StepError } from './step-error';

const DECISION_TONE: Record<Decision, Tone> = { promote: 'emerald', retain: 'amber', graduate: 'violet' };

/** Data keputusan satu tahun sumber beserta pilihan yang sedang diedit; dipakai bersama oleh langkah 3 dan 4. */
export function useDecisions(sourceId: string, enabled: boolean) {
  const t = useTranslations('promotion');
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const key = ['promotions', school.schoolId, sourceId];
  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!sourceId,
    // Pilihan yang belum disimpan tidak boleh tertimpa data segar saat jendela kembali difokuskan.
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/promotions', {
          params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
        }),
      ),
  });
  const [choices, setChoices] = useState<Choices>({});
  const [details, setDetails] = useState<Details>({});
  const data = query.data;
  useEffect(() => {
    if (data) {
      setChoices(initialChoices(data.classes));
      setDetails({});
    }
  }, [data]);

  const classes: PromotionClass[] = data?.classes ?? [];
  const summary = summarize(classes, choices, details);
  const blockers = saveBlockers(classes, choices, details);

  const save = useMutation({
    mutationFn: async () => {
      let saved = 0;
      for (const part of chunk(buildSavePayload(classes, choices, details), SAVE_CHUNK)) {
        saved += unwrap(
          await api.PUT('/v1/academic-years/{id}/promotions', {
            params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
            body: { decisions: part },
          }),
        ).saved;
      }
      return saved;
    },
    onSuccess: (saved) => toast.success(t('saved', { count: saved })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { query, classes, choices, setChoices, details, setDetails, summary, blockers, save };
}

export type DecisionsState = ReturnType<typeof useDecisions>;

/** Catatan keputusan satu siswa: alasan, tindak lanjut, dan tanggal musyawarah. Semuanya opsional. */
function DetailsPanel({
  student,
  details,
  setDetails,
}: {
  student: PromotionStudent;
  details: Details;
  setDetails: (fn: (d: Details) => Details) => void;
}) {
  const t = useTranslations('promotion');
  const d = effectiveDetails(student, details);
  const bad = invalidDetailsFor(d);
  const id = `promo-${student.studentId}`;
  return (
    <div className="bg-muted/30 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${id}-reason`}>{t('detailReason')}</Label>
        <Textarea
          id={`${id}-reason`}
          rows={2}
          maxLength={MAX_DETAIL_LENGTH}
          aria-invalid={bad.includes('reason')}
          value={d.reason}
          onChange={(e) => setDetails((cur) => setDetail(cur, student.studentId, 'reason', e.target.value))}
        />
        <p className="text-muted-foreground text-xs">{t('detailReasonHint')}</p>
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${id}-followup`}>{t('detailFollowUp')}</Label>
        <Textarea
          id={`${id}-followup`}
          rows={2}
          maxLength={MAX_DETAIL_LENGTH}
          aria-invalid={bad.includes('followUp')}
          value={d.followUp}
          onChange={(e) => setDetails((cur) => setDetail(cur, student.studentId, 'followUp', e.target.value))}
        />
        <p className="text-muted-foreground text-xs">{t('detailFollowUpHint')}</p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${id}-meeting`}>{t('detailMeetingDate')}</Label>
        <DatePicker
          id={`${id}-meeting`}
          className="h-11 md:h-8"
          value={d.meetingDate}
          clearable
          aria-invalid={bad.includes('meetingDate')}
          onChange={(v) => setDetails((cur) => setDetail(cur, student.studentId, 'meetingDate', v))}
        />
        {bad.includes('meetingDate') && (
          <FieldError id={`${id}-meeting-error`} issue={{ code: 'dateInvalid' }} />
        )}
      </div>
    </div>
  );
}

function StudentRow({
  cls,
  student,
  choice,
  details,
  setChoices,
  setDetails,
}: {
  cls: PromotionClass;
  student: PromotionStudent;
  choice: Decision | undefined;
  details: Details;
  setChoices: (fn: (c: Choices) => Choices) => void;
  setDetails: (fn: (d: Details) => Details) => void;
}) {
  const t = useTranslations('promotion');
  const [open, setOpen] = useState(false);
  const options = optionsForStudent(cls, student);
  const label: Record<Decision, string> = {
    promote: t('decisionPromote'),
    retain: t('decisionRetain'),
    graduate: t('decisionGraduate'),
  };
  const undecided = !student.applied && !choice;
  const d = effectiveDetails(student, details);
  const hasNotes = d.reason.trim() !== '' || d.followUp.trim() !== '' || d.meetingDate !== '';
  const changedNotes = detailsChanged(student, details);

  return (
    <li className={cn('grid gap-2 px-4 py-2.5', undecided && 'border-l-4 border-l-amber-500 bg-amber-500/5')}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{student.name}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {student.nis ?? '-'}
            {undecided && (
              <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">{t('undecided')}</span>
            )}
          </p>
        </div>
        {student.applied ? (
          <span className="flex items-center gap-2">
            {student.decision && (
              <ToneBadge tone={DECISION_TONE[student.decision]}>{label[student.decision]}</ToneBadge>
            )}
            <ToneBadge tone="slate" dot={false}>
              <Lock className="size-3" aria-hidden /> {t('applied')}
            </ToneBadge>
          </span>
        ) : (
          <fieldset className="bg-muted/50 m-0 flex w-full min-w-0 rounded-lg border p-0.5 sm:inline-flex sm:w-auto">
            <legend className="sr-only">{t('decisionFor', { name: student.name })}</legend>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={choice === o}
                onClick={() => setChoices((c) => ({ ...c, [student.studentId]: o }))}
                className={cn(
                  'focus-visible:ring-ring/50 flex-1 rounded-md px-3 py-1 text-xs font-medium max-sm:min-h-11 sm:flex-none transition-colors outline-none focus-visible:ring-[3px]',
                  choice === o ? TONES[DECISION_TONE[o]].solid : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {label[o]}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      {!student.applied && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`promo-${student.studentId}-notes`}
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 text-xs font-medium outline-none focus-visible:ring-[3px] md:min-h-7"
          >
            <NotebookPen className="size-3.5" aria-hidden />
            {t('notesToggle')}
            {hasNotes && (
              <ToneBadge tone={changedNotes ? 'amber' : 'sky'} dot={false}>
                {changedNotes ? t('notesUnsaved') : t('notesFilled')}
              </ToneBadge>
            )}
          </button>
          <div id={`promo-${student.studentId}-notes`} hidden={!open}>
            {open && <DetailsPanel student={student} details={details} setDetails={setDetails} />}
          </div>
        </>
      )}
    </li>
  );
}

function ClassCard({
  cls,
  students,
  open,
  onToggle,
  onInteract,
  missing,
  choices,
  details,
  setChoices: setChoicesRaw,
  setDetails,
}: {
  cls: PromotionClass;
  students: PromotionStudent[];
  open: boolean;
  onToggle: () => void;
  /** Dipanggil saat pengguna mengubah keputusan di kelas ini, supaya kelas tidak terlipat sendiri. */
  onInteract: () => void;
  missing: number;
  choices: Choices;
  details: Details;
  setChoices: (fn: (c: Choices) => Choices) => void;
  setDetails: (fn: (d: Details) => Details) => void;
}) {
  const t = useTranslations('promotion');
  const options = optionsFor(cls);
  const editable = cls.students.filter((s) => !s.applied).length;
  const [bulkDate, setBulkDate] = useState('');
  const setChoices = (fn: (c: Choices) => Choices) => {
    onInteract();
    setChoicesRaw(fn);
  };
  const bulkLabel: Record<Decision, string> = {
    promote: t('allPromote'),
    retain: t('allRetain'),
    graduate: t('allGraduate'),
  };
  const panelId = `promo-class-${cls.classId}`;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="bg-card overflow-hidden rounded-2xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="focus-visible:ring-ring/50 -ml-2 flex min-h-11 min-w-0 flex-1 basis-48 items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-[3px]"
        >
          <Chevron className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-heading block font-semibold">{cls.name}</span>
            <span className="text-muted-foreground block text-xs">
              {cls.isFinalLevel
                ? t('classFinal', { level: cls.level, count: cls.students.length })
                : cls.levelUnknown
                  ? t('classUnknown', { level: cls.level, count: cls.students.length })
                  : t('classMeta', {
                      level: cls.level,
                      next: cls.nextLevel ?? '-',
                      count: cls.students.length,
                    })}
            </span>
          </span>
          {missing > 0 && (
            <ToneBadge tone="amber" dot={false}>
              {t('classMissing', { count: missing })}
            </ToneBadge>
          )}
          {cls.levelUnknown && (
            <ToneBadge tone="rose" dot={false}>
              {t('levelUnknownBadge')}
            </ToneBadge>
          )}
        </button>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Button
              key={o}
              size="sm"
              variant="outline"
              className="max-sm:h-11"
              disabled={editable === 0}
              onClick={() => setChoices((c) => setClassDecision(cls, c, o))}
            >
              {bulkLabel[o]}
            </Button>
          ))}
        </div>
      </div>
      <div id={panelId} hidden={!open} className="border-t">
        {open && (
          <>
            {cls.levelUnknown && (
              <p className="bg-rose-500/5 px-4 py-2 text-xs text-rose-800 dark:text-rose-200">
                {t('levelUnknownNote', { level: cls.level })}{' '}
                <Link href="/school-settings" className="font-medium underline underline-offset-2">
                  {t('levelsLink')}
                </Link>
              </p>
            )}
            {cls.isFinalLevel && (
              <p className="bg-violet-500/5 px-4 py-2 text-xs text-violet-800 dark:text-violet-200">
                {t('classFinalNote')}
              </p>
            )}
            {editable > 0 && (
              <div className="flex flex-wrap items-end gap-2 border-b px-4 py-3">
                <div className="grid min-w-0 flex-1 basis-48 gap-1.5">
                  <Label htmlFor={`${panelId}-date`} className="text-xs">
                    {t('classMeetingDate')}
                  </Label>
                  <DatePicker
                    id={`${panelId}-date`}
                    className="h-11 md:h-8"
                    value={bulkDate}
                    clearable
                    onChange={setBulkDate}
                  />
                </div>
                <Button
                  variant="outline"
                  className="max-sm:h-11"
                  disabled={bulkDate === ''}
                  onClick={() => setDetails((cur) => setClassMeetingDate(cls, cur, bulkDate))}
                >
                  {t('classMeetingApply')}
                </Button>
              </div>
            )}
            {cls.students.length === 0 ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{t('classEmpty')}</p>
            ) : students.length === 0 ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{t('searchNone')}</p>
            ) : (
              <ul className="divide-y">
                {students.map((s) => (
                  <StudentRow
                    key={s.studentId}
                    cls={cls}
                    student={s}
                    choice={choices[s.studentId]}
                    details={details}
                    setChoices={setChoices}
                    setDetails={setDetails}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function DecisionsStep({ state }: { state: DecisionsState }) {
  const t = useTranslations('promotion');
  const te = useTranslations();
  const { query, classes, choices, setChoices, details, setDetails, summary, blockers, save } = state;
  const [q, setQ] = useState('');
  const [openByUser, setOpenByUser] = useState<Record<string, boolean>>({});
  const missing = missingByClass(classes, choices);
  const hasFinal = classes.some((c) => c.isFinalLevel);
  const unknownLevels = levelUnknownClasses(classes);
  const blocked = isBlocked(blockers);
  const searching = q.trim() !== '';
  const shown = classes
    .map((cls) => ({ cls, students: filterStudents(cls.students, q) }))
    .filter(({ students }) => !searching || students.length > 0);
  const isOpen = (cls: PromotionClass) =>
    isClassOpen({
      userChoice: openByUser[cls.classId],
      totalStudents: summary.total,
      missing: missing.get(cls.classId) ?? 0,
      searching,
    });
  const setAll = (value: boolean) =>
    setOpenByUser(Object.fromEntries(classes.map((c) => [c.classId, value])));

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="promo-decisions-title">
      <div>
        <h2 id="promo-decisions-title" className="font-heading text-lg font-semibold">
          {t('decisionsTitle')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('decisionsHelp')}</p>
      </div>

      {query.isPending && <ListSkeleton rows={4} stats={4} />}
      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(query.error))}</AlertDescription>
        </Alert>
      )}

      {query.data && classes.length === 0 && (
        <EmptyPanel icon={Lock} tone="slate" title={t('noClasses')} body={t('noClassesBody')} />
      )}

      {query.data && classes.length > 0 && (
        <>
          {hasFinal && (
            <Alert>
              <TriangleAlert className="size-4" aria-hidden />
              <AlertTitle>{t('graduationWarnTitle')}</AlertTitle>
              <AlertDescription>{t('graduationWarnBody')}</AlertDescription>
            </Alert>
          )}

          {unknownLevels.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden />
              <AlertTitle>{t('levelUnknownTitle', { count: unknownLevels.length })}</AlertTitle>
              <AlertDescription>
                {t('levelUnknownBody')}{' '}
                <Link href="/school-settings" className="font-medium underline underline-offset-2">
                  {t('levelsLink')}
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <StatGrid>
            <StatCard tone="emerald" label={t('decisionPromote')} value={summary.promote} />
            <StatCard tone="amber" label={t('decisionRetain')} value={summary.retain} />
            <StatCard tone="violet" label={t('decisionGraduate')} value={summary.graduate} />
            {summary.undecided > 0 && (
              <StatCard
                tone="rose"
                label={t('statUndecided')}
                value={summary.undecided}
                hint={t('statUndecidedHint')}
              />
            )}
            <StatCard
              tone="slate"
              label={t('statApplied')}
              value={summary.applied}
              hint={t('statAppliedHint')}
            />
          </StatGrid>

          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} placeholder={t('searchStudents')} onChange={setQ} />
            <Button variant="outline" className="max-sm:h-11" onClick={() => setAll(true)}>
              {t('expandAll')}
            </Button>
            <Button variant="outline" className="max-sm:h-11" onClick={() => setAll(false)}>
              {t('collapseAll')}
            </Button>
          </div>

          {searching && shown.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('searchNone')}</p>
          )}

          <ul className="grid gap-4">
            {shown.map(({ cls, students }) => (
              <ClassCard
                key={cls.classId}
                cls={cls}
                students={students}
                open={isOpen(cls)}
                onToggle={() => setOpenByUser((cur) => ({ ...cur, [cls.classId]: !isOpen(cls) }))}
                onInteract={() =>
                  setOpenByUser((cur) =>
                    cur[cls.classId] === undefined ? { ...cur, [cls.classId]: true } : cur,
                  )
                }
                missing={missing.get(cls.classId) ?? 0}
                choices={choices}
                details={details}
                setChoices={setChoices}
                setDetails={setDetails}
              />
            ))}
          </ul>

          {save.isError && <StepError error={save.error} />}

          <div className="bg-card sticky bottom-3 z-10 grid gap-2 rounded-2xl border p-3 shadow-sm">
            {blockers.missingFinal > 0 && (
              <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {t('blockedMissingFinal', { count: blockers.missingFinal })}
              </p>
            )}
            {blockers.invalidDetails > 0 && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {t('blockedInvalidDetails', { count: blockers.invalidDetails })}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" aria-live="polite">
                {summary.unsaved > 0 ? (
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {t('unsaved', { count: summary.unsaved })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('allSaved')}</span>
                )}
              </p>
              <Button
                disabled={summary.unsaved === 0 || blocked || save.isPending}
                onClick={() => save.mutate()}
              >
                <Save className="size-4" aria-hidden /> {save.isPending ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
