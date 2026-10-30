'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ClipboardList, CreditCard, History, LogOut, Package, Send } from 'lucide-react';
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

/** Menu konsol dikelompokkan menurut fungsinya. */
const GROUPS = [
  {
    key: 'groupOps',
    items: [
      { href: '/platform', key: 'foundations', icon: Building2 },
      { href: '/platform/pending', key: 'pending', icon: ClipboardList },
    ],
  },
  {
    key: 'groupConfig',
    items: [
      { href: '/platform/catalog', key: 'catalog', icon: Package },
      { href: '/platform/payments', key: 'payments', icon: CreditCard },
      { href: '/platform/messaging', key: 'messaging', icon: Send },
    ],
  },
  {
    key: 'groupWatch',
    items: [{ href: '/platform/audit', key: 'audit', icon: History }],
  },
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
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="bg-sidebar text-sidebar-foreground border-b md:w-64 md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-2 p-3 md:flex-col md:items-start md:gap-3 md:p-4">
            <Logo />
            <span className="bg-amber text-amber-foreground rounded-md px-2 py-0.5 text-xs font-medium">
              {t('title')}
            </span>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-col md:gap-0.5 md:overflow-visible md:px-4 [&::-webkit-scrollbar]:hidden"
            aria-label={t('title')}
          >
            {GROUPS.map((group) => (
              <div key={group.key} className="contents md:mt-3 md:grid md:gap-0.5 md:first:mt-0">
                <p className="text-muted-foreground hidden px-3 pt-1 pb-1 text-xs font-medium tracking-wide uppercase md:block">
                  {t(group.key)}
                </p>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== '/platform' && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                      )}
                    >
                      <item.icon className={cn('size-4', active && 'text-primary')} />
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-1 border-b p-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" /> {tc('signOut')}
            </Button>
          </header>
          <main className="w-full flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </StaffContext.Provider>
  );
}
