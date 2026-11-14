'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { UKK_PATTERN_LIST, UKK_STATUS_LIST, type UkkEvent, type UkkEventRow, ukkKey } from './lib';
import { useUkkConcentrations, useUkkSemesters, useUkkYears } from './shared';
import { EVENT_ORDER, type EventField, validateEvent } from './ukk-validation';

interface Draft {
  title: string;
  academicYearId: string;
  semesterId: string;
  concentrationId: string;
  pattern: UkkEventRow['pattern'];
  schemeName: string;
  kkniLevel: '' | '2' | '3';
  lspName: string;
  lspLicenseRef: string;
  partnerId: string;
  tukName: string;
  startsOn: string;
  endsOn: string;
  status: UkkEventRow['status'];
}

const blank = (yearId: string): Draft => ({
  title: '',
  academicYearId: yearId,
  semesterId: '',
  concentrationId: '',
  pattern: 'lsp',
  schemeName: '',
  kkniLevel: '',
  lspName: '',
  lspLicenseRef: '',
  partnerId: '',
  tukName: '',
  startsOn: '',
  endsOn: '',
  status: 'draft',
});

const fromEvent = (e: UkkEventRow): Draft => ({
  title: e.title,
  academicYearId: e.academicYearId,
  semesterId: e.semesterId,
  concentrationId: e.concentrationId,
  pattern: e.pattern,
  schemeName: e.schemeName ?? '',
  kkniLevel: e.kkniLevel === 2 ? '2' : e.kkniLevel === 3 ? '3' : '',
  lspName: e.lspName ?? '',
  lspLicenseRef: e.lspLicenseRef ?? '',
  partnerId: e.partnerId ?? '',
  tukName: e.tukName ?? '',
  startsOn: e.startsOn ?? '',
  endsOn: e.endsOn ?? '',
  status: e.status,
});

