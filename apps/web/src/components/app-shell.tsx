'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookHeart,
  BookMarked,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  Clock,
  DoorOpen,
  Factory,
  FileText,
  Globe,
  GraduationCap,
  HardHat,
  HeartHandshake,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MoonStar,
  PenLine,
  Receipt,
  School,
  ScrollText,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect } from 'react';
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
import { isPortalOnly, isPortalPath } from '@/lib/portal-access';
import { goToSchool, useSite } from '@/lib/site';
import { cn } from '@/lib/utils';

interface Membership {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  roles: string[];
  permissions: string[];
  modules: string[];
}

interface SchoolContextValue {
  school: Membership;
  userName: string;
  userId: string;
  can: (permission: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool harus dipakai di dalam AppShell');
  return ctx;
}

/** Menu diturunkan dari izin. Menambah modul berarti menambah satu baris di sini. */
/** Menu dikelompokkan menurut fungsinya; kelompok tanpa menu yang boleh dilihat pengguna disembunyikan. */
export const NAV_GROUPS = [
  {
    key: null,
    items: [{ href: '/dashboard', labelKey: 'overview', icon: LayoutDashboard, permission: null }],
  },
  {
    key: 'groupMaster',
    items: [
      {
        href: '/academic-years',
        labelKey: 'academicYears',
        icon: CalendarDays,
        permission: 'academic_year:read',
      },
      { href: '/calendar', labelKey: 'calendar', icon: CalendarRange, permission: 'academic_year:read' },
      { href: '/classes', labelKey: 'classes', icon: School, permission: 'class:read' },
      { href: '/students', labelKey: 'students', icon: GraduationCap, permission: 'student:read' },
      { href: '/teachers', labelKey: 'teachers', icon: UserRound, permission: 'teacher:read' },
      { href: '/subjects', labelKey: 'subjects', icon: BookOpen, permission: 'subject:read' },
    ],
  },
  {
    key: 'groupAcademic',
    items: [
      {
        href: '/schedule',
        labelKey: 'schedule',
        icon: Clock,
        permission: 'schedule:read',
        module: 'schedule',
      },
      {
        href: '/attendance',
        labelKey: 'attendance',
        icon: ClipboardCheck,
        permission: 'attendance:read',
        module: 'attendance',
      },
      {
        href: '/lessons',
        labelKey: 'lessons',
        icon: ClipboardList,
        permission: 'attendance:read',
        module: 'attendance',
      },
      {
        href: '/gate',
        labelKey: 'gate',
        icon: DoorOpen,
        permission: 'attendance:read',
        module: 'attendance',
      },
      {
        href: '/attendance-settings',
        labelKey: 'attendanceSettings',
        icon: Settings2,
        permission: 'attendance:configure',
        module: 'attendance',
      },
      {
        href: '/extracurriculars',
        labelKey: 'extracurricular',
        icon: Trophy,
        permission: 'extracurricular:read',
        module: 'extracurricular',
      },
      {
        href: '/grades',
        labelKey: 'grades',
        icon: Award,
        permission: 'grade:read',
        module: 'grades',
      },
      {
        href: '/grades/settings',
        labelKey: 'gradeSettings',
        icon: SlidersHorizontal,
        permission: 'grade:configure',
        module: 'grades',
      },
      {
        href: '/report-cards',
        labelKey: 'reportCards',
        icon: BookMarked,
        permission: 'report_card:read',
        module: 'grades',
      },
      {
        href: '/report-cards/settings',
        labelKey: 'reportCardSettings',
        icon: FileText,
        permission: 'report_card:manage',
        module: 'grades',
      },
      {
        href: '/messaging',
        labelKey: 'messaging',
        icon: MessageCircle,
        permission: 'message:read',
        module: 'messaging',
      },
    ],
  },
  {
    key: 'groupGuidance',
    items: [
      {
        href: '/tahfidz',
        labelKey: 'tahfidz',
        icon: BookHeart,
        permission: 'tahfidz:read',
        module: 'tahfidz',
      },
      {
        href: '/tahfidz/ibadah',
        labelKey: 'ibadah',
        icon: MoonStar,
        permission: 'tahfidz:read',
        module: 'tahfidz',
      },
      {
        href: '/tahfidz/settings',
        labelKey: 'ibadahSettings',
        icon: Sprout,
        permission: 'tahfidz:manage',
        module: 'tahfidz',
      },
    ],
  },
  {
    key: 'groupFinance',
    items: [
      { href: '/finance', labelKey: 'cashier', icon: Wallet, permission: 'finance:pay', module: 'finance' },
      {
        href: '/finance/invoices',
        labelKey: 'invoices',
        icon: Receipt,
        permission: 'finance:read',
        module: 'finance',
      },
      {
        href: '/finance/settings',
        labelKey: 'financeSettings',
        icon: WalletCards,
        permission: 'finance:manage',
        module: 'finance',
      },
      {
        href: '/finance/reports',
        labelKey: 'financeReports',
        icon: Landmark,
        permission: 'finance:read',
        module: 'finance',
      },
    ],
  },
  {
    key: 'groupInternship',
    items: [
      {
        href: '/pkl',
        labelKey: 'pkl',
        icon: BriefcaseBusiness,
        permission: 'pkl:read',
        module: 'internship',
      },
      {
        href: '/pkl/partners',
        labelKey: 'pklPartners',
        icon: Factory,
        permission: 'pkl:read',
        module: 'internship',
      },
      {
        href: '/pkl/settings',
        labelKey: 'pklSettings',
        icon: HardHat,
        permission: 'pkl:manage',
        module: 'internship',
      },
    ],
  },
  {
    key: 'groupAdmissions',
    items: [
      {
        href: '/admissions',
        labelKey: 'admissions',
        icon: UserPlus,
        permission: 'admission:read',
        module: 'admissions',
      },
      {
        href: '/admissions/periods',
        labelKey: 'admissionPeriods',
        icon: ClipboardSignature,
        permission: 'admission:manage',
        module: 'admissions',
      },
    ],
  },
  {
    key: 'groupAdministration',
    items: [
      {
        href: '/letters',
        labelKey: 'letters',
        icon: Mail,
        permission: 'letter:read',
        module: 'administration',
      },
      {
        href: '/letters/templates',
        labelKey: 'letterTemplates',
        icon: ScrollText,
        permission: 'letter:manage',
        module: 'administration',
      },
      {
        // Dapat dibuka pengelola surat atau penandatangan (untuk tanda tangannya sendiri).
        href: '/letters/signers',
        labelKey: 'letterSigners',
        icon: PenLine,
        permission: 'letter:manage',
        orPermission: 'letter:sign',
        module: 'administration',
      },
    ],
  },
  {
    key: 'groupPortal',
    items: [
      {
        href: '/portal',
        labelKey: 'portal',
        icon: HeartHandshake,
        permission: 'portal:read',
        module: 'parent_portal',
      },
      {
        href: '/portal-admin',
        labelKey: 'portalAdmin',
        icon: KeyRound,
        permission: 'student:manage',
        module: 'parent_portal',
      },
    ],
  },
  {
    key: 'groupWebsite',
    items: [
      {
        href: '/announcements',
        labelKey: 'announcements',
        icon: Megaphone,
        permission: 'announcement:read',
        module: 'announcements',
      },
      {
        href: '/site-settings',
        labelKey: 'siteSettings',
        icon: Globe,
        permission: 'announcement:manage',
        module: 'website',
      },
    ],
  },
  {
    key: 'groupAccess',
    items: [
      { href: '/members', labelKey: 'members', icon: Users, permission: 'member:read' },
      { href: '/roles', labelKey: 'roles', icon: ShieldCheck, permission: 'member:read' },
    ],
  },
] as const;

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">{children}</div>
  );
}

