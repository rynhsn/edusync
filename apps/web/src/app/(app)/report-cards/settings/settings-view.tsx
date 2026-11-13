'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, PenLine, Settings2, Signature } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { parseWindowDays } from '@/lib/report-v2';
import { predicateTone } from '../../grades/grade-ui';
import {
  REPORT_SETTINGS_ORDER,
  type ReportSettingsField,
  validateReportSettings,
} from '../report-card-validation';
import { Textarea } from '../textarea';

const TEXT_KEYS = ['principalName', 'principalNip', 'city', 'address'] as const;
const DESC_KEYS = ['descA', 'descB', 'descC', 'descD'] as const;

interface Form {
  principalName: string;
  principalNip: string;
  city: string;
  address: string;
  descA: string;
  descB: string;
  descC: string;
  descD: string;
  showRank: boolean;
  showCocurricular: boolean;
  showGuardianResponse: boolean;
  /** Teks apa adanya; kosong = tanpa batas. */
  responseWindowDays: string;
}

const EMPTY: Form = {
  principalName: '',
  principalNip: '',
  city: '',
  address: '',
  descA: '',
  descB: '',
  descC: '',
  descD: '',
  showRank: false,
  showCocurricular: false,
  showGuardianResponse: false,
  responseWindowDays: '30',
};

