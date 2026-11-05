'use client';

import {
  BookOpen,
  Building2,
  LayoutDashboard,
  LifeBuoy,
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
import { AppHeader, MobileNavDrawer } from '@/components/app-header';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, UserAvatar } from '@/components/ui-kit';
import { UserMenu } from '@/components/user-menu';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { AccountProvider, useAccount, useAccountQuery } from './account-context';

type NavKey = 'overview' | 'units' | 'subscription' | 'billing' | 'members' | 'help' | 'docs' | 'profile';
type GroupKey = 'groupMain' | 'groupHelp' | 'groupMe';

interface NavItem {
  href: string;
  key: NavKey;
  icon: LucideIcon;
  exact?: boolean;
}

/** Menu dikelompokkan seperti konsol platform dan panel sekolah: pengelolaan, bantuan, lalu akun pribadi. */
const GROUPS: { key: GroupKey; items: NavItem[] }[] = [
  {
    key: 'groupMain',
    items: [
      { href: '/account', key: 'overview', icon: LayoutDashboard, exact: true },
      { href: '/account/units', key: 'units', icon: School },
      { href: '/account/subscription', key: 'subscription', icon: Sparkles },
      { href: '/account/billing', key: 'billing', icon: Receipt },
      { href: '/account/members', key: 'members', icon: Users },
    ],
  },
  {
    key: 'groupHelp',
    items: [
      { href: '/account/help', key: 'help', icon: LifeBuoy },
      { href: '/account/docs', key: 'docs', icon: BookOpen },
    ],
  },
  { key: 'groupMe', items: [{ href: '/account/profile', key: 'profile', icon: UserCog }] },
];

function FoundationPicker() {
  const { foundations, foundation, selectFoundation } = useAccount();
  const t = useTranslations('account.nav');
  if (foundations.length < 2) return null;
  return (
    <div className="grid gap-1.5 px-4 pb-3">
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

function SideNav() {
  const t = useTranslations('account.nav');
  const path = usePathname();
  return (
    <nav aria-label={t('label')} className="flex flex-col gap-0.5 px-4 pb-4">
      {GROUPS.map((group) => (
        <div key={group.key} className="mt-4 grid gap-0.5 first:mt-0">
          <p className="text-muted-foreground px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            {t(group.key)}
          </p>
          {group.items.map(({ href, key, icon: Icon, exact }) => {
            const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
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
                <Icon className={cn('size-4', active && 'text-primary')} aria-hidden />
                <span className="flex-1">{t(key)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Nama lembaga yang sedang dikelola, di kepala sidebar. */
function FoundationBadge() {
  const { foundation } = useAccount();
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
      <UserAvatar name={foundation.name} size="sm" />
      <span className="max-w-[12rem] truncate md:max-w-full">{foundation.name}</span>
    </span>
  );
}

/**
 * Kerangka portal akun, sama dengan konsol platform: sidebar kiri (menu geser di ponsel), kepala halaman
 * berisi bahasa, tema, dan keluar, serta penjaga data akun.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const router = useRouter();
  const { query, unauthenticated } = useAccountQuery();

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  const logoLink = (
    <Link href="/account" aria-label={t('title')}>
      <Logo />
    </Link>
  );
  const foundations = query.data?.foundations ?? [];

  const account = authClient.useSession().data?.user;
  const controls = (
    <UserMenu
      profileHref="/account/profile"
      name={account?.name}
      email={account?.email}
      image={account?.image}
    />
  );

  if (!query.data || foundations.length === 0) {
    // Memuat, galat, atau akun ini bukan pengelola lembaga: belum ada menu untuk ditampilkan.
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader leading={logoLink}>{controls}</AppHeader>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          {(query.isPending || unauthenticated) && (
            <div className="grid gap-4" aria-busy="true">
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
            <EmptyPanel
              icon={Building2}
              tone="rose"
              title={t('loadError')}
              action={<Button onClick={() => query.refetch()}>{tc('retry')}</Button>}
            />
          )}
          {query.data && foundations.length === 0 && (
            <EmptyPanel icon={Building2} tone="slate" title={t('notOwnerTitle')} body={t('notOwnerBody')} />
          )}
        </div>
      </div>
    );
  }

  const sidebar = (
    <>
      <div className="flex flex-col items-start gap-3 p-4">
        {logoLink}
        <FoundationBadge />
      </div>
      <FoundationPicker />
      <SideNav />
    </>
  );

  return (
    <AccountProvider foundations={foundations}>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="bg-sidebar text-sidebar-foreground hidden md:sticky md:top-0 md:block md:h-dvh md:w-64 md:shrink-0 md:overflow-y-auto md:border-r">
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            mobileNav={<MobileNavDrawer>{sidebar}</MobileNavDrawer>}
            leading={<span className="md:hidden">{logoLink}</span>}
          >
            {controls}
          </AppHeader>
          <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </AccountProvider>
  );
}
