'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BookHeart,
  BookMarked,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  Clock,
  CreditCard,
  Database,
  DoorOpen,
  Factory,
  FileQuestion,
  FileText,
  Globe,
  GraduationCap,
  HardHat,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
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
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppHeader, MobileNavDrawer } from '@/components/app-header';
import { ContextSwitcher } from '@/components/context-switcher';
import { Logo } from '@/components/logo';
import { SchoolSuspended } from '@/components/school-suspended';
import { ShellAside, SidebarToggle } from '@/components/sidebar-toggle';
import { useSchoolSupportUnread } from '@/components/support/support-api';
import { CountBadge } from '@/components/support/support-kit';
import { type SearchPage, TopbarSearch } from '@/components/topbar-search';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserMenu, useSignOut } from '@/components/user-menu';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { hiddenByProfile } from '@/lib/nav-vocational';
import { isPortalOnly, isPortalPath } from '@/lib/portal-access';
import { suspensionKind } from '@/lib/school-suspension';
import { setSchoolTimezone } from '@/lib/school-time';
import { useSite } from '@/lib/site';
import { rememberPage } from '@/lib/support';
import { cn } from '@/lib/utils';

interface Membership {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  /** Zona waktu IANA sekolah; kosong pada respons lama (dianggap Asia/Jakarta). */
  timezone?: string;
  /** Status sekolah; kosong pada respons lama (dianggap aktif). */
  schoolStatus?: string;
  suspendedReason?: string | null;
  suspendedNote?: string | null;
  suspendedAt?: string | null;
  /** Jenjang unit (satu unit satu jenjang); null/kosong pada sekolah lama yang belum dipetakan. */
  educationProfile?: {
    key: string;
    name: string;
    teacherModel: 'subject' | 'class';
    vocational: boolean;
  } | null;
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

/**
 * Menu diturunkan dari izin. Menambah modul berarti menambah satu baris di sini.
 * Tiap kelompok adalah menu induk (bisa dilipat) dengan submenu di dalamnya; kelompok tanpa submenu yang
 * boleh dilihat pengguna disembunyikan. Submenu bertanda `settings` ditaruh di bagian bawah kelompoknya.
 */
export const NAV_GROUPS = [
  {
    key: null,
    icon: LayoutDashboard,
    items: [{ href: '/dashboard', labelKey: 'overview', icon: LayoutDashboard, permission: null }],
  },
  {
    key: 'groupMaster',
    icon: Database,
    items: [
      { href: '/students', labelKey: 'students', icon: GraduationCap, permission: 'student:read' },
      { href: '/guardians', labelKey: 'guardians', icon: Users, permission: 'student:read' },
      { href: '/cards', labelKey: 'cards', icon: IdCard, permission: 'student:read' },
      { href: '/teachers', labelKey: 'teachers', icon: UserRound, permission: 'teacher:read' },
      { href: '/classes', labelKey: 'classes', icon: School, permission: 'class:read' },
      { href: '/subjects', labelKey: 'subjects', icon: BookOpen, permission: 'subject:read' },
      {
        href: '/academic-years',
        labelKey: 'academicYears',
        icon: CalendarDays,
        permission: 'academic_year:read',
      },
      { href: '/calendar', labelKey: 'calendar', icon: CalendarRange, permission: 'academic_year:read' },
      {
        href: '/school-settings',
        labelKey: 'schoolSettings',
        icon: Settings2,
        permission: 'school:manage',
        settings: true,
      },
    ],
  },
  {
    key: 'groupAttendance',
    icon: ClipboardCheck,
    items: [
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
        // Guru (wali kelas/piket) dan pengurus; kelas yang boleh dicatat disaring oleh API.
        href: '/attendance/manual',
        labelKey: 'attendanceManual',
        icon: UserCheck,
        permission: 'attendance:manage',
        module: 'attendance',
      },
      {
        href: '/attendance/cards',
        labelKey: 'attendanceCards',
        icon: CreditCard,
        permission: 'attendance:configure',
        module: 'attendance',
      },
      {
        href: '/attendance-settings',
        labelKey: 'attendanceSettings',
        icon: Settings2,
        permission: 'attendance:configure',
        module: 'attendance',
        settings: true,
      },
    ],
  },
  {
    key: 'groupAcademic',
    icon: BookOpen,
    items: [
      {
        href: '/schedule',
        labelKey: 'schedule',
        icon: Clock,
        permission: 'schedule:read',
        module: 'schedule',
      },
      {
        href: '/grades',
        labelKey: 'grades',
        icon: Award,
        permission: 'grade:read',
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
        href: '/extracurriculars',
        labelKey: 'extracurricular',
        icon: Trophy,
        permission: 'extracurricular:read',
        module: 'extracurricular',
      },
      {
        href: '/exams',
        labelKey: 'exams',
        icon: ClipboardCheck,
        permission: 'exam:read',
        module: 'exams',
      },
      {
        href: '/exams/bank',
        labelKey: 'questionBank',
        icon: FileQuestion,
        permission: 'exam:read',
        module: 'exams',
      },
      {
        href: '/exams/paper',
        labelKey: 'examPaper',
        icon: FileText,
        permission: 'exam:manage',
        module: 'exams',
        settings: true,
      },
      {
        href: '/exams/types',
        labelKey: 'examTypes',
        icon: ClipboardList,
        permission: 'exam:manage',
        module: 'exams',
        settings: true,
      },
      {
        href: '/grades/settings',
        labelKey: 'gradeSettings',
        icon: SlidersHorizontal,
        permission: 'grade:configure',
        module: 'grades',
        settings: true,
      },
      {
        href: '/report-cards/settings',
        labelKey: 'reportCardSettings',
        icon: FileText,
        permission: 'report_card:manage',
        module: 'grades',
        settings: true,
      },
    ],
  },
  {
    // Satu grup per modul: judul grup tidak boleh menyebut modul yang tidak dilanggan sekolah.
    key: 'groupTahfidz',
    icon: BookHeart,
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
        settings: true,
      },
    ],
  },
  {
    key: 'groupInternship',
    icon: BriefcaseBusiness,
    items: [
      {
        href: '/pkl',
        labelKey: 'pkl',
        icon: BriefcaseBusiness,
        permission: 'pkl:read',
        module: 'internship',
        vocational: true,
      },
      {
        href: '/pkl/partners',
        labelKey: 'pklPartners',
        icon: Factory,
        permission: 'pkl:read',
        module: 'internship',
        vocational: true,
      },
      {
        href: '/pkl/settings',
        labelKey: 'pklSettings',
        icon: HardHat,
        permission: 'pkl:manage',
        module: 'internship',
        vocational: true,
        settings: true,
      },
    ],
  },
  {
    key: 'groupFinance',
    icon: Wallet,
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
        href: '/finance/reports',
        labelKey: 'financeReports',
        icon: Landmark,
        permission: 'finance:read',
        module: 'finance',
      },
      {
        href: '/finance/online',
        labelKey: 'financeOnline',
        icon: Globe,
        permission: 'finance:read',
        module: 'finance',
      },
      {
        href: '/finance/gateway',
        labelKey: 'financeGateway',
        icon: CreditCard,
        permission: 'finance:manage',
        module: 'finance',
        settings: true,
      },
      {
        href: '/finance/settings',
        labelKey: 'financeSettings',
        icon: WalletCards,
        permission: 'finance:manage',
        module: 'finance',
        settings: true,
      },
    ],
  },
  {
    key: 'groupAdmissions',
    icon: UserPlus,
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
        settings: true,
      },
    ],
  },
  {
    key: 'groupAdministration',
    icon: Mail,
    items: [
      {
        href: '/letters',
        labelKey: 'letters',
        icon: Mail,
        permission: 'letter:read',
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
      {
        href: '/letters/templates',
        labelKey: 'letterTemplates',
        icon: ScrollText,
        permission: 'letter:manage',
        module: 'administration',
        settings: true,
      },
    ],
  },
  {
    key: 'groupCommunication',
    icon: Megaphone,
    items: [
      {
        href: '/announcements',
        labelKey: 'announcements',
        icon: Megaphone,
        permission: 'announcement:read',
        module: 'announcements',
      },
      {
        href: '/messaging',
        labelKey: 'messaging',
        icon: MessageCircle,
        permission: 'message:read',
        module: 'messaging',
      },
      {
        href: '/portal-admin',
        labelKey: 'portalAdmin',
        icon: KeyRound,
        permission: 'student:manage',
        module: 'parent_portal',
      },
      {
        href: '/site-settings',
        labelKey: 'siteSettings',
        icon: Globe,
        permission: 'announcement:manage',
        module: 'website',
        settings: true,
      },
    ],
  },
  {
    key: 'groupAccess',
    icon: ShieldCheck,
    items: [
      { href: '/members', labelKey: 'members', icon: Users, permission: 'member:read' },
      { href: '/roles', labelKey: 'roles', icon: ShieldCheck, permission: 'member:read' },
      { href: '/password-help', labelKey: 'passwordHelp', icon: KeyRound, permission: 'account:reset' },
    ],
  },
  {
    key: null,
    icon: BookOpen,
    items: [
      // Admin sekolah melapor ke tim platform; lencana merah = ada balasan yang belum dibuka.
      { href: '/support', labelKey: 'support', icon: MessagesSquare, permission: 'school:manage' },
      { href: '/docs', labelKey: 'docs', icon: BookOpen, permission: null },
    ],
  },
] as const;