/** Pengaturan rapor: identitas penandatangan, deskripsi capaian per predikat, dan tampilan peringkat. */
export function ReportCardSettingsView() {
  const t = useTranslations('reportCards');
  const tv = useTranslations('formValidation');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [form, setForm] = useState<Form>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const manage = can('report_card:manage');
  const validation = useFormValidation<ReportSettingsField>({
    errors: validateReportSettings(form),
    order: REPORT_SETTINGS_ORDER,
    idPrefix: 'rc',
  });

  const key = ['report-card-settings', school.schoolId];
  const settings = useQuery({
    queryKey: key,
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/v1/report-cards/settings', { params: header })),
  });
  useEffect(() => {
    const d = settings.data;
    if (!d) return;
    setForm({
      principalName: d.principalName ?? '',
      principalNip: d.principalNip ?? '',
      city: d.city ?? '',
      address: d.address ?? '',
      descA: d.descA ?? '',
      descB: d.descB ?? '',
      descC: d.descC ?? '',
      descD: d.descD ?? '',
      showRank: d.showRank,
      showCocurricular: d.showCocurricular,
      showGuardianResponse: d.showGuardianResponse,
      responseWindowDays: d.responseWindowDays === null ? '' : String(d.responseWindowDays),
    });
    setDirty(false);
  }, [settings.data]);

  function patch(next: Partial<Form>) {
    setForm((f) => ({ ...f, ...next }));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/report-cards/settings', {
          params: header,
          body: {
            principalName: form.principalName.trim(),
            principalNip: form.principalNip.trim(),
            city: form.city.trim(),
            address: form.address.trim(),
            descA: form.descA.trim(),
            descB: form.descB.trim(),
            descC: form.descC.trim(),
            descD: form.descD.trim(),
            showRank: form.showRank,
            showCocurricular: form.showCocurricular,
            showGuardianResponse: form.showGuardianResponse,
            responseWindowDays: parseWindowDays(form.responseWindowDays) as number | null,
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('settingsSaved'));
      setDirty(false);
      validation.reset();
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader
        icon={Settings2}
        tone={MODULE_TONE.academic}
        title={t('settingsTitle')}
        description={t('settingsSubtitle')}
        actions={<BackLink href="/report-cards" />}
      />

      {settings.isPending && manage && <Skeleton className="h-64 w-full rounded-2xl" />}
      {settings.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(settings.error))}</AlertDescription>
        </Alert>
      )}

      {settings.data && (
        <form
          noValidate
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (validation.attempt()) save.mutate();
          }}
        >
          <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <div className="flex items-start gap-3">
              <IconTile icon={Signature} tone={MODULE_TONE.academic} />
              <div>
                <h2 className="font-heading text-lg font-semibold">{t('signerTitle')}</h2>
                <p className="text-muted-foreground text-sm">{t('signerHint')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TEXT_KEYS.map((k) => (
                <div
                  key={k}
                  className={
                    k === 'address' ? 'grid content-start gap-2 sm:col-span-2' : 'grid content-start gap-2'
                  }
                >
                  <Label htmlFor={validation.idOf(k)}>{t(`field_${k}`)}</Label>
                  <Input
                    {...validation.fieldProps(k)}
                    className={TOUCH_INPUT}
                    autoComplete="off"
                    maxLength={k === 'address' ? 200 : 100}
                    value={form[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  />
                  <FieldError id={validation.idOf(k)} issue={validation.issue(k)} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <div className="flex items-start gap-3">
              <IconTile icon={PenLine} tone="amber" />
              <div>
                <h2 className="font-heading text-lg font-semibold">{t('descTitle')}</h2>
                <p className="text-muted-foreground text-sm">{t('descHint')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {DESC_KEYS.map((k) => (
                <div key={k} className="grid content-start gap-2">
                  <Label htmlFor={validation.idOf(k)} className="gap-2">
                    <ToneBadge
                      tone={predicateTone(k.slice(-1))}
                      dot={false}
                      className="font-heading font-semibold"
                    >
                      {k.slice(-1)}
                    </ToneBadge>
                    {t(`field_${k}`)}
                  </Label>
                  <Textarea
                    {...validation.fieldProps(k)}
                    aria-required="true"
                    rows={3}
                    maxLength={300}
                    value={form[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  />
                  <FieldError id={validation.idOf(k)} issue={validation.issue(k)} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="gap-3 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <div className="flex items-start gap-3">
              <Checkbox
                id="rc-showRank"
                checked={form.showRank}
                onCheckedChange={(v) => patch({ showRank: v === true })}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="rc-showRank">{t('showRank')}</Label>
                <p className="text-muted-foreground text-sm">{t('showRankHint')}</p>
              </div>
            </div>
          </Card>

          <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <div className="flex items-start gap-3">
              <IconTile icon={FileText} tone="sky" />
              <div>
                <h2 className="font-heading text-lg font-semibold">{t('extraTitle')}</h2>
                <p className="text-muted-foreground text-sm">{t('extraHint')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="rc-showCocurricular"
                checked={form.showCocurricular}
                onCheckedChange={(v) => patch({ showCocurricular: v === true })}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="rc-showCocurricular">{t('showCocurricular')}</Label>
                <p className="text-muted-foreground text-sm">{t('showCocurricularHint')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="rc-showGuardianResponse"
                checked={form.showGuardianResponse}
                onCheckedChange={(v) => patch({ showGuardianResponse: v === true })}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="rc-showGuardianResponse">{t('showGuardianResponse')}</Label>
                <p className="text-muted-foreground text-sm">{t('showGuardianResponseHint')}</p>
              </div>
            </div>
            <div className="grid max-w-xs content-start gap-2">
              <Label htmlFor={validation.idOf('responseWindowDays')}>{t('responseWindowDays')}</Label>
              <Input
                {...validation.fieldProps('responseWindowDays')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                placeholder={t('responseWindowPlaceholder')}
                value={form.responseWindowDays}
                onChange={(e) => patch({ responseWindowDays: e.target.value })}
              />
              <FieldError
                id={validation.idOf('responseWindowDays')}
                issue={validation.issue('responseWindowDays')}
              />
              <p className="text-muted-foreground text-sm">{t('responseWindowHint')}</p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-10 md:h-8" disabled={!dirty || save.isPending}>
              {t('save')}
            </Button>
            {validation.summary && (
              <p aria-live="polite" className="text-destructive text-sm">
                {tv('summary')}
              </p>
            )}
          </div>
        </form>
      )}
    </PageBody>
  );
}
