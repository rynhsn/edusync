import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ApplyShell } from './shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('apply');
  return { title: t('metaTitle') };
}

/** Halaman publik pendaftaran murid baru: tanpa AppShell dan tanpa login. */
export default function ApplyLayout({ children }: LayoutProps<'/apply'>) {
  return <ApplyShell>{children}</ApplyShell>;
}
