'use client';

import { BILLING_SETTINGS_LIMITS, type BillingSettings } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';

const FIELDS = ['graceDays', 'renewalLeadDays', 'reservationHours', 'yearlyMonths'] as const;
type Draft = Record<(typeof FIELDS)[number], string>;

const toDraft = (s: BillingSettings): Draft => ({
  graceDays: String(s.graceDays),
  renewalLeadDays: String(s.renewalLeadDays),
  reservationHours: String(s.reservationHours),
  yearlyMonths: String(s.yearlyMonths),
});

/** Parameter penagihan global: masa tenggang, pengingat perpanjangan, masa pesanan, dan pengali tahunan. */
export function BillingSettingsCard() {
  const t = useTranslations('platformBilling');
  const te = useTranslations();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const canEdit = role === 'admin';

  const settings = useQuery({
    queryKey: ['platform-billing-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/billing-settings')),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(toDraft(settings.data));
  }, [settings.data]);

  const parsed = draft
    ? (Object.fromEntries(FIELDS.map((k) => [k, Number(draft[k])])) as unknown as BillingSettings)
    : null;
  const valid =
    parsed !== null &&
    FIELDS.every((k) => {
      const n = parsed[k];
      const { min, max } = BILLING_SETTINGS_LIMITS[k];
      return Number.isInteger(n) && n >= min && n <= max;
    });
  const dirty = !!settings.data && !!draft && FIELDS.some((k) => draft[k] !== String(settings.data[k]));

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error('no draft');
      return unwrap(await api.PUT('/v1/platform/billing-settings', { body: parsed }));
    },
    onSuccess: () => {
      setError(null);
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['platform-billing-settings'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (settings.isPending || !draft) return <Skeleton className="h-64 w-full" />;
  if (!settings.data) return null;
  const defaults = settings.data.defaults;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-2xl gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {FIELDS.map((k) => {
              const { min, max } = BILLING_SETTINGS_LIMITS[k];
              const n = Number(draft[k]);
              const bad = !(Number.isInteger(n) && n >= min && n <= max);
              return (
                <div key={k} className="grid content-start gap-2">
                  <Label htmlFor={`bill-${k}`}>{t(`${k}.label`)}</Label>
                  <Input
                    id={`bill-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    disabled={!canEdit}
                    aria-invalid={bad}
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                  <p className={bad ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                    {bad ? t('range', { min, max }) : t(`${k}.hint`)}
                    {!bad && ` · ${t('defaultValue', { value: defaults[k] })}`}
                  </p>
                </div>
              );
            })}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!dirty || !valid || save.isPending}>
                {t('save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(toDraft(defaults))}>
                <RotateCcw className="size-4" /> {t('resetDefaults')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
