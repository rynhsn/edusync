import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ForgotForm } from './forgot-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forgot');
  return { title: t('title') };
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 pb-16">
        <ForgotForm />
      </div>
    </main>
  );
}
