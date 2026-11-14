'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  ATTENDEE_ROLES,
  type AttendeeForm,
  buildMeetingBody,
  formFromDetail,
  LIMITS,
  MEETING_KINDS,
  MEETING_ORDER,
  type MeetingDetail,
  type MeetingField,
  type MeetingForm,
  newAttendee,
  newMeetingForm,
  validateMeeting,
} from '@/lib/council-meeting';
import { errorKey } from '@/lib/errors';
import { todayIso } from '@/lib/form-validation';

/** Kunci cache yang berubah setelah berita acara dibuat, diubah, ditautkan, atau dihapus. */
export function useRefreshMinutes() {
  const { school } = useSchool();
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['council-meetings', 'promotions'])
      queryClient.invalidateQueries({ queryKey: [key, school.schoolId] });
  };
}

/**
 * Formulir buat/ubah berita acara dalam dialog. Ubah memuat detail (peserta) lebih dulu; isian disiapkan ulang tiap kali
 * dialog dibuka untuk berita acara lain.
 */
export function MeetingFormDialog({
  open,
  mode,
  yearId,
  yearName,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  yearId: string;
  yearName: string;
  meetingId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations('minutes');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshMinutes();
  const [values, setValues] = useState<MeetingForm>(() => newMeetingForm(todayIso(), 'promotion', ''));
  const [error, setError] = useState<string | null>(null);
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  const validation = useFormValidation<MeetingField>({
    errors: validateMeeting(values),
    order: MEETING_ORDER,
    idPrefix: 'minutes',
  });

  const detail = useQuery({
    queryKey: ['council-meetings', school.schoolId, 'detail', meetingId],
    enabled: open && mode === 'edit' && !!meetingId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/council-meetings/{id}', {
          params: { ...header, path: { id: meetingId as string } },
        }),
      ),
  });
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    enabled: open,
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: open && can('class:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, 'minutes'],
    enabled: open && can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });

  // Isian disiapkan sekali per pembukaan (tambah) atau sekali per detail yang dimuat (ubah).
  const prepKey = open
    ? mode === 'create'
      ? `create:${yearId}`
      : detail.data
        ? `edit:${detail.data.id}`
        : null
    : null;
  if (prepKey !== preparedFor) {
    setPreparedFor(prepKey);
    if (prepKey) {
      setError(null);
      setValues(
        mode === 'create'
          ? newMeetingForm(todayIso(), 'promotion', t('defaultTitle.promotion', { year: yearName }))
          : formFromDetail(detail.data as MeetingDetail),
      );
    }
  }

  const send = useMutation({
    mutationFn: async () => {
      const body = buildMeetingBody(values);
      if (mode === 'create') {
        return unwrap(
          await api.POST('/v1/council-meetings', {
            params: header,
            body: { academicYearId: yearId, ...body },
          }),
        );
      }
      return unwrap(
        await api.PUT('/v1/council-meetings/{id}', {
          params: { ...header, path: { id: meetingId as string } },
          body,
        }),
      );
    },
    onSuccess: (data) => {
      toast.success(t('saved'));
      refresh();
      onSaved?.(data.id);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const set = <K extends keyof MeetingForm>(key: K, value: MeetingForm[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setAttendee = (key: string, patch: Partial<AttendeeForm>) =>
    set(
      'attendees',
      values.attendees.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  const yearSemesters = (semesters.data ?? []).filter((s) => s.academicYearId === yearId);
  const f = (k: string) => `minutes-${k}`;
  const loadingDetail = mode === 'edit' && detail.isPending;

  return (
    <FormDialog
      size="wide"
      open={open}
      title={mode === 'create' ? t('createTitle') : t('editTitle')}
      description={t('formHint')}
      submitLabel={te('masterData.save')}
      error={error ?? (detail.isError ? te('masterData.loadError') : null)}
      validation={validation}
      disabled={loadingDetail || detail.isError}
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => send.mutateAsync()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={f('kind')}>{t('fieldKind')}</Label>
          <SelectField
            id={f('kind')}
            className={TOUCH_SELECT}
            value={values.kind}
            onChange={(e) => set('kind', e.target.value as MeetingForm['kind'])}
          >
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('heldOn')}>{t('fieldHeldOn')}</Label>
          <DatePicker
            {...validation.fieldProps('heldOn')}
            className={TOUCH_INPUT}
            value={values.heldOn}
            onChange={(date) => {
              set('heldOn', date);
              validation.touch('heldOn');
            }}
          />
          <FieldError id={f('heldOn')} issue={validation.issue('heldOn')} />
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor={f('title')}>{t('fieldTitle')}</Label>
          <Input
            {...validation.fieldProps('title')}
            className={TOUCH_INPUT}
            maxLength={LIMITS.title}
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <FieldError id={f('title')} issue={validation.issue('title')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('semester')}>{t('fieldSemester')}</Label>
          <SelectField
            id={f('semester')}
            className={TOUCH_SELECT}
            value={values.semesterId}
            onChange={(e) => set('semesterId', e.target.value)}
          >
            <option value="">{t('noSemester')}</option>
            {yearSemesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('class')}>{t('fieldClass')}</Label>
          <SelectField
            id={f('class')}
            className={TOUCH_SELECT}
            value={values.classId}
            onChange={(e) => set('classId', e.target.value)}
          >
            <option value="">{t('allClasses')}</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor={f('location')}>{t('fieldLocation')}</Label>
          <Input
            {...validation.fieldProps('location')}
            className={TOUCH_INPUT}
            maxLength={LIMITS.location}
            value={values.location}
            onChange={(e) => set('location', e.target.value)}
          />
          <FieldError id={f('location')} issue={validation.issue('location')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('chairName')}>{t('fieldChair')}</Label>
          <Input
            {...validation.fieldProps('chairName')}
            className={TOUCH_INPUT}
            maxLength={LIMITS.person}
            value={values.chairName}
            onChange={(e) => set('chairName', e.target.value)}
          />
          <FieldError id={f('chairName')} issue={validation.issue('chairName')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('secretaryName')}>{t('fieldSecretary')}</Label>
          <Input
            {...validation.fieldProps('secretaryName')}
            className={TOUCH_INPUT}
            maxLength={LIMITS.person}
            value={values.secretaryName}
            onChange={(e) => set('secretaryName', e.target.value)}
          />
          <FieldError id={f('secretaryName')} issue={validation.issue('secretaryName')} />
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor={f('agenda')}>{t('fieldAgenda')}</Label>
          <Textarea
            {...validation.fieldProps('agenda')}
            rows={3}
            maxLength={LIMITS.agenda}
            value={values.agenda}
            onChange={(e) => set('agenda', e.target.value)}
          />
          <FieldError id={f('agenda')} issue={validation.issue('agenda')} />
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor={f('summary')}>{t('fieldSummary')}</Label>
          <Textarea
            {...validation.fieldProps('summary')}
            rows={4}
            maxLength={LIMITS.summary}
            value={values.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('fieldSummaryHint')}</p>
          <FieldError id={f('summary')} issue={validation.issue('summary')} />
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-xl border p-3" id={f('attendees')}>
        <legend className="px-1 text-sm font-medium">{t('attendeesTitle')}</legend>
        <p className="text-muted-foreground text-xs">{t('attendeesHint')}</p>
        {values.attendees.map((a, i) => (
          <div key={a.key} className="bg-muted/30 grid gap-2 rounded-lg border p-2.5 sm:grid-cols-2">
            {can('teacher:read') && (
              <div className="grid content-start gap-1.5 sm:col-span-2">
                <Label htmlFor={`${a.key}-teacher`} className="text-xs">
                  {t('attendeeTeacher', { index: i + 1 })}
                </Label>
                <SelectField
                  id={`${a.key}-teacher`}
                  className={TOUCH_SELECT}
                  value={a.teacherId}
                  onChange={(e) => setAttendee(a.key, { teacherId: e.target.value })}
                >
                  <option value="">{t('teacherNone')}</option>
                  {(teachers.data ?? []).map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <div className="grid content-start gap-1.5">
              <Label htmlFor={`${a.key}-name`} className="text-xs">
                {t('attendeeName', { index: i + 1 })}
              </Label>
              <Input
                id={`${a.key}-name`}
                className={TOUCH_INPUT}
                maxLength={LIMITS.person}
                placeholder={a.teacherId ? t('attendeeNameFromTeacher') : undefined}
                value={a.name}
                onChange={(e) => setAttendee(a.key, { name: e.target.value })}
              />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor={`${a.key}-position`} className="text-xs">
                {t('attendeePosition', { index: i + 1 })}
              </Label>
              <Input
                id={`${a.key}-position`}
                className={TOUCH_INPUT}
                maxLength={LIMITS.position}
                value={a.positionTitle}
                onChange={(e) => setAttendee(a.key, { positionTitle: e.target.value })}
              />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor={`${a.key}-role`} className="text-xs">
                {t('attendeeRole', { index: i + 1 })}
              </Label>
              <SelectField
                id={`${a.key}-role`}
                className={TOUCH_SELECT}
                value={a.role}
                onChange={(e) => setAttendee(a.key, { role: e.target.value as AttendeeForm['role'] })}
              >
                {ATTENDEE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="flex items-end justify-end">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive h-11 md:h-8"
                aria-label={t('removeAttendee', { index: i + 1 })}
                onClick={() =>
                  set(
                    'attendees',
                    values.attendees.filter((x) => x.key !== a.key),
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden /> {t('remove')}
              </Button>
            </div>
          </div>
        ))}
        <FieldError id={f('attendees')} issue={validation.issue('attendees')} />
        <Button
          type="button"
          variant="outline"
          className="h-11 w-fit md:h-8"
          disabled={values.attendees.length >= LIMITS.attendees}
          onClick={() => set('attendees', [...values.attendees, newAttendee()])}
        >
          <Plus className="size-4" aria-hidden /> {t('addAttendee')}
        </Button>
      </fieldset>
    </FormDialog>
  );
}
