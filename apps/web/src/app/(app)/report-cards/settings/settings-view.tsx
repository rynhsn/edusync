'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine, Settings2, Signature } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
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
import { predicateTone } from '../../grades/grade-ui';
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
};

/** Pengaturan rapor: identitas penandatangan, deskripsi capaian per predikat, dan tampilan peringkat. */
export function ReportCardSettingsView() {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [form, setForm] = useState<Form>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const manage = can('report_card:manage');

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
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('settingsSaved'));
      setDirty(false);
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
      />

      {settings.isPending && manage && <Skeleton className="h-64 w-full rounded-2xl" />}
      {settings.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(settings.error))}</AlertDescription>
        </Alert>
      )}

      {settings.data && (
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
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
                <div key={k} className={k === 'address' ? 'grid gap-2 sm:col-span-2' : 'grid gap-2'}>
                  <Label htmlFor={`rc-${k}`}>{t(`field_${k}`)}</Label>
                  <Input
                    id={`rc-${k}`}
                    maxLength={k === 'address' ? 200 : 100}
                    value={form[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  />
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
                <div key={k} className="grid gap-2">
                  <Label htmlFor={`rc-${k}`} className="gap-2">
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
                    id={`rc-${k}`}
                    rows={3}
                    maxLength={300}
                    value={form[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  />
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

          <div>
            <Button type="submit" disabled={!dirty || save.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </PageBody>
  );
}