/** Dialog kegiatan UKK baru atau ubah (event = kegiatan yang diubah). Footer tombol menempel di bawah pada layar sempit. */
export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultYearId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: UkkEventRow | UkkEvent | null;
  defaultYearId: string;
  onSaved?: (e: UkkEvent) => void;
}) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [draft, setDraft] = useState<Draft>(blank(defaultYearId));
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation<EventField>({
    errors: validateEvent(draft),
    order: EVENT_ORDER,
    idPrefix: 'uk',
  });

  // Isian dimuat ulang setiap kali dialog dibuka.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat dialog dibuka
  useEffect(() => {
    if (!open) return;
    setDraft(event ? fromEvent(event) : blank(defaultYearId));
    setError(null);
    validation.reset();
  }, [open]);

  const years = useUkkYears();
  const semesters = useUkkSemesters(draft.academicYearId);
  const concentrations = useUkkConcentrations();
  const partners = useQuery({
    queryKey: ['pkl', school.schoolId, 'partners'],
    enabled: open && can('pkl:read'),
    queryFn: async () => unwrap(await api.GET('/v1/pkl/partners', { params: header })),
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        academicYearId: d.academicYearId,
        semesterId: d.semesterId,
        concentrationId: d.concentrationId,
        pattern: d.pattern,
        title: d.title.trim(),
        schemeName: d.schemeName.trim() || null,
        kkniLevel: d.kkniLevel === '' ? null : (Number(d.kkniLevel) as 2 | 3),
        lspName: d.lspName.trim() || null,
        lspLicenseRef: d.lspLicenseRef.trim() || null,
        partnerId: d.partnerId || null,
        tukName: d.tukName.trim() || null,
        startsOn: d.startsOn || null,
        endsOn: d.endsOn || null,
        status: d.status,
      };
      if (event) {
        return unwrap(
          await api.PUT('/v1/ukk/events/{id}', { params: { ...header, path: { id: event.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/ukk/events', { params: header, body }));
    },
    onSuccess: (e) => {
      toast.success(event ? t('saved') : t('created'));
      queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
      onSaved?.(e);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const semesterList = semesters.data ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? t('editEvent') : t('newEvent')}
      submitLabel={t('save')}
      size="wide"
      error={error}
      validation={validation}
      onSubmit={() => save.mutateAsync(draft)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor="uk-title">{t('form.title')}</Label>
          <Input
            {...validation.fieldProps('title')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={200}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <FieldError id={validation.idOf('title')} issue={validation.issue('title')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-academicYearId">{t('form.year')}</Label>
          <SelectField
            {...validation.fieldProps('academicYearId')}
            className={TOUCH_SELECT}
            value={draft.academicYearId}
            onChange={(e) => setDraft((d) => ({ ...d, academicYearId: e.target.value, semesterId: '' }))}
          >
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </SelectField>
          <FieldError id={validation.idOf('academicYearId')} issue={validation.issue('academicYearId')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-semesterId">{t('form.semester')}</Label>
          <SelectField
            {...validation.fieldProps('semesterId')}
            className={TOUCH_SELECT}
            value={draft.semesterId}
            placeholder={t('form.pickSemester')}
            onChange={(e) => set('semesterId', e.target.value)}
          >
            {semesterList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <p className="text-muted-foreground text-xs">{t('form.semesterHint')}</p>
          <FieldError id={validation.idOf('semesterId')} issue={validation.issue('semesterId')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-concentrationId">{t('form.concentration')}</Label>
          <SelectField
            {...validation.fieldProps('concentrationId')}
            className={TOUCH_SELECT}
            value={draft.concentrationId}
            placeholder={t('form.pickConcentration')}
            onChange={(e) => set('concentrationId', e.target.value)}
          >
            {(concentrations.data ?? [])
              .filter((c) => c.active || c.id === draft.concentrationId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
          </SelectField>
          <FieldError id={validation.idOf('concentrationId')} issue={validation.issue('concentrationId')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-pattern">{t('form.pattern')}</Label>
          <SelectField
            id="uk-pattern"
            className={TOUCH_SELECT}
            value={draft.pattern}
            onChange={(e) => set('pattern', e.target.value as Draft['pattern'])}
          >
            {UKK_PATTERN_LIST.map((p) => (
              <option key={p} value={p}>
                {t(`patterns.${p}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-schemeName">{t('form.scheme')}</Label>
          <Input
            {...validation.fieldProps('schemeName')}
            className={TOUCH_INPUT}
            autoComplete="off"
            maxLength={200}
            value={draft.schemeName}
            onChange={(e) => set('schemeName', e.target.value)}
          />
          <FieldError id={validation.idOf('schemeName')} issue={validation.issue('schemeName')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-kkniLevel">{t('form.kkni')}</Label>
          <SelectField
            id="uk-kkniLevel"
            className={TOUCH_SELECT}
            value={draft.kkniLevel}
            onChange={(e) => set('kkniLevel', e.target.value as Draft['kkniLevel'])}
          >
            <option value="">{t('form.kkniNone')}</option>
            <option value="2">KKNI 2</option>
            <option value="3">KKNI 3</option>
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-lspName">{t('form.lsp')}</Label>
          <Input
            {...validation.fieldProps('lspName')}
            className={TOUCH_INPUT}
            autoComplete="off"
            maxLength={200}
            value={draft.lspName}
            onChange={(e) => set('lspName', e.target.value)}
          />
          <FieldError id={validation.idOf('lspName')} issue={validation.issue('lspName')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-lspLicenseRef">{t('form.lspRef')}</Label>
          <Input
            {...validation.fieldProps('lspLicenseRef')}
            className={TOUCH_INPUT}
            autoComplete="off"
            maxLength={200}
            value={draft.lspLicenseRef}
            onChange={(e) => set('lspLicenseRef', e.target.value)}
          />
          <FieldError id={validation.idOf('lspLicenseRef')} issue={validation.issue('lspLicenseRef')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-tukName">{t('form.tuk')}</Label>
          <Input
            {...validation.fieldProps('tukName')}
            className={TOUCH_INPUT}
            autoComplete="off"
            maxLength={200}
            value={draft.tukName}
            onChange={(e) => set('tukName', e.target.value)}
          />
          <FieldError id={validation.idOf('tukName')} issue={validation.issue('tukName')} />
        </div>
        {can('pkl:read') && (
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="uk-partnerId">{t('form.partner')}</Label>
            <SelectField
              id="uk-partnerId"
              className={TOUCH_SELECT}
              value={draft.partnerId}
              onChange={(e) => set('partnerId', e.target.value)}
            >
              <option value="">{t('form.partnerNone')}</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-startsOn">{t('form.startsOn')}</Label>
          <DatePicker
            {...validation.fieldProps('startsOn')}
            className={TOUCH_INPUT}
            clearable
            value={draft.startsOn}
            onChange={(v) => set('startsOn', v)}
          />
          <FieldError id={validation.idOf('startsOn')} issue={validation.issue('startsOn')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="uk-endsOn">{t('form.endsOn')}</Label>
          <DatePicker
            {...validation.fieldProps('endsOn')}
            className={TOUCH_INPUT}
            clearable
            value={draft.endsOn}
            onChange={(v) => set('endsOn', v)}
          />
          <FieldError id={validation.idOf('endsOn')} issue={validation.issue('endsOn')} />
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor="uk-status">{t('form.status')}</Label>
          <SelectField
            id="uk-status"
            className={TOUCH_SELECT}
            value={draft.status}
            onChange={(e) => set('status', e.target.value as Draft['status'])}
          >
            {UKK_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </SelectField>
          <p className="text-muted-foreground text-xs">{t('form.statusHint')}</p>
        </div>
      </div>
    </FormDialog>
  );
}
