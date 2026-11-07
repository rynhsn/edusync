'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { OnboardingCard } from '@/components/onboarding-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { markOpenedSchool, ownerSteps, readOpenedSchool } from '@/lib/onboarding-steps';
import { goToSchool, useSite } from '@/lib/site';
import { useAccount } from './account-context';

export function OwnerOnboarding() {
  const t = useTranslations('accountOnboarding');
  const { foundation: f } = useAccount();
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(readOpenedSchool(f.id)), [f.id]);

  const states = ownerSteps({
    subscriptionStatus: f.subscription?.status ?? null,
    openInvoices: f.invoices.filter((i) => i.status === 'open').length,
    openedSchool: opened,
  });
  const copy: Record<string, { label: string; hint: string; cta: string }> = {
    pay: { label: t('payLabel'), hint: t('payHint'), cta: t('payCta') },
    openSchool: { label: t('schoolLabel'), hint: t('schoolHint'), cta: t('schoolCta') },
  };
  const steps = states.map((s) => ({
    id: s.id,
    done: s.done,
    href: s.href,
    label: copy[s.id]?.label ?? s.id,
    hint: copy[s.id]?.hint,
    cta: copy[s.id]?.cta,
  }));

  return (
    <OnboardingCard
      storageKey={`onboarding:account:${f.id}`}
      title={t('title')}
      description={t('description')}
      steps={steps}
      progressLabel={t('progress', { done: steps.filter((s) => s.done).length, total: steps.length })}
      openLabel={t('open')}
      dismissLabel={t('dismiss')}
    />
  );
}

/** Daftar sekolah dengan tombol "Buka sekolah" langsung di Ringkasan, supaya pemilik tidak perlu mencari menunya. */
export function SchoolsQuickOpen() {
  const t = useTranslations('accountOnboarding');
  const ta = useTranslations('account');
  const { foundation: f } = useAccount();
  const site = useSite();
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (f.schools.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="font-heading text-lg">{t('yourSchools')}</CardTitle>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/account/units" />}>
          {t('allUnits')}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground text-sm">{t('yourSchoolsBody')}</p>
        {failed && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('openError')}</AlertDescription>
          </Alert>
        )}
        <ul className="grid content-start gap-2">
          {f.schools.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="text-muted-foreground block truncate font-mono text-xs">{s.slug}</span>
              </span>
              {site.ready && s.status === 'active' && (
                <Button
                  size="sm"
                  disabled={opening !== null}
                  onClick={async () => {
                    setOpening(s.id);
                    setFailed(false);
                    try {
                      markOpenedSchool(f.id);
                      await goToSchool(site, s.slug);
                    } catch {
                      setFailed(true);
                    } finally {
                      setOpening(null);
                    }
                  }}
                >
                  <ExternalLink className="size-3.5" aria-hidden />{' '}
                  {opening === s.id ? t('opening') : ta('openSchool')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
