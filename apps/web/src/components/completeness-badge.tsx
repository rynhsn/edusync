'use client';

import { useTranslations } from 'next-intl';
import { ToneBadge } from '@/components/ui-kit';
import { type CompletenessInput, dataCompleteness } from '@/lib/data-completeness';

/** Lencana "Kelengkapan data": Data lengkap, NIK belum diisi, atau Kontak belum lengkap. */
export function CompletenessBadge({ person }: { person: CompletenessInput }) {
  const t = useTranslations('common');
  const state = dataCompleteness(person);
  if (state === 'complete') return <ToneBadge tone="emerald">{t('dataComplete')}</ToneBadge>;
  if (state === 'missingNik') return <ToneBadge tone="amber">{t('nikMissing')}</ToneBadge>;
  return <ToneBadge tone="sky">{t('contactIncomplete')}</ToneBadge>;
}
