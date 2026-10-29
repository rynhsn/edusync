'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronsUpDown, LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface Membership {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  roles: string[];
  permissions: string[];
}

interface SchoolContextValue {
  school: Membership;
  userName: string;
  can: (permission: string) => boolean;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool harus dipakai di dalam AppShell');
  return ctx;
}

/** Menu diturunkan dari izin. Menambah modul berarti menambah satu baris di sini. */
const NAV = [
  { href: '/dashboard', labelKey: 'overview', icon: LayoutDashboard, permission: null },
  {
    href: '/academic-years',
    labelKey: 'academicYears',
    icon: CalendarDays,
    permission: 'academic_year:read',
  },
] as const;

/** Akun tanpa sekolah: bila ia staf platform, arahkan ke konsol; selain itu jelaskan cara diundang. */
function NoSchool(props: { title: string; body: string; signOutLabel: string; onSignOut: () => void }) {
  const router = useRouter();
  const staff = useQuery({
    queryKey: ['platform-me'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/me')),
  });
  useEffect(() => {
    if (staff.data) router.replace('/platform');
  }, [staff.data, router]);

  if (staff.isPending || staff.data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-medium">{props.title}</p>
      <p className="text-muted-foreground text-sm">{props.body}</p>
      <Button variant="outline" onClick={props.onSignOut}>
        {props.signOutLabel}
      </Button>
    </div>
  );
}

const STORAGE_KEY = 'edusync.activeSchool';

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sumber kebenaran sesi adalah API: 401 dari /v1/me berarti belum masuk.
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => unwrap(await api.GET('/v1/me')),
  });
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  useEffect(() => {
    try {
      setActiveId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Penyimpanan bisa diblokir; pilihan sekolah tetap berjalan untuk sesi ini.
    }
  }, []);

  const memberships = me.data?.memberships ?? [];
  const school = useMemo(
    () => memberships.find((m) => m.schoolId === activeId) ?? memberships[0],
    [memberships, activeId],
  );

  function choose(id: string) {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Tidak masalah bila gagal disimpan.
    }
  }

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  const roleLabel = (key: string) => (tr.has(key as never) ? tr(key as never) : key);

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p>{t('loadError')}</p>
        <Button onClick={() => me.refetch()}>{tc('retry')}</Button>
      </div>
    );
  }

  if (!school) {
    return (
      <NoSchool
        title={t('noSchoolTitle')}
        body={t('noSchoolBody')}
        signOutLabel={tc('signOut')}
        onSignOut={signOut}
      />
    );
  }

  const permissions = new Set(school.permissions);
  const user = me.data.user;
  const value: SchoolContextValue = { school, userName: user.name, can: (p) => permissions.has(p) };
  const initials = user.name.slice(0, 2).toUpperCase();
  const roles = school.roles.map(roleLabel).join(', ') || tr('none');

  return (
    <SchoolContext.Provider value={value}>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="bg-sidebar text-sidebar-foreground border-b md:w-64 md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-2 p-3 md:flex-col md:items-stretch md:gap-5 md:p-4">
            <Logo />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="bg-card h-auto justify-between py-2 md:w-full" />
                }
              >
                <span className="truncate text-left">
                  <span className="block truncate text-sm font-medium">{school.schoolName}</span>
                  <span className="text-muted-foreground block truncate text-xs">{roles}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t('switchSchool')}</DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem key={m.schoolId} onClick={() => choose(m.schoolId)}>
                      <span className="flex-1 truncate">{m.schoolName}</span>
                      {m.schoolId === school.schoolId && <Badge variant="secondary">{t('active')}</Badge>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-4" aria-label={t('menu')}>
            {NAV.filter((n) => n.permission === null || permissions.has(n.permission)).map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                  )}
                >
                  <n.icon className={cn('size-4', active && 'text-primary')} />
                  {t(n.labelKey)}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-1 border-b p-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto gap-2 py-1" />}>
                <Avatar className="size-7">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden text-sm sm:inline">{user.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <span className="block text-sm font-medium">{user.name}</span>
                    <span className="text-muted-foreground block text-xs">{user.email}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="size-4" /> {tc('signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </SchoolContext.Provider>
  );
}
