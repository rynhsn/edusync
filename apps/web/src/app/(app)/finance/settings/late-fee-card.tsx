'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { withoutBlur } from '@/lib/area-rules';
import { errorKey } from '@/lib/errors';
import { formatRupiah } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  bodyFromDraft,
  draftFromSetting,
  EMPTY_LATE_FEE,
  type LateFeeDraft,
  type LateFeeMode,
} from '../late-fee';
import { digitsOnly } from '../shared';
import { SectionCard } from '../ui';
import { LATE_FEE_ORDER, type LateFeeField, validateLateFee } from './settings-validation';

/** Pengaturan denda keterlambatan: mode, nilai, toleransi, batas, dan jenis biaya tagihan denda. */
export function LateFeeCard({ feeTypes }: { feeTypes: { id: string; name: string; active: boolean }[] }) {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const tv = useTranslations('formValidation');
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [draft, setDraft] = useState<LateFeeDraft>(EMPTY_LATE_FEE);
  const [error, setError] = useState<string | null>(null);

  const setting = useQuery({
    queryKey: ['finance', school.schoolId, 'late-fee-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/finance/late-fee-settings', { params: header })),
  });

  useEffect(() => {
    if (setting.data) setDraft(draftFromSetting(setting.data));
  }, [setting.data]);

  const validation = useFormValidation<LateFeeField>({
    errors: validateLateFee(draft),
    order: LATE_FEE_ORDER,
    idPrefix: 'lf',
  });
  const field = (name: LateFeeField) => validation.fieldProps(name);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.PUT('/v1/finance/late-fee-settings', { params: header, body: bodyFromDraft(draft) })),
    onSuccess: () => {
      setError(null);
      validation.reset();
      toast.success(tm('saved'));
      queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['finance-late-fees', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const on = draft.mode !== 'none';
  const percent = draft.mode === 'percent';
  const options = feeTypes.filter((f) => f.active || f.id === draft.feeTypeId);

  return (
    <SectionCard icon={Hourglass} tone="rose" title={t('lateFeeTitle')} description={t('lateFeeHint')}>
      {setting.isPending && <Skeleton className="h-24 w-full" />}
      {setting.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(setting.error))}</AlertDescription>
        </Alert>
      )}

      {setting.data && (
        <form
          className="relative grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (save.isPending || !validation.attempt()) return;
            save.mutate();
          }}
        >
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="lf-mode">{t('lateFeeMode')}</Label>
              <SelectField
                id="lf-mode"
                value={draft.mode}
                onChange={(e) => {
                  setDraft({ ...draft, mode: e.target.value as LateFeeMode, value: '' });
                  validation.reset();
                }}
              >
                <option value="none">{t('lateFeeModeNone')}</option>
                <option value="flat">{t('lateFeeModeFlat')}</option>
                <option value="percent">{t('lateFeeModePercent')}</option>
              </SelectField>
            </div>

            {on && (
              <div className="grid content-start gap-2">
                <Label htmlFor={validation.idOf('value')}>
                  {percent ? t('lateFeeValuePercent') : t('lateFeeValueFlat')}
                </Label>
                <div className="relative">
                  <Input
                    {...field('value')}
                    aria-required="true"
                    inputMode="numeric"
                    autoComplete="off"
                    className={cn(TOUCH_INPUT, percent ? 'pr-9' : 'pl-10')}
                    value={draft.value}
                    onChange={(e) => {
                      const v = digitsOnly(e.target.value);
                      setDraft({ ...draft, value: percent && Number(v) > 100 ? '100' : v });
                    }}
                  />
                  <span
                    className={`text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm ${
                      percent ? 'right-3' : 'left-3'
                    }`}
                  >
                    {percent ? t('unitPercent') : t('unitRupiah')}
                  </span>
                </div>
                <FieldError id={validation.idOf('value')} issue={validation.issue('value')} />
                {!percent && draft.value && (
                  <p className="text-muted-foreground text-xs">{formatRupiah(Number(draft.value))}</p>
                )}
              </div>
            )}

            {on && (
              <>
                <div className="grid content-start gap-2">
                  <Label htmlFor={validation.idOf('graceDays')}>{t('lateFeeGrace')}</Label>
                  <Input
                    {...field('graceDays')}
                    className={TOUCH_INPUT}
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.graceDays}
                    onChange={(e) => {
                      const v = digitsOnly(e.target.value);
                      setDraft({ ...draft, graceDays: Number(v) > 365 ? '365' : v });
                    }}
                  />
                  <FieldError id={validation.idOf('graceDays')} issue={validation.issue('graceDays')} />
                  <p className="text-muted-foreground text-xs">{t('lateFeeGraceHint')}</p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={validation.idOf('dueDays')}>{t('lateFeeDueDays')}</Label>
                  <Input
                    {...field('dueDays')}
                    className={TOUCH_INPUT}
                    aria-required="true"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.dueDays}
                    onChange={(e) => {
                      const v = digitsOnly(e.target.value);
                      setDraft({ ...draft, dueDays: Number(v) > 365 ? '365' : v });
                    }}
                  />
                  <FieldError id={validation.idOf('dueDays')} issue={validation.issue('dueDays')} />
                  <p className="text-muted-foreground text-xs">{t('lateFeeDueDaysHint')}</p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={validation.idOf('capAmount')}>{t('lateFeeCap')}</Label>
                  <Input
                    {...field('capAmount')}
                    className={TOUCH_INPUT}
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.capAmount}
                    placeholder={t('lateFeeCapNone')}
                    onChange={(e) => setDraft({ ...draft, capAmount: digitsOnly(e.target.value) })}
                  />
                  <FieldError id={validation.idOf('capAmount')} issue={validation.issue('capAmount')} />
                  {draft.capAmount && (
                    <p className="text-muted-foreground text-xs">{formatRupiah(Number(draft.capAmount))}</p>
                  )}
                </div>
                <div className="grid content-start gap-2 sm:col-span-2">
                  <Label htmlFor={validation.idOf('feeTypeId')}>{t('lateFeeFeeType')}</Label>
                  <SelectField
                    {...withoutBlur(field('feeTypeId'))}
                    value={draft.feeTypeId}
                    placeholder={t('chooseFeeType')}
                    onChange={(e) => {
                      setDraft({ ...draft, feeTypeId: e.target.value });
                      validation.touch('feeTypeId');
                    }}
                  >
                    {options.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </SelectField>
                  <FieldError id={validation.idOf('feeTypeId')} issue={validation.issue('feeTypeId')} />
                  <p className="text-muted-foreground text-xs">{t('lateFeeFeeTypeHint')}</p>
                </div>
              </>
            )}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {validation.summary && (
            <p aria-live="polite" className="text-destructive text-sm">
              {tv('summary')}
            </p>
          )}
          <div>
            <Button type="submit" disabled={save.isPending}>
              {tm('save')}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
