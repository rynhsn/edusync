import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PasswordHelpView } from './password-help-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('passwordHelp');
  return { title: t('title') };
}

export default function Page() {
  return <PasswordHelpView />;
}
