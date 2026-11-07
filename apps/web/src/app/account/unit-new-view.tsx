'use client';

import { slugify } from '@edusync/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { School } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useConfig } from '@/lib/site';
import { SlugField, type SlugStatus } from '../register/slug-field';
import { goPay, useAccount } from './account-context';
import { PlanPicker } from './plan-picker';

export function UnitNewView() {
  const t = useTranslations('account');
  const te = useTranslations();
  const { foundation: f, money, date, moduleLabel, tierLabel } = useAccount();
  const config = useConfig();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugStatus | undefined>();
  const [plan, setPlan] = useState<{ modules: string[]; tier: string }>({ modules: [], tier: 't300' });
  const onStatus = useCallback((_id: string, s: SlugStatus) => setSlugState(s), []);

  const ready = name.trim().length >= 3 && slugState === 'available';
  const body = { name: name.trim(), slug, ...plan };
  const key = [...plan.modules].sort().join(',');

  const quote = useQuery({
    queryKey: ['unit-quote', f.id, name.trim(), slug, key, plan.tier],
    enabled: ready,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.POST('/v1/account/foundations/{foundationId}/units/quote', {
          params: { path: { foundationId: f.id } },
          body,
        }),
      ),
  });

  const submit = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/account/foundations/{foundationId}/units', {
          params: { path: { foundationId: f.id } },
          body,
        }),
      ),
    onSuccess: (r) => goPay(r.paymentUrl, '/account/units'),
  });

  const q = quote.data;
  return (
    <PageBody>
      <PageHeader
        icon={School}
        tone="teal"
        title={t('addUnit')}
        description={t('addUnitSubtitle')}
        actions={<BackLink href="/account/units" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="grid gap-5">
            <div className="grid content-start gap-2">
              <Label htmlFor="unit-name">{t('unitName')}</Label>
              <Input
                id="unit-name"
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <SlugField
              id="unit-slug"
              value={slug}
              onChange={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
              status={slugState}
              onStatus={onStatus}
              baseDomain={config.data?.baseDomain}
            />
            <PlanPicker idPrefix="new" modules={plan.modules} tier={plan.tier} onChange={setPlan} />
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('summary')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4" aria-live="polite">
            {!ready && <p className="text-muted-foreground text-sm">{t('fillFirst')}</p>}
            {ready && quote.isPending && <Skeleton className="h-24 w-full" />}
            {quote.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{te(errorKey(quote.error))}</AlertDescription>
              </Alert>
            )}
            {ready && q && (
              <div className="grid content-start gap-2">
                <ul className="divide-y rounded-xl border text-sm">
                  {q.lines.map((l) => (
                    <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        {l.key === 'core'
                          ? te('modules.core')
                          : tierLabel(l.key) === l.key
                            ? moduleLabel(l.key)
                            : tierLabel(l.key)}
                      </span>
                      <span className="tabular-nums">{money(l.amount)}</span>
                    </li>
                  ))}
                  <li className="bg-muted/50 flex items-center justify-between gap-3 px-3 py-2 font-medium">
                    <span>{t('total')}</span>
                    <span className="tabular-nums">{money(q.total)}</span>
                  </li>
                </ul>
                <p className="text-muted-foreground text-xs">
                  {t('prorataNote', { percent: Math.round(q.fraction * 100), date: date(q.periodEnd) })}
                </p>
              </div>
            )}
            {submit.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{te(errorKey(submit.error))}</AlertDescription>
              </Alert>
            )}
            <Button onClick={() => submit.mutate()} disabled={!ready || !q || submit.isPending}>
              {submit.isPending ? t('working') : t('payAndCreate')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
