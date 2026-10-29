import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('submit') };
}

export default async function LoginPage() {
  const t = await getTranslations('auth');
  return (
    <main className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-primary text-primary-foreground bg-grid relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Logo tone="inverse" />
        <div className="max-w-md">
          <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
            {t('heroTitle')}
          </h1>
          <p className="text-primary-foreground/80 mt-4 text-pretty">{t('heroBody')}</p>
          <ul className="mt-8 grid gap-3 text-sm">
            {(['point1', 'point2', 'point3'] as const).map((key) => (
              <li key={key} className="flex items-center gap-3">
                <CheckCircle2 className="text-amber size-5 shrink-0" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-primary-foreground/60 text-xs">© EduSync</p>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <Logo className="lg:hidden" />
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 pb-16">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
