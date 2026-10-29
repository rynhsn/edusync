'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type StaffRole = 'admin' | 'read_only';
const StaffContext = createContext<{ role: StaffRole } | null>(null);

export function useStaff() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaff harus dipakai di dalam PlatformShell');
  return ctx;
}

const TABS = [
  { href: '/platform', key: 'foundations' },
  { href: '/platform/pending', key: 'pending' },
  { href: '/platform/audit', key: 'audit' },
] as const;

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('platform');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['platform-me'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/me')),
  });
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const forbidden = me.error instanceof ApiError && me.error.status === 403;

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (forbidden || !me.data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{t('notStaff')}</p>
        <Button variant="outline" onClick={signOut}>
          {tc('signOut')}
        </Button>
      </div>
    );
  }

  return (
    <StaffContext.Provider value={{ role: me.data.role }}>
      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3 md:px-6">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="bg-amber text-amber-foreground rounded-md px-2 py-0.5 text-xs font-medium">
              {t('title')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" /> {tc('signOut')}
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b px-3 md:px-6" aria-label={t('title')}>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'border-primary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </StaffContext.Provider>
  );
}
