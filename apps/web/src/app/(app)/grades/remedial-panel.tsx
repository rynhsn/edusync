'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HandHeart, Lock, Pencil, Plus, Search, Sparkles, Trash2, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, PersonCell, TONES, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatKkm } from '@/lib/kktp';
import { objectiveLabel } from '@/lib/objective-achievement';
import {
  candidateStats,
  countByStatus,
  filterCandidates,
  LEARNING_SUPPORT_KINDS,
  type LearningSupportKind,
  policyOrDefault,
  SUPPORT_PARTICIPANT_STATUSES,
} from '@/lib/remedial';
import { cn } from '@/lib/utils';
import { isReportFinal, type Scope, useCandidates, useRoster, useSupports } from './remedial-data';
import { AttemptDialog, ParticipantsDialog, SupportFormDialog } from './remedial-dialogs';

type Candidates = NonNullable<ReturnType<typeof useCandidates>['data']>;
type CandidateStudent = Candidates['students'][number];
type Supports = NonNullable<ReturnType<typeof useSupports>['data']>;
type SupportRow = Supports[number];

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : String(Math.round(n * 100) / 100);

/** Kartu satu murid yang perlu remedial: tiap penilaian di bawah KKM dengan nilai asli, ambang, dan nilai yang dipakai. */
function CandidateCard({
  student,
  kkm,
  canRecord,
  onRecord,
}: {
  student: CandidateStudent;
  kkm: number;
  canRecord: boolean;
  onRecord: (assessmentId: string) => void;
}) {
  const t = useTranslations('grades');
  const locale = useLocale() as Locale;
  return (
    <li className="bg-card grid grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-2xl border p-3.5">
      <PersonCell name={student.name} sub={student.nis} />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {student.items.map((i) => (
          <li
            key={i.assessmentId}
            className="bg-muted/40 grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-xl border p-3 text-xs"
          >
            <p className="text-sm font-medium break-words">{i.title}</p>
            <p className="text-muted-foreground">
              {i.componentName} · {formatCalendarDate(locale, i.date)}
            </p>
            <p className="tabular-nums">
              {t('rmItemOriginal', { score: fmt(i.original), max: i.maxScore, percent: fmt(i.percent) })}
              {' · '}
              {t('kkmInfo', { kkm: formatKkm(kkm) })}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <ToneBadge tone={i.stillBelow ? 'rose' : 'emerald'} dot={false}>
                {i.stillBelow ? t('rmStillBelow') : t('rmReached')}
              </ToneBadge>
              <ToneBadge tone="slate" dot={false}>
                {i.attempts > 0 ? t('rmItemAttempts', { count: i.attempts }) : t('rmItemNoAttempt')}
              </ToneBadge>
            </div>
            {i.attempts > 0 && (
              <p className="text-muted-foreground tabular-nums">
                {t('rmItemEffective', { score: fmt(i.effective), percent: fmt(i.effectivePercent) })}
              </p>
            )}
            {canRecord && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit max-lg:min-h-11"
                aria-label={t('rmRecordAria', { name: student.name, title: i.title })}
                onClick={() => onRecord(i.assessmentId)}
              >
                <Pencil className="size-3.5" aria-hidden /> {t('rmRecord')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

const KIND_TONE = { remedial: 'amber', enrichment: 'violet' } as const;

function SupportCard({
  support,
  disabled,
  onEdit,
  onParticipants,
  onDelete,
}: {
  support: SupportRow;
  disabled: boolean;
  onEdit: () => void;
  onParticipants: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('grades');
  const locale = useLocale() as Locale;
  const counts = countByStatus(support.participants);
  const editable = support.canInput && !disabled;
  const dates =
    support.startsOn && support.endsOn
      ? t('rmDateRange', {
          start: formatCalendarDate(locale, support.startsOn),
          end: formatCalendarDate(locale, support.endsOn),
        })
      : support.startsOn
        ? t('rmDateFrom', { date: formatCalendarDate(locale, support.startsOn) })
        : support.endsOn
          ? t('rmDateTo', { date: formatCalendarDate(locale, support.endsOn) })
          : null;
  return (
    <li className="bg-card grid grid-cols-[minmax(0,1fr)] content-start gap-2.5 rounded-2xl border p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToneBadge tone={KIND_TONE[support.kind]} dot={false}>
          {support.kind === 'remedial' ? (
            <HandHeart className="size-3" aria-hidden />
          ) : (
            <Sparkles className="size-3" aria-hidden />
          )}
          {t(`rmKind_${support.kind}`)}
        </ToneBadge>
        {dates && <span className="text-muted-foreground text-xs">{dates}</span>}
      </div>
      <h3 className="font-heading text-base font-semibold break-words">{support.title}</h3>
      {support.description && (
        <p className="text-muted-foreground text-sm break-words">{support.description}</p>
      )}
      {support.teacherName && (
        <p className="text-muted-foreground text-xs">{t('rmTeacher', { name: support.teacherName })}</p>
      )}
      {support.objectives.length > 0 && (
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs font-medium">{t('rmSupportObjectives')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {support.objectives.map((o) => (
              <li key={o.id}>
                <ToneBadge tone="teal" dot={false} className="max-w-full whitespace-normal break-words">
                  {objectiveLabel(o)}
                </ToneBadge>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <ToneBadge tone="sky" dot={false}>
          <Users className="size-3" aria-hidden />
          {support.participants.length > 0
            ? t('rmParticipantsCount', { count: support.participants.length })
            : t('rmNoParticipants')}
        </ToneBadge>
        {SUPPORT_PARTICIPANT_STATUSES.filter((s) => counts[s] > 0 && support.participants.length > 0).map(
          (s) => (
            <ToneBadge key={s} tone="slate" dot={false}>
              {t(`rmStatus_${s}`)} · {counts[s]}
            </ToneBadge>
          ),
        )}
      </div>
      {support.participants.length > 0 && (
        <p className="text-muted-foreground text-xs break-words">
          {support.participants.map((p) => p.name).join(', ')}
        </p>
      )}
      {support.canInput && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-lg:min-h-11"
            disabled={!editable}
            aria-label={t('rmParticipantsAria', { title: support.title })}
            onClick={onParticipants}
          >
            <UserCheck className="size-3.5" aria-hidden /> {t('rmParticipants')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-lg:min-h-11"
            disabled={!editable}
            aria-label={t('rmEditSupportAria', { title: support.title })}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" aria-hidden /> {t('rmEditSupport')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive max-lg:min-h-11"
            disabled={!editable}
            aria-label={t('rmDeleteSupportAria', { title: support.title })}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" aria-hidden /> {t('rmDeleteSupport')}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Tab "Remedial dan pengayaan" (tahap 3.5): murid yang perlu remedial beserta pencatatan hasilnya, dan sesi pendampingan
 * (remedial atau pengayaan) beserta pesertanya. Skor asli tidak pernah diubah; pengaruhnya pada nilai akhir mengikuti
 * kebijakan remedial sekolah di Pengaturan penilaian.
 */
export function RemedialPanel({ semesterId, classId, subjectId }: Scope) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const scope: Scope = { semesterId, classId, subjectId };
  const candidates = useCandidates(scope);
  const supports = useSupports(scope);
  const roster = useRoster(scope);

  const [locked, setLocked] = useState(false);
  const [onlyStillBelow, setOnlyStillBelow] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | LearningSupportKind>('');
  const [recording, setRecording] = useState<{ student: CandidateStudent; assessmentId: string } | null>(
    null,
  );
  const [formFor, setFormFor] = useState<{ support?: SupportRow } | null>(null);
  const [partFor, setPartFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SupportRow | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE('/v1/learning-supports/{id}', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('rmSupportDeleted'));
      queryClient.invalidateQueries({ queryKey: ['learning-supports', school.schoolId] });
    },
    onError: (e) => {
      if (isReportFinal(e)) setLocked(true);
      toast.error(isReportFinal(e) ? t('rmLockedBody') : te(errorKey(e)));
    },
  });

  if (candidates.isPending || supports.isPending)
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  const failed = candidates.error ?? supports.error;
  if (!candidates.data || !supports.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(failed))}</AlertDescription>
      </Alert>
    );

  const data = candidates.data;
  const supportList = supports.data;
  const canInput = can('grade:input') && !locked;
  const policy = policyOrDefault(data.policy);
  const shown = filterCandidates(data.students, { onlyStillBelow, query });
  const stats = candidateStats(data.students);
  const candidateIds = new Set(data.students.map((s) => s.studentId));
  const visibleSupports = supportList.filter((s) => kindFilter === '' || s.kind === kindFilter);
  const remedialSupports = supportList
    .filter((s) => s.kind === 'remedial')
    .map((s) => ({ id: s.id, title: s.title }));
  const partSupport = partFor ? supportList.find((s) => s.id === partFor) : undefined;
  const rosterRows = (roster.data?.students ?? []).map((s) => ({
    studentId: s.studentId,
    name: s.name,
    nis: s.nis,
    final: s.final ?? null,
    belowKkm: s.belowKkm,
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('rmTitle')}</h2>
      <div role="note" className={cn('grid gap-1.5 rounded-xl border p-3 text-sm', TONES.sky.soft)}>
        <p>{t('rmIntro')}</p>
        <p>{t('rmOriginalKept', { policy: t(`rmPolicyTitle_${policy}`) })}</p>
        {can('grade:configure') && (
          <p className="text-xs">
            <Link
              href="/grades/settings"
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 md:min-h-0"
            >
              {t('rmPolicyLink')}
            </Link>
          </p>
        )}
      </div>

      {locked && (
        <Alert role="alert">
          <Lock className="size-4" aria-hidden />
          <AlertDescription>
            <span className="font-medium">{t('rmLockedTitle')}.</span> {t('rmLockedBody')}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-2">
        <section
          aria-labelledby="rm-cand-title"
          className="grid grid-cols-[minmax(0,1fr)] content-start gap-3"
        >
          <div>
            <h2 id="rm-cand-title" className="font-heading text-base font-semibold">
              {t('rmCandTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('rmCandHint', { kkm: formatKkm(data.kkm) })}</p>
          </div>
          {data.students.length === 0 ? (
            <EmptyPanel
              icon={UserCheck}
              tone={MODULE_TONE.academic}
              title={t('rmCandEmptyTitle')}
              body={t('rmCandEmptyBody')}
            />
          ) : (
            <>
              <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border p-2.5">
                <div className="relative min-w-0 flex-1 basis-48">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    aria-label={t('rmSearch')}
                    placeholder={t('rmSearch')}
                    className="h-11 pl-8 md:h-8"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <label
                  htmlFor="rm-still-below"
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm md:min-h-8"
                >
                  <Checkbox
                    id="rm-still-below"
                    checked={onlyStillBelow}
                    onCheckedChange={(v) => setOnlyStillBelow(v === true)}
                  />
                  {t('rmOnlyStillBelow')}
                </label>
                <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
                  {t('rmCandCount', { students: stats.students, items: stats.items })}
                </p>
              </div>
              {shown.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('rmCandNoMatch')}</p>
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {shown.map((s) => (
                    <CandidateCard
                      key={s.studentId}
                      student={s}
                      kkm={data.kkm}
                      canRecord={canInput}
                      onRecord={(assessmentId) => setRecording({ student: s, assessmentId })}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section
          aria-labelledby="rm-support-title"
          className="grid grid-cols-[minmax(0,1fr)] content-start gap-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="rm-support-title" className="font-heading text-base font-semibold">
                {t('rmSupportTitle')}
              </h2>
              <p className="text-muted-foreground text-sm">{t('rmSupportHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SelectField
                aria-label={t('rmSupportFilterAria')}
                className="h-11 w-40 md:h-8"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as '' | LearningSupportKind)}
              >
                <option value="">{t('rmKindAll')}</option>
                {LEARNING_SUPPORT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`rmKind_${k}`)}
                  </option>
                ))}
              </SelectField>
              {can('grade:input') && (
                <Button
                  type="button"
                  className="h-11 md:h-8"
                  disabled={locked}
                  onClick={() => setFormFor({})}
                >
                  <Plus className="size-4" aria-hidden /> {t('rmSupportNew')}
                </Button>
              )}
            </div>
          </div>
          {visibleSupports.length === 0 ? (
            <EmptyPanel
              icon={HandHeart}
              tone={MODULE_TONE.academic}
              title={t('rmSupportEmptyTitle')}
              body={t('rmSupportEmptyBody')}
            />
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {visibleSupports.map((s) => (
                <SupportCard
                  key={s.id}
                  support={s}
                  disabled={locked}
                  onEdit={() => setFormFor({ support: s })}
                  onParticipants={() => setPartFor(s.id)}
                  onDelete={() => setDeleting(s)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {recording && (
        <AttemptDialog
          key={`${recording.student.studentId}:${recording.assessmentId}`}
          student={recording.student}
          items={recording.student.items}
          initialAssessmentId={recording.assessmentId}
          supports={remedialSupports}
          onClose={() => setRecording(null)}
          onLocked={() => setLocked(true)}
        />
      )}
      {formFor && (
        <SupportFormDialog
          key={formFor.support?.id ?? 'new'}
          scope={scope}
          {...(formFor.support ? { support: formFor.support } : {})}
          defaultKind={kindFilter === '' ? 'remedial' : kindFilter}
          onClose={() => setFormFor(null)}
          onLocked={() => setLocked(true)}
          onCreated={(s) => setPartFor(s.id)}
        />
      )}
      {partSupport && (
        <ParticipantsDialog
          key={partSupport.id}
          support={partSupport}
          roster={rosterRows}
          candidateIds={candidateIds}
          onClose={() => setPartFor(null)}
          onLocked={() => setLocked(true)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          destructive
          title={t('rmDeleteSupportTitle', { title: deleting.title })}
          description={t('rmDeleteSupportDesc')}
          confirmLabel={t('rmDeleteSupport')}
          pending={remove.isPending}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
          }}
        />
      )}
    </div>
  );
}
