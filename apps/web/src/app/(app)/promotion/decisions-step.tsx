'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock, NotebookPen, Save, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FieldError, TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton, REVEAL, SearchBox } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, StatCard, StatGrid, TONES, type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { MeetingListItem } from '@/lib/council-meeting';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
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
  isFrozen,
  levelUnknownClasses,
  MAX_DETAIL_LENGTH,
  markLocked,
  missingByClass,
  needsRetainTarget,
  optionsFor,
  optionsForStudent,
  type PromotionClass,
  type PromotionStudent,
  SAVE_CHUNK,
  sameLevelTargets,
  saveBlockers,
  setClassDecision,
  setClassMeetingDate,
  setClassMeetingId,
  setDetail,
  summarize,
  type TargetClass,
} from './promotion-logic';
import { StepError } from './step-error';

const DECISION_TONE: Record<Decision, Tone> = { promote: 'emerald', retain: 'amber', graduate: 'violet' };

/** Data keputusan satu tahun sumber beserta pilihan yang sedang diedit; dipakai bersama oleh langkah 3 dan 4. */
export function useDecisions(sourceId: string, enabled: boolean, targetId = '') {
  const t = useTranslations('promotion');
  const { school, can } = useSchool();
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

  // Berita acara tahun sumber (hanya untuk pemegang hak baca) dan kelas tahun tujuan (kelas tujuan tinggal kelas tingkat akhir).
  const meetingsQuery = useQuery({
    queryKey: ['council-meetings', school.schoolId, sourceId],
    enabled: enabled && !!sourceId && can('report_card:read_all'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/council-meetings', {
          params: { header: schoolHeader(school.schoolId), query: { academicYearId: sourceId } },
        }),
      ),
  });
  const meetings: MeetingListItem[] = meetingsQuery.data?.items ?? [];
  const targetsQuery = useQuery({
    queryKey: ['classes', school.schoolId, targetId],
    enabled: enabled && !!targetId && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { header: schoolHeader(school.schoolId), query: { academicYearId: targetId } },
        }),
      ),
  });
  const targets: TargetClass[] = targetsQuery.data ?? [];
  const finalIds = useMemo(
    () => new Set((meetingsQuery.data?.items ?? []).filter((m) => m.status === 'final').map((m) => m.id)),
    [meetingsQuery.data],
  );
  const classes: PromotionClass[] = useMemo(
    () => markLocked(data?.classes ?? [], finalIds),
    [data, finalIds],
  );
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

  return {
    query,
    classes,
    choices,
    setChoices,
    details,
    setDetails,
    summary,
    blockers,
    save,
    meetings,
    canMeetings: can('report_card:read_all'),
    targets,
    targetsReady: targetsQuery.isSuccess,
  };
}

export type DecisionsState = ReturnType<typeof useDecisions>;