type NavItem = (typeof NAV_GROUPS)[number]['items'][number];

/**
 * Menu yang boleh dilihat pengguna (izin dan modul sekolah), kelompok kosong dibuang. Dipakai bersama oleh
 * menu samping dan pencarian, sehingga pengguna tidak pernah melihat halaman yang tidak bisa dibukanya.
 */
export function visibleNavGroups(
  permissions: ReadonlySet<string>,
  modules: readonly string[],
  /** Kemampuan kejuruan dari jenjang unit; null = jenjang belum ditetapkan (sekolah lama), menu tetap tampil. */
  vocational: boolean | null = null,
) {
  const allowed = (n: NavItem) =>
    (n.permission === null ||
      permissions.has(n.permission) ||
      ('orPermission' in n && permissions.has(n.orPermission))) &&
    (!('module' in n) || modules.includes(n.module)) &&
    !hiddenByProfile(n, vocational);
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) as NavItem[] })).filter(
    (g) => g.items.length > 0,
  );
}

/** Menu samping bertingkat: menu induk yang bisa dilipat, submenu di dalamnya, pengaturan di bagian bawah. */
function SidebarNav({
  permissions,
  modules,
  vocational,
  pathname,
  schoolId,
}: {
  permissions: Set<string>;
  modules: string[];
  vocational: boolean | null;
  pathname: string;
  schoolId: string;
}) {
  const t = useTranslations('nav');
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  // Lencana merah menu Laporan: jumlah laporan dengan balasan platform yang belum dibuka (polling ~60 detik).
  const supportUnread = useSchoolSupportUnread(schoolId, permissions.has('school:manage'));

  // Laporan baru membawa halaman terakhir yang dibuka sebagai konteks.
  useEffect(() => {
    rememberPage(pathname);
  }, [pathname]);

  const groups = visibleNavGroups(permissions, modules, vocational);

  const matches = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  const all = groups.flatMap((g) => g.items);
  // Menu dengan alamat lebih spesifik (mis. /grades/settings) mengalahkan induknya (/grades).
  const isActive = (n: NavItem) =>
    matches(n.href) &&
    !all.some((o) => o.href !== n.href && o.href.startsWith(`${n.href}/`) && matches(o.href));
  const activeGroup = groups.find((g) => g.key !== null && g.items.some(isActive))?.key ?? null;

  // Kelompok yang berisi halaman aktif selalu terbuka; laci mobile menutup sendiri (MobileNavDrawer).
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada perubahan halaman
  useEffect(() => {
    if (activeGroup) setOpenGroups((cur) => (cur.includes(activeGroup) ? cur : [...cur, activeGroup]));
  }, [pathname]);

  const toggle = (key: string) =>
    setOpenGroups((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const link = (n: NavItem, nested: boolean) => {
    const active = isActive(n);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
          nested ? 'pl-3' : 'py-2',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )}
      >
        {!nested && <n.icon className={cn('size-4', active && 'text-primary')} />}
        {nested && 'settings' in n && <Settings2 className="size-3.5 opacity-70" aria-hidden />}
        <span className="flex-1">{t(n.labelKey)}</span>
        {n.href === '/support' && (
          <CountBadge count={supportUnread} label={t('supportBadge', { count: supportUnread })} />
        )}
      </Link>
    );
  };

  return (
    <div className="px-4 pb-4">
      <nav id="sidebar-menu" aria-label={t('menu')} className="grid gap-0.5">
        {groups.map((g) => {
          if (g.key === null) return g.items.map((n) => link(n, false));
          const open = openGroups.includes(g.key);
          const regular = g.items.filter((n) => !('settings' in n));
          const settings = g.items.filter((n) => 'settings' in n);
          const current = activeGroup === g.key;
          return (
            <div key={g.key} className="grid gap-0.5">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={open}
                aria-controls={`nav-${g.key}`}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  current
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )}
              >
                <g.icon className={cn('size-4', current && 'text-primary')} aria-hidden />
                <span className="flex-1">{t(g.key)}</span>
                <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
              </button>
              {open && (
                <div
                  id={`nav-${g.key}`}
                  className="border-sidebar-border ml-5 grid gap-0.5 border-l pl-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
                >
                  {regular.map((n) => link(n, true))}
                  {settings.length > 0 && regular.length > 0 && <div className="bg-border my-1 ml-3 h-px" />}
                  {settings.map((n) => link(n, true))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/** Pencarian topbar panel sekolah: halaman menu (disaring izin/modul yang sama dengan sidebar), dokumentasi, siswa, guru. */
function SchoolSearch({ school }: { school: Membership }) {
  const t = useTranslations('nav');
  const pages = useMemo<SearchPage[]>(
    () =>
      visibleNavGroups(
        new Set(school.permissions),
        school.modules,
        school.educationProfile?.vocational ?? null,
      ).flatMap((g) =>
        g.items.map((n) => ({
          href: n.href,
          label: t(n.labelKey),
          group: g.key ? t(g.key) : undefined,
          icon: n.icon,
        })),
      ),
    [school, t],
  );
  return (
    <TopbarSearch
      pages={pages}
      loadDocs={() => import('@/app/(app)/docs/content').then((m) => m.SCHOOL_DOCS)}
      docsBase="/docs"
      people={{
        schoolId: school.schoolId,
        students: school.permissions.includes('student:read'),
        teachers: school.permissions.includes('teacher:read'),
      }}
    />
  );
}

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
  const photo = authClient.useSession().data?.user.image ?? undefined;
  const router = useRouter();
  const pathname = usePathname();
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
    if (onMainHost) router.replace('/enter');
  }, [onMainHost, router]);

  // Wali/siswa (hanya izin portal) tidak punya halaman staf: apa pun alamatnya, arahkan ke portal.
  const portalSlug = site.ready && site.kind === 'school' ? site.slug : '';
  const portalMembership = me.data?.memberships.find((m) => m.schoolSlug === portalSlug);
  const portalOnly = !!portalMembership && isPortalOnly(portalMembership.permissions);
  const strayFromPortal = portalOnly && !isPortalPath(pathname);
  useEffect(() => {
    if (strayFromPortal) router.replace('/portal');
  }, [strayFromPortal, router]);

  const signOut = useSignOut();

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

  setSchoolTimezone(school.timezone);
  const permissions = new Set(school.permissions);
  const user = me.data.user;
  const value: SchoolContextValue = {
    school,
    userName: user.name,
    userId: user.id,
    can: (p) => permissions.has(p),
    hasModule: (m) => school.modules.includes(m),
  };
  const roles = school.roles.map(roleLabel).join(', ') || tr('none');

  // Sekolah ditangguhkan: layar khusus menggantikan isi, tetapi kepala halaman, pemindah konteks, dan menu
  // pengguna tetap ada agar pengguna bisa pindah sekolah atau keluar.
  const suspended = suspensionKind(school);
  if (suspended) {
    return (
      <SchoolContext.Provider value={value}>
        <div className="flex flex-1 flex-col">
          <AppHeader
            leading={
              <>
                <Logo />
                <div className="w-52 sm:w-64">
                  <ContextSwitcher alwaysShow subtitle={roles} />
                </div>
              </>
            }
          >
            <UserMenu profileHref="/profile" name={user.name} email={user.email} image={photo} />
          </AppHeader>
          <main className="flex flex-1 flex-col p-4 md:p-8">
            <SchoolSuspended
              kind={suspended}
              schoolName={school.schoolName}
              note={school.suspendedNote}
              since={school.suspendedAt}
            />
          </main>
        </div>
      </SchoolContext.Provider>
    );
  }

  // Kerangka ringan untuk wali/siswa: tanpa menu samping, nyaman di ponsel.
  if (portalOnly) {
    return (
      <SchoolContext.Provider value={value}>
        <div className="flex flex-1 flex-col">
          <AppHeader
            leading={
              <>
                <Logo />
                <span className="text-muted-foreground hidden truncate text-sm sm:inline">
                  {school.schoolName}
                </span>
              </>
            }
          >
            <UserMenu
              profileHref="/profile"
              name={user.name}
              email={user.email}
              image={photo}
              detail={roles}
            />
          </AppHeader>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </SchoolContext.Provider>
    );
  }

  const sidebar = (
    <>
      <div className="flex flex-col items-stretch gap-5 p-4">
        <span className="hidden md:block">
          <Logo />
        </span>

        <ContextSwitcher alwaysShow subtitle={roles} />
      </div>

      <SidebarNav
        permissions={permissions}
        modules={school.modules}
        vocational={school.educationProfile?.vocational ?? null}
        pathname={pathname}
        schoolId={school.schoolId}
      />
    </>
  );

  return (
    <SchoolContext.Provider value={value}>
      <div className="flex flex-1 flex-col md:flex-row">
        <ShellAside>{sidebar}</ShellAside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            mobileNav={<MobileNavDrawer>{sidebar}</MobileNavDrawer>}
            sidebarToggle={<SidebarToggle />}
            search={<SchoolSearch school={school} />}
            leading={
              <span className="md:hidden">
                <Logo />
              </span>
            }
          >
            <UserMenu profileHref="/profile" name={user.name} email={user.email} image={photo} />
          </AppHeader>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </SchoolContext.Provider>
  );
}
