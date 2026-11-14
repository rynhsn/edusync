'use client';

import { COCURRICULAR_FORMS, COCURRICULAR_PROGRAM_STATUSES } from '@edusync/contracts';
import { useTranslations } from 'next-intl';
import { FORM_GRID, FormField } from '@/components/form-field';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import type { ProgramDraft } from '@/lib/cocurricular';

/** Isian data pokok program; dipakai dialog "Program baru" dan "Ubah". */
export function ProgramFields({
  idPrefix,
  draft,
  onChange,
  semesters,
}: {
  idPrefix: string;
  draft: ProgramDraft;
  onChange: (d: ProgramDraft) => void;
  semesters: { id: string; name: string }[];
}) {
  const t = useTranslations('cocurricular');
  const set = (over: Partial<ProgramDraft>) => onChange({ ...draft, ...over });
  const periodsBad = draft.plannedPeriods.trim() !== '' && !/^\d+$/.test(draft.plannedPeriods.trim());
  return (
    <div className="grid gap-4">
      <FormField label={t('fTitle')} htmlFor={`${idPrefix}-title`}>
        <Input
          id={`${idPrefix}-title`}
          className={TOUCH_INPUT}
          value={draft.title}
          maxLength={200}
          required
          onChange={(e) => set({ title: e.target.value })}
        />
      </FormField>
      <FormField label={t('fTheme')} htmlFor={`${idPrefix}-theme`}>
        <Input
          id={`${idPrefix}-theme`}
          className={TOUCH_INPUT}
          value={draft.theme}
          maxLength={200}
          onChange={(e) => set({ theme: e.target.value })}
        />
      </FormField>
      <FormField label={t('fDescription')} htmlFor={`${idPrefix}-desc`}>
        <Textarea
          id={`${idPrefix}-desc`}
          value={draft.description}
          maxLength={4000}
          onChange={(e) => set({ description: e.target.value })}
        />
      </FormField>
      <div className={FORM_GRID}>
        <FormField label={t('fForm')} htmlFor={`${idPrefix}-form`}>
          <SelectField
            id={`${idPrefix}-form`}
            value={draft.form}
            onChange={(e) => set({ form: e.target.value as ProgramDraft['form'] })}
          >
            {COCURRICULAR_FORMS.map((f) => (
              <option key={f} value={f}>
                {t(`progForm.${f}`)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField label={t('fStatus')} htmlFor={`${idPrefix}-status`}>
          <SelectField
            id={`${idPrefix}-status`}
            value={draft.status}
            onChange={(e) => set({ status: e.target.value as ProgramDraft['status'] })}
          >
            {COCURRICULAR_PROGRAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`progStatus.${s}`)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField label={t('fSemester')} htmlFor={`${idPrefix}-semester`}>
          <SelectField
            id={`${idPrefix}-semester`}
            value={draft.semesterId}
            onChange={(e) => set({ semesterId: e.target.value })}
          >
            <option value="">{t('wholeYear')}</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField
          label={t('fPeriods')}
          htmlFor={`${idPrefix}-periods`}
          hint={t('fPeriodsHint')}
          error={periodsBad ? t('fPeriodsHint') : undefined}
        >
          <Input
            id={`${idPrefix}-periods`}
            className={TOUCH_INPUT}
            inputMode="numeric"
            value={draft.plannedPeriods}
            maxLength={6}
            aria-invalid={periodsBad}
            onChange={(e) => set({ plannedPeriods: e.target.value })}
          />
        </FormField>
      </div>
      <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
        <Checkbox
          id={`${idPrefix}-report`}
          checked={draft.showInReport}
          onCheckedChange={(v) => set({ showInReport: v === true })}
        />
        <Label htmlFor={`${idPrefix}-report`}>{t('fShowInReport')}</Label>
      </div>
    </div>
  );
}
