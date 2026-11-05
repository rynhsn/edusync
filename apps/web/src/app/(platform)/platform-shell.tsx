'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookMarked,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  History,
  LifeBuoy,
  Mail,
  Package,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect } from 'react';
import { AppHeader, MobileNavDrawer } from '@/components/app-header';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import { UserMenu, useSignOut } from '@/components/user-menu';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { QueryError } from './platform/platform-kit';

type StaffRole = 'admin' | 'read_only';
const StaffContext = createContext<{ role: StaffRole } | null>(null);

export function useStaff() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaff harus dipakai di dalam PlatformShell');
  return ctx;
}

/** Menu konsol bertingkat: Operasi, Katalog, Sistem, lalu Bantuan. */
const GROUPS = [
  {
    key: 'groupOps',
    items: [
      { href: '/platform', key: 'foundations', icon: Building2 },
      { href: '/platform/pending', key: 'pending', icon: ClipboardList },
      { href: '/platform/payments', key: 'payments', icon: CreditCard },
      { href: '/platform/email', key: 'email', icon: Mail },
    ],
  },
  {
    key: 'groupConfig',
    items: [
      { href: '/platform/catalog', key: 'catalog', icon: Package },
      { href: '/platform/curriculum', key: 'curriculum', icon: BookMarked },
    ],
  },
  {
    key: 'groupWatch',
    items: [
      { href: '/platform/messaging', key: 'messaging', icon: Send },
      { href: '/platform/users', key: 'users', icon: Users },
      { href: '/platform/audit', key: 'audit', icon: History },
    ],
  },
  {
    key: 'groupHelp',
    items: [
      { href: '/platform/guide', key: 'guide', icon: LifeBuoy },
      { href: '/platform/docs', key: 'docs', icon: BookOpen },
    ],
  },
] as const;

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('platform');
  const tc = useTranslations('common');
  const session = authClient.useSession();
  const account = session.data?.user;
  const router = useRouter();
  const pathname = usePathname();

  const me = useQuery({
    queryKey: ['platform-me'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/me')),
  });
  const overview = useQuery({
    queryKey: ['platform-overview'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/overview')),
    enabled: me.isSuccess,
  });
  const pendingCount = overview.data?.pendingRegistrations ?? 0;
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const forbidden = me.error instanceof ApiError && me.error.status === 403;

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  const signOut = useSignOut();

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (me.isError && !forbidden) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 p-8">
        <QueryError error={me.error} onRetry={() => me.refetch()} />
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

  const sidebar = (
    <>
      <div className="flex flex-col items-start gap-3 p-4">
        <Logo />
        <span className="bg-amber text-amber-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
          <ShieldCheck className="size-3" aria-hidden /> {t('title')}
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 px-4 pb-4" aria-label={t('title')}>
        {GROUPS.map((group) => (
          <div key={group.key} className="mt-4 grid gap-0.5 first:mt-0">
            <p className="text-muted-foreground px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wider uppercase">
              {t(group.key)}
            </p>
            {group.items.map((item) => {
              const active =
                pathname === item.href || (item.href !== '/platform' && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                  )}
                >
                  {active && (
                    <span aria-hidden className="bg-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full" />
                  )}
                  <item.icon className={cn('size-4', active && 'text-primary')} />
                  <span className="flex-1">{t(item.key)}</span>
                  {item.key === 'pending' && pendingCount > 0 && (
                    <span className="bg-amber text-amber-foreground rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <StaffContext.Provider value={{ role: me.data.role }}>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="bg-sidebar text-sidebar-foreground hidden md:sticky md:top-0 md:block md:h-dvh md:w-64 md:shrink-0 md:overflow-y-auto md:border-r">
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            mobileNav={<MobileNavDrawer>{sidebar}</MobileNavDrawer>}
            leading={
              <>
                <span className="md:hidden">
                  <Logo />
                </span>
                {/* Di ponsel ruang topbar sempit: lencana peran hanya tampil mulai lebar sm. */}
                <span className="hidden sm:inline-flex">
                  <ToneBadge tone={me.data.role === 'admin' ? 'emerald' : 'slate'}>
                    {me.data.role === 'admin' ? t('roleAdmin') : t('roleReadOnly')}
                  </ToneBadge>
                </span>
              </>
            }
          >
            <UserMenu
              profileHref="/platform/profile"
              name={account?.name}
              email={account?.email}
              image={account?.image}
            />
          </AppHeader>
          <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </StaffContext.Provider>
  );
}
