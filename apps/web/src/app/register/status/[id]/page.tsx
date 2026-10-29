import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { StatusView } from './status-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registerStatus');
  return { title: t('title') };
}

export default async function RegistrationStatusPage({ params }: PageProps<'/register/status/[id]'>) {
  const { id } = await params;
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center p-4 pb-16">
        <StatusView id={id} />
      </div>
    </main>
  );
}
