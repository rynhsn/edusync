'use client';

import {
  LEARNING_REVIEW_ITEMS,
  MAX_REVIEW_NOTE,
  MAX_REVIEW_RESPONDENTS,
  REVIEWER_KINDS,
  type ReviewerKind,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton, type MenuAction, REVEAL, RowMenu } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { usePlanSettings } from './plan-settings';

interface ReviewRow {
  id: string;
  teacherId: string;
  teacherName: string;
  reviewerKind: ReviewerKind;
  reviewerTeacherId: string | null;
  reviewerTeacherName: string | null;
  reviewedOn: string;
  ratings: Record<string, number> | null;
  respondentCount: number | null;
  note: string | null;
  sharedWithTeacher: boolean;
}

const KIND_TONE: Record<ReviewerKind, Tone> = {
  self: 'teal',
  peer: 'sky',
  principal: 'violet',
  student: 'amber',
};

/**
 * Penilaian proses pembelajaran (C12): refleksi guru, sejawat, kepala sekolah, dan murid (agregat anonim). Opsional per sekolah
 * lewat sakelar `reviewEnabled`. Hanya melaporkan kecakupan; tanpa skor gabungan atau peringkat guru. Pengelola
 * (`teaching_review:manage`) mengelola semua jenis; guru hanya refleksi dirinya dan tinjauan yang dibagikan kepadanya.
 */
