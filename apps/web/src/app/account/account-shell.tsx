'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Building2,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Receipt,
  School,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, UserAvatar } from '@/components/ui-kit';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { AccountProvider, useAccount, useAccountQuery } from './account-context';

const NAV = [
  { href: '/account', key: 'overview', icon: LayoutDashboard, exact: true },
  { href: '/account/units', key: 'units', icon: School },
  { href: '/account/subscription', key: 'subscription', icon: Sparkles },
  { href: '/account/billing', key: 'billing', icon: Receipt },
  { href: '/account/members', key: 'members', icon: Users },
  { href: '/account/help', key: 'help', icon: LifeBuoy },
  { href: '/account/docs', key: 'docs', icon: BookOpen },
  { href: '/account/profile', key: 'profile', icon: UserCog },
] as const satisfies readonly { href: string; key: string; icon: LucideIcon; exact?: boolean }[];

function Nav() {
  const t = useTranslations('account.nav');
  const path = usePathname();
  return (
    <nav aria-label={t('label')} className="md:sticky md:top-20">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
        {NAV.map((item) => {
          const { href, key, icon: Icon } = item;
          const exact = 'exact' in item;
          const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary/10 text-primary dark:bg-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden /> {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FoundationPicker() {
  const { foundations, foundation, selectFoundation } = useAccount();
  const t = useTranslations('account.nav');
  if (foundations.length < 2) return null;
  return (
    <div className="mb-3 grid gap-1.5">
      <Label htmlFor="foundation-picker" className="text-xs">
        {t('foundation')}
      </Label>
      <SelectField
        id="foundation-picker"
        value={foundation.id}
        onChange={(e) => selectFoundation(e.target.value)}
      >
        {foundations.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** Kerangka portal akun: kepala halaman, navigasi samping (tab geser di ponsel), dan penjaga data akun. */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { query, unauthenticated } = useAccountQuery();

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  const foundations = query.data?.foundations ?? [];
  const firstName = foundations[0]?.name;

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-background/80 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b p-3 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/account" aria-label={t('title')}>
            <Logo />
          </Link>
          {firstName && (
            <span className="text-muted-foreground hidden items-center gap-2 border-l pl-3 text-sm sm:flex">
              <UserAvatar name={firstName} size="sm" />
              <span className="max-w-[16rem] truncate">{firstName}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> {tc('signOut')}
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 p-4 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-8 md:p-8">
        {(query.isPending || unauthenticated) && (
          <div className="grid gap-4 md:col-span-2" aria-busy="true">
            <Skeleton className="h-12 w-72" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        )}

        {query.isError && !unauthenticated && (
          <div className="md:col-span-2">
            <EmptyPanel
              icon={Building2}
              tone="rose"
              title={t('loadError')}
              action={<Button onClick={() => query.refetch()}>{tc('retry')}</Button>}
            />
          </div>
        )}

        {query.data && foundations.length === 0 && (
          <div className="md:col-span-2">
            <EmptyPanel icon={Building2} tone="slate" title={t('notOwnerTitle')} body={t('notOwnerBody')} />
          </div>
        )}

        {query.data && foundations.length > 0 && (
          <AccountProvider foundations={foundations}>
            <aside>
              <FoundationPicker />
              <Nav />
            </aside>
            <main className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              {children}
            </main>
          </AccountProvider>
        )}
      </div>
    </div>
  );
}
