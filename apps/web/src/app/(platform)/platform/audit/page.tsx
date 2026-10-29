import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuditView } from './audit-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform');
  return { title: t('audit') };
}

export default function AuditPage() {
  return <AuditView />;
}
