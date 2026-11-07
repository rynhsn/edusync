import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { MainHostOnly } from '@/components/main-host-only';
import { ThemeToggle } from '@/components/theme-toggle';
import { PlatformInviteView } from './invite-view';

// Tautan membawa token undangan; jangan bocor lewat header Referer dan jangan diindeks.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformInvite');
  return { title: t('title'), referrer: 'no-referrer', robots: { index: false } };
}

export default async function PlatformInvitePage({ params }: PageProps<'/platform-invite/[token]'>) {
  const { token } = await params;
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 items-start justify-center p-4 pt-10 pb-16">
        <MainHostOnly>
          <PlatformInviteView token={token} />
        </MainHostOnly>
      </div>
    </main>
  );
}