export function ReviewsPanel() {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manager = can('teaching_review:manage');
  const settings = usePlanSettings();
  const enabled = settings.data?.reviewEnabled === true;
  const [semesterChoice, setSemesterChoice] = useState('');
  const [form, setForm] = useState<{ review: ReviewRow | null; teacherId: string } | null>(null);
  const [deleting, setDeleting] = useState<ReviewRow | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: enabled && can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearId = (years.data?.find((y) => y.isActive) ?? years.data?.[0])?.id ?? '';
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, yearId],
    enabled: enabled && !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const semesterList = semesters.data ?? [];
  const semesterId =
    semesterList.find((s) => s.id === semesterChoice)?.id ??
    semesterList.find((s) => s.isActive)?.id ??
    semesterList[0]?.id ??
    '';

  const reviews = useQuery({
    queryKey: ['learning-reviews', school.schoolId, semesterId],
    enabled: enabled && !!semesterId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/learning-reviews', { params: { ...header, query: { semesterId } } })),
  });
  const coverage = useQuery({
    queryKey: ['learning-review-coverage', school.schoolId, semesterId],
    enabled: enabled && manager && !!semesterId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/learning-reviews/coverage', { params: { ...header, query: { semesterId } } }),
      ),
  });
  const list = (reviews.data?.reviews ?? []) as ReviewRow[];

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/learning-reviews/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('reviewDeleted'));
      queryClient.invalidateQueries({ queryKey: ['learning-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['learning-review-coverage'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const setMin = useMutation({
    mutationFn: async (reviewMinPerSemester: number) =>
      unwrap(await api.PUT('/v1/learning-plan/settings', { params: header, body: { reviewMinPerSemester } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-plan-settings'] });
      queryClient.invalidateQueries({ queryKey: ['learning-review-coverage'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const rowMenu = (r: ReviewRow) => {
    // Guru hanya refleksi dirinya; pengelola semua jenis.
    if (!manager && r.reviewerKind !== 'self') return null;
    const actions: MenuAction[] = [
      { label: t('edit'), icon: Pencil, onSelect: () => setForm({ review: r, teacherId: r.teacherId }) },
      {
        label: t('delete'),
        icon: Trash2,
        destructive: true,
        separated: true,
        onSelect: () => setDeleting(r),
      },
    ];
    return <RowMenu label={t('reviewMenu')} actions={actions} />;
  };

  const reviewCard = (r: ReviewRow) => (
    <article key={r.id} className="bg-muted/40 grid gap-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ToneBadge tone={KIND_TONE[r.reviewerKind]} dot={false}>
            {t(`reviewKind_${r.reviewerKind}`)}
          </ToneBadge>
          <span className="text-muted-foreground text-xs">{formatCalendarDate(locale, r.reviewedOn)}</span>
          {r.reviewerTeacherName && (
            <span className="text-muted-foreground text-xs">
              {t('reviewBy', { name: r.reviewerTeacherName })}
            </span>
          )}
          {r.respondentCount != null && (
            <span className="text-muted-foreground text-xs">
              {t('reviewRespondentsCount', { count: r.respondentCount })}
            </span>
          )}
          {manager && r.reviewerKind !== 'self' && (
            <ToneBadge tone={r.sharedWithTeacher ? 'emerald' : 'slate'} dot={false}>
              {r.sharedWithTeacher ? t('reviewSharedBadge') : t('reviewPrivateBadge')}
            </ToneBadge>
          )}
        </div>
        {rowMenu(r)}
      </div>
      {r.ratings && (
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {LEARNING_REVIEW_ITEMS.filter((k) => r.ratings?.[k] != null).map((k) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <span>{t(`reviewItem_${k}`)}</span>
              <span className="font-medium tabular-nums">{r.ratings?.[k]}</span>
            </li>
          ))}
        </ul>
      )}
      {r.note && <p className="text-sm break-words whitespace-pre-line">{r.note}</p>}
    </article>
  );

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="tp-reviews-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tp-reviews-title" className="font-heading text-lg font-semibold">
            {t('reviewsTitle')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {manager ? t('reviewsHelp') : t('reviewsHelpTeacher')}
          </p>
        </div>
        {enabled && !manager && semesterId && (
          <Button onClick={() => setForm({ review: null, teacherId: '' })}>
            <Plus className="size-4" aria-hidden /> {t('reviewNewSelf')}
          </Button>
        )}
      </div>

      {settings.isPending && <ListSkeleton rows={1} stats={0} />}
      {!enabled && settings.data && (
        <EmptyPanel
          icon={ClipboardCheck}
          tone={MODULE_TONE.academic}
          title={t('reviewOffTitle')}
          body={can('curriculum:manage') ? t('reviewOffManagerBody') : t('reviewOffBody')}
        />
      )}

      {enabled && (
        <>
          {semesters.data && semesterList.length === 0 && (
            <EmptyPanel
              icon={CalendarDays}
              tone={MODULE_TONE.academic}
              title={t('noYears')}
              body={t('noYearsBody')}
            />
          )}
          {semesterList.length > 0 && (
            <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="tp-review-semester">{t('planSemester')}</Label>
                <SelectField
                  id="tp-review-semester"
                  className={TOUCH_SELECT}
                  value={semesterId}
                  onChange={(e) => setSemesterChoice(e.target.value)}
                >
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              {can('curriculum:manage') && settings.data && (
                <div className="grid content-start gap-2">
                  <Label htmlFor="tp-review-min">{t('reviewMin')}</Label>
                  <SelectField
                    id="tp-review-min"
                    className={TOUCH_SELECT}
                    value={String(settings.data.reviewMinPerSemester)}
                    disabled={setMin.isPending}
                    onChange={(e) => setMin.mutate(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </SelectField>
                </div>
              )}
            </div>
          )}

          {(reviews.isPending || (manager && coverage.isPending)) && !!semesterId && (
            <ListSkeleton rows={2} stats={0} />
          )}
          {(reviews.isError || coverage.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(reviews.error ?? coverage.error))}</AlertDescription>
            </Alert>
          )}

          {manager && coverage.data && (
            <>
              <p className="text-muted-foreground text-xs">
                {t('reviewMinNote', { min: coverage.data.minPerSemester })}
              </p>
              {coverage.data.teachers.length === 0 && (
                <EmptyPanel
                  icon={ClipboardCheck}
                  tone={MODULE_TONE.academic}
                  title={t('reviewNoTeachers')}
                  body={t('reviewNoTeachersBody')}
                />
              )}
              <div className="grid gap-3">
                {coverage.data.teachers.map((c) => {
                  const mine = list.filter((r) => r.teacherId === c.teacherId);
                  return (
                    <article key={c.teacherId} className="bg-card grid gap-3 rounded-2xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-medium break-words">{c.teacherName}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <ToneBadge tone={c.met ? 'emerald' : 'amber'}>
                              {c.met ? t('reviewMet') : t('reviewNotMet')}
                            </ToneBadge>
                            {REVIEWER_KINDS.map((k) => (
                              <ToneBadge key={k} tone={KIND_TONE[k]} dot={false}>
                                {t(`reviewKind_${k}`)}: {c.counts[k]}
                              </ToneBadge>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="max-sm:w-full"
                          onClick={() => setForm({ review: null, teacherId: c.teacherId })}
                        >
                          <Plus className="size-4" aria-hidden /> {t('reviewNew')}
                        </Button>
                      </div>
                      {mine.length > 0 && (
                        <details className="group text-sm">
                          <summary className="text-primary min-h-11 cursor-pointer py-2.5 font-medium md:min-h-0 md:py-0">
                            {t('reviewShowAll', { count: mine.length })}
                          </summary>
                          <div className="mt-2 grid gap-2">{mine.map(reviewCard)}</div>
                        </details>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {!manager && reviews.data && (
            <>
              {list.length === 0 && (
                <EmptyPanel
                  icon={ClipboardCheck}
                  tone={MODULE_TONE.academic}
                  title={t('reviewEmpty')}
                  body={t('reviewEmptyTeacher')}
                />
              )}
              <div className="grid gap-3">{list.map(reviewCard)}</div>
            </>
          )}
        </>
      )}

      {form && semesterId && (
        <ReviewForm
          key={form.review?.id ?? `new-${form.teacherId}`}
          semesterId={semesterId}
          review={form.review}
          teacherId={form.teacherId}
          teachers={coverage.data?.teachers ?? []}
          manager={manager}
          onClose={() => setForm(null)}
        />
      )}
      <ConfirmDelete
        name={deleting ? `${t(`reviewKind_${deleting.reviewerKind}`)} - ${deleting.teacherName}` : null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch {
            // Galat tampil sebagai toast.
          }
        }}
      />
    </section>
  );
}

function ReviewForm({
  semesterId,
  review,
  teacherId,
  teachers,
  manager,
  onClose,
}: {
  semesterId: string;
  review: ReviewRow | null;
  teacherId: string;
  teachers: { teacherId: string; teacherName: string }[];
  manager: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [kind, setKind] = useState<ReviewerKind>(review?.reviewerKind ?? 'self');
  const [reviewerTeacherId, setReviewerTeacherId] = useState(review?.reviewerTeacherId ?? '');
  const [reviewedOn, setReviewedOn] = useState(review?.reviewedOn ?? new Date().toISOString().slice(0, 10));
  const [ratings, setRatings] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(review?.ratings ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [respondents, setRespondents] = useState(
    review?.respondentCount ? String(review.respondentCount) : '',
  );
  const [note, setNote] = useState(review?.note ?? '');
  const [shared, setShared] = useState(review?.sharedWithTeacher ?? false);
  const [error, setError] = useState<string | null>(null);
  const aggregate = kind === 'student';

  const save = useMutation({
    mutationFn: async () => {
      const filled = Object.fromEntries(
        Object.entries(ratings)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)]),
      );
      const common = {
        reviewedOn,
        ratings: filled,
        note: note.trim() === '' ? null : note.trim(),
        respondentCount: aggregate ? Number(respondents) || null : null,
        ...(manager && kind !== 'self' ? { sharedWithTeacher: shared } : {}),
      };
      if (review) {
        return unwrap(
          await api.PUT('/v1/learning-reviews/{id}', {
            params: { ...header, path: { id: review.id } },
            body: {
              ...common,
              ...(kind === 'peer' && reviewerTeacherId ? { reviewerTeacherId } : {}),
            },
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/learning-reviews', {
          params: header,
          body: {
            ...common,
            semesterId,
            reviewerKind: kind,
            ...(manager ? { teacherId } : {}),
            ...(kind === 'peer' ? { reviewerTeacherId } : {}),
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success(review ? t('reviewSaved') : t('reviewCreated'));
      queryClient.invalidateQueries({ queryKey: ['learning-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['learning-review-coverage'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const teacherName = review?.teacherName ?? teachers.find((x) => x.teacherId === teacherId)?.teacherName;
  return (
    <FormDialog
      open
      size="wide"
      onOpenChange={(o) => !o && onClose()}
      title={review ? t('reviewEdit') : manager ? t('reviewNew') : t('reviewNewSelf')}
      description={t('reviewFormHelp')}
      submitLabel={save.isPending ? t('saving') : review ? t('save') : t('create')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      {manager && teacherName && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t('reviewTeacher')}: </span>
          <span className="font-medium">{teacherName}</span>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {manager && !review && (
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor="tp-review-kind">{t('reviewKindLabel')}</Label>
            <SelectField
              id="tp-review-kind"
              className={TOUCH_SELECT}
              value={kind}
              onChange={(e) => setKind(e.target.value as ReviewerKind)}
            >
              {REVIEWER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`reviewKind_${k}`)}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor="tp-review-date">{t('reviewDate')}</Label>
          <Input
            id="tp-review-date"
            type="date"
            required
            value={reviewedOn}
            onChange={(e) => setReviewedOn(e.target.value)}
          />
        </div>
      </div>
      {kind === 'peer' && (
        <div className="grid min-w-0 content-start gap-2 sm:max-w-sm">
          <Label htmlFor="tp-review-peer">{t('reviewReviewer')}</Label>
          <SelectField
            id="tp-review-peer"
            className={TOUCH_SELECT}
            value={reviewerTeacherId}
            onChange={(e) => setReviewerTeacherId(e.target.value)}
          >
            <option value="">{t('reviewReviewerPick')}</option>
            {teachers
              .filter((x) => x.teacherId !== (review?.teacherId ?? teacherId))
              .map((x) => (
                <option key={x.teacherId} value={x.teacherId}>
                  {x.teacherName}
                </option>
              ))}
          </SelectField>
        </div>
      )}
      {aggregate && (
        <div className="grid min-w-0 content-start gap-2 sm:max-w-sm">
          <Label htmlFor="tp-review-respondents">{t('reviewRespondents')}</Label>
          <Input
            id="tp-review-respondents"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={MAX_REVIEW_RESPONDENTS}
            value={respondents}
            onChange={(e) => setRespondents(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('reviewRespondentsHint')}</p>
        </div>
      )}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">{t('reviewItemsTitle')}</legend>
        <p className="text-muted-foreground text-xs">
          {aggregate ? t('reviewScaleAggregate') : t('reviewScale')}
        </p>
        {LEARNING_REVIEW_ITEMS.map((k) => (
          <div key={k} className="grid gap-1.5">
            <span id={`tp-review-item-${k}`} className="text-sm">
              {t(`reviewItem_${k}`)}
            </span>
            {aggregate ? (
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                max={4}
                step="0.01"
                aria-labelledby={`tp-review-item-${k}`}
                className="sm:max-w-32"
                value={ratings[k] ?? ''}
                onChange={(e) => setRatings({ ...ratings, [k]: e.target.value })}
              />
            ) : (
              <div
                role="radiogroup"
                aria-labelledby={`tp-review-item-${k}`}
                className="grid grid-cols-4 gap-1.5 sm:max-w-xs"
              >
                {[1, 2, 3, 4].map((n) => {
                  const on = ratings[k] === String(n);
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: tombol bersegmen 1-4 ber-role radio (target sentuh 44 px).
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      // Klik lagi mengosongkan butir (butir boleh dilewati).
                      onClick={() => setRatings({ ...ratings, [k]: on ? '' : String(n) })}
                      className={cn(
                        'focus-visible:ring-ring/60 min-h-11 rounded-lg border text-sm font-medium tabular-nums outline-none focus-visible:ring-2 md:min-h-9',
                        on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted',
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="tp-review-note">{t('reviewNote')}</Label>
        <Textarea
          id="tp-review-note"
          rows={3}
          maxLength={MAX_REVIEW_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {manager && kind !== 'self' && (
        <label
          htmlFor="tp-review-shared"
          className="bg-card flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3"
        >
          <Checkbox
            id="tp-review-shared"
            className="mt-0.5"
            checked={shared}
            onCheckedChange={(v) => setShared(v === true)}
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{t('reviewShared')}</span>
            <span className="text-muted-foreground text-xs">{t('reviewSharedHelp')}</span>
          </span>
        </label>
      )}
    </FormDialog>
  );
}