/** Catatan keputusan satu siswa: alasan, tindak lanjut, dan tanggal musyawarah. Semuanya opsional. */
function DetailsPanel({
  student,
  details,
  setDetails,
  meetings,
  canMeetings,
}: {
  student: PromotionStudent;
  details: Details;
  setDetails: (fn: (d: Details) => Details) => void;
  meetings: MeetingListItem[];
  canMeetings: boolean;
}) {
  const t = useTranslations('promotion');
  const locale = useLocale() as Locale;
  const d = effectiveDetails(student, details);
  const choosable = meetings.filter((m) => m.status === 'draft' || m.id === d.meetingId);
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
      {canMeetings && (
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-minutes`}>{t('detailMeeting')}</Label>
          {choosable.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('detailMeetingEmpty')}{' '}
              <Link href="/promotion/minutes" className="font-medium underline underline-offset-2">
                {t('minutesCreate')}
              </Link>
            </p>
          ) : (
            <>
              <SelectField
                id={`${id}-minutes`}
                className={TOUCH_SELECT}
                value={d.meetingId}
                onChange={(e) =>
                  setDetails((cur) => setDetail(cur, student.studentId, 'meetingId', e.target.value))
                }
              >
                <option value="">{t('detailMeetingNone')}</option>
                {choosable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {formatCalendarDate(locale, m.heldOn)}
                  </option>
                ))}
              </SelectField>
              <p className="text-muted-foreground text-xs">{t('detailMeetingHint')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Pilihan data berita acara dan kelas tahun tujuan yang dibagikan ke baris siswa. */
interface RowContext {
  meetings: MeetingListItem[];
  canMeetings: boolean;
  targets: TargetClass[];
  targetsReady: boolean;
}

function StudentRow({
  cls,
  student,
  choice,
  details,
  setChoices,
  setDetails,
  ctx,
}: {
  cls: PromotionClass;
  student: PromotionStudent;
  choice: Decision | undefined;
  details: Details;
  setChoices: (fn: (c: Choices) => Choices) => void;
  setDetails: (fn: (d: Details) => Details) => void;
  ctx: RowContext;
}) {
  const t = useTranslations('promotion');
  const [open, setOpen] = useState(false);
  const options = optionsForStudent(cls, student);
  const label: Record<Decision, string> = {
    promote: t('decisionPromote'),
    retain: t('decisionRetain'),
    graduate: t('decisionGraduate'),
  };
  const frozen = isFrozen(student);
  const undecided = !frozen && !choice;
  const d = effectiveDetails(student, details);
  const hasNotes =
    d.reason.trim() !== '' || d.followUp.trim() !== '' || d.meetingDate !== '' || d.meetingId !== '';
  const retainTargets = needsRetainTarget(cls, choice) ? sameLevelTargets(cls, ctx.targets) : null;
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
        {frozen ? (
          <span className="flex items-center gap-2">
            {student.decision && (
              <ToneBadge tone={DECISION_TONE[student.decision]}>{label[student.decision]}</ToneBadge>
            )}
            <ToneBadge tone="slate" dot={false}>
              <Lock className="size-3" aria-hidden /> {student.applied ? t('applied') : t('lockedBadge')}
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
      {!frozen && retainTargets && ctx.targetsReady && (
        <div className="grid gap-1.5 sm:max-w-md">
          <Label htmlFor={`promo-${student.studentId}-target`} className="text-xs">
            {t('retainTargetLabel')}
          </Label>
          {retainTargets.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('retainTargetNone', { level: cls.level })}
            </p>
          ) : (
            <>
              <SelectField
                id={`promo-${student.studentId}-target`}
                className={TOUCH_SELECT}
                value={d.toClassId}
                onChange={(e) =>
                  setDetails((cur) => setDetail(cur, student.studentId, 'toClassId', e.target.value))
                }
              >
                <option value="">{t('retainTargetAuto')}</option>
                {retainTargets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <p className="text-muted-foreground text-xs">{t('retainTargetHint')}</p>
            </>
          )}
        </div>
      )}
      {frozen && !student.applied && <p className="text-muted-foreground text-xs">{t('lockedHint')}</p>}
      {!frozen && (
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
            {open && (
              <DetailsPanel
                student={student}
                details={details}
                setDetails={setDetails}
                meetings={ctx.meetings}
                canMeetings={ctx.canMeetings}
              />
            )}
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
  ctx,
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
  ctx: RowContext;
}) {
  const t = useTranslations('promotion');
  const locale = useLocale() as Locale;
  const options = optionsFor(cls);
  const editable = cls.students.filter((s) => !isFrozen(s)).length;
  const [bulkDate, setBulkDate] = useState('');
  const [bulkMeeting, setBulkMeeting] = useState('');
  const draftMeetings = ctx.meetings.filter((m) => m.status === 'draft');
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
                {ctx.canMeetings && draftMeetings.length > 0 && (
                  <>
                    <div className="grid min-w-0 flex-1 basis-48 gap-1.5">
                      <Label htmlFor={`${panelId}-minutes`} className="text-xs">
                        {t('classMeetingLink')}
                      </Label>
                      <SelectField
                        id={`${panelId}-minutes`}
                        className={TOUCH_SELECT}
                        value={bulkMeeting}
                        placeholder={t('detailMeetingNone')}
                        onChange={(e) => setBulkMeeting(e.target.value)}
                      >
                        {draftMeetings.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title} · {formatCalendarDate(locale, m.heldOn)}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <Button
                      variant="outline"
                      className="max-sm:h-11"
                      disabled={bulkMeeting === ''}
                      onClick={() => setDetails((cur) => setClassMeetingId(cls, cur, bulkMeeting))}
                    >
                      {t('classMeetingLinkApply')}
                    </Button>
                  </>
                )}
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
                    ctx={ctx}
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
  const ctx: RowContext = {
    meetings: state.meetings,
    canMeetings: state.canMeetings,
    targets: state.targets,
    targetsReady: state.targetsReady,
  };
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
        {state.canMeetings && (
          <p className="mt-1 max-w-2xl text-sm">
            <Link href="/promotion/minutes" className="font-medium underline underline-offset-2">
              {t('minutesLink')}
            </Link>{' '}
            <span className="text-muted-foreground">{t('minutesLinkHint')}</span>
          </p>
        )}
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
            {summary.locked > 0 && (
              <StatCard
                tone="sky"
                label={t('statLocked')}
                value={summary.locked}
                hint={t('statLockedHint')}
              />
            )}
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
                ctx={ctx}
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
