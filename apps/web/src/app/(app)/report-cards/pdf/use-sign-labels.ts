import { useTranslations } from 'next-intl';
import type { SignLabels } from './report-card-pdf';

/** Teks tanda tangan rapor menurut bahasa pengguna; PDF dirender di klien tanpa akses hook, jadi diteruskan lewat props. */
export function useSignLabels(): SignLabels {
  const t = useTranslations('reportCards');
  return { parent: t('signParent'), homeroom: t('signHomeroom'), principal: t('signPrincipal') };
}