/**
 * Kerangka sekolah. Sekolah yang aktif ditentukan oleh alamat (<alamat>.domain), bukan oleh pilihan di layar:
 * satu alamat = satu sekolah. Di alamat utama halaman ini tidak ada artinya, jadi pengguna dikembalikan ke
 * gerbang, yang memindahkannya ke alamat sekolahnya.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const site = useSite();

  // Sumber kebenaran sesi adalah API: 401 dari /v1/me berarti belum masuk.
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => unwrap(await api.GET('/v1/me')),
  });
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const onMainHost = site.ready && site.kind === 'main';

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  useEffect(() => {
    if (onMainHost) router.replace('/');
  }, [onMainHost, router]);

  // Wali/siswa (hanya izin portal) tidak punya halaman staf: apa pun alamatnya, arahkan ke portal.
  const portalSlug = site.ready && site.kind === 'school' ? site.slug : '';
  const portalMembership = me.data?.memberships.find((m) => m.schoolSlug === portalSlug);
  const portalOnly = !!portalMembership && isPortalOnly(portalMembership.permissions);
  const strayFromPortal = portalOnly && !isPortalPath(pathname);
  useEffect(() => {
    if (strayFromPortal) router.replace('/portal');
  }, [strayFromPortal, router]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  const roleLabel = (key: string) => (tr.has(key as never) ? tr(key as never) : key);

  if (!site.ready || me.isPending || unauthenticated || onMainHost || strayFromPortal) {
    return (
      <Centered>
        <Skeleton className="h-8 w-48" />
      </Centered>
    );
  }

  if (me.isError) {
    return (
      <Centered>
        <p>{t('loadError')}</p>
        <Button onClick={() => me.refetch()}>{tc('retry')}</Button>
      </Centered>
    );
  }

  const slug = site.kind === 'school' ? site.slug : '';
  const memberships = me.data.memberships;
  const school = memberships.find((m) => m.schoolSlug === slug);

  // Sekolah yang tidak ada dan sekolah yang bukan milik pengguna dijawab sama, agar alamat tidak bisa ditebak.
  if (!school) {
    return (
      <Centered>
        <p className="font-medium">{t('notMemberTitle')}</p>
        <p className="text-muted-foreground max-w-sm text-sm">{t('notMemberBody')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={signOut}>
            {tc('signOut')}
          </Button>
          <Button nativeButton={false} render={<a href={site.urlFor(null, '/')} />}>
            {t('goMain')}
          </Button>
        </div>
      </Centered>
    );
  }

  const permissions = new Set(school.permissions);
  const user = me.data.user;
  const value: SchoolContextValue = {
    school,
    userName: user.name,
    userId: user.id,
    can: (p) => permissions.has(p),
    hasModule: (m) => school.modules.includes(m),
  };
  const initials = user.name.slice(0, 2).toUpperCase();
  const roles = school.roles.map(roleLabel).join(', ') || tr('none');

  // Kerangka ringan untuk wali/siswa: tanpa menu samping, nyaman di ponsel.
  if (portalOnly) {
    return (
      <SchoolContext.Provider value={value}>
        <div className="flex flex-1 flex-col">
          <header className="bg-background/90 sticky top-0 z-20 flex items-center justify-between gap-2 border-b p-3 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <Logo />
              <span className="text-muted-foreground hidden truncate text-sm sm:inline">
                {school.schoolName}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" className="h-auto gap-2 py-1" aria-label={user.name} />}
                >
                  <Avatar className="size-7">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                      <span className="block text-sm font-medium">{user.name}</span>
                      <span className="text-muted-foreground block text-xs">{user.email}</span>
                      <span className="text-muted-foreground block text-xs">{roles}</span>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="size-4" /> {tc('signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </SchoolContext.Provider>
    );
  }

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
                    <DropdownMenuItem
                      key={m.schoolId}
                      // Pindah sekolah = pindah alamat. Sekolah yang sedang dibuka tidak perlu berpindah.
                      onClick={() => m.schoolSlug !== slug && goToSchool(site, m.schoolSlug)}
                    >
                      <span className="flex-1 truncate">{m.schoolName}</span>
                      {m.schoolId === school.schoolId && <Badge variant="secondary">{t('active')}</Badge>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav
            className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:overflow-visible md:px-4"
            aria-label={t('menu')}
          >
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter(
                (n) =>
                  (n.permission === null ||
                    permissions.has(n.permission) ||
                    ('orPermission' in n && permissions.has(n.orPermission))) &&
                  (!('module' in n) || school.modules.includes(n.module)),
              );
              if (items.length === 0) return null;
              return (
                <div key={group.key ?? 'main'} className="contents md:mt-3 md:grid md:gap-0.5 md:first:mt-0">
                  {group.key && (
                    <p className="text-muted-foreground hidden px-3 pt-1 pb-1 text-xs font-medium tracking-wide uppercase md:block">
                      {t(group.key)}
                    </p>
                  )}
                  {items.map((n) => {
                    const matches = (href: string) =>
                      pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
                    // Menu dengan alamat lebih spesifik (mis. /grades/settings) mengalahkan induknya (/grades).
                    const active =
                      matches(n.href) &&
                      !items.some(
                        (o) => o.href !== n.href && o.href.startsWith(`${n.href}/`) && matches(o.href),
                      );
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
                </div>
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
