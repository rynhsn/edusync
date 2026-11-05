'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { OnboardingCard } from '@/components/onboarding-card';
import { api, unwrap } from '@/lib/api';
import { staffSteps } from '@/lib/onboarding-steps';
import { useStaff } from '../platform-shell';

/** Panduan awal staf admin: email, pembayaran, katalog. Selesainya dihitung dari pengaturan yang tersimpan. */
export function StaffOnboarding() {
  const t = useTranslations('platformOnboarding');
  const { role } = useStaff();
  const enabled = role === 'admin';
  const smtp = useQuery({
    queryKey: ['platform-smtp-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/smtp-settings')),
    enabled,
  });
  const payment = useQuery({
    queryKey: ['platform-payment-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/payment-settings')),
    enabled,
  });
  const catalog = useQuery({
    queryKey: ['platform-catalog'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/catalog')),
    enabled,
  });
  if (!enabled) return null;

  const copy: Record<string, { label: string; hint: string }> = {
    email: { label: t('emailLabel'), hint: t('emailHint') },
    payment: { label: t('paymentLabel'), hint: t('paymentHint') },
    catalog: { label: t('catalogLabel'), hint: t('catalogHint') },
  };
  const steps = staffSteps({ smtp: smtp.data, payment: payment.data, catalog: catalog.data }).map((s) => ({
    ...s,
    label: copy[s.id]?.label ?? s.id,
    hint: copy[s.id]?.hint,
  }));
  // Tunggu ketiganya agar daftar tidak bertambah panjang sambil dibaca.
  if (!smtp.data || !payment.data || !catalog.data) return null;

  return (
    <OnboardingCard
      storageKey="onboarding:platform"
      title={t('title')}
      description={t('description')}
      steps={steps}
      progressLabel={t('progress', { done: steps.filter((s) => s.done).length, total: steps.length })}
      openLabel={t('open')}
      dismissLabel={t('dismiss')}
    />
  );
}
