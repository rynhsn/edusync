import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, CalendarRange, Check, ChevronDown, CircleAlert, DoorOpen, GraduationCap,
  LayoutDashboard, LoaderCircle, Menu, RefreshCw, ShieldCheck, Users, X,
} from 'lucide-react';
import type { AcademicYear, SchoolClass, SchoolOverview, Student } from '@edusync/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  authClient, getAcademicYears, getAuthContext, getClasses, getOverview, getStudents,
} from '@/lib/school-api';
import type { PageKey, SessionState, SessionUser } from '@/features/types';
import { Brand } from '@/features/shared';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { StudentsPage } from '@/features/students/StudentsPage';
import { ClassesPage } from '@/features/classes/ClassesPage';
import { AcademicYearsPage } from '@/features/academic-years/AcademicYearsPage';

function NavButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? 'bg-teal-50 font-semibold text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>{icon}{children}</button>; }

export function AuthenticatedApp() {
  const [state, setState] = useState<SessionState>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [page, setPage] = useState<PageKey>('dashboard');
  const [overview, setOverview] = useState<SchoolOverview | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string; tone: 'success' | 'warning' } | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const navigate = useNavigate();
  const canManage = user?.role === 'school_admin';

  const refresh = useCallback(async (target: PageKey) => {
    setLoading(true); setError('');
    try {
      if (target === 'dashboard') setOverview(await getOverview());
      if (target === 'classes') setClasses(await getClasses());
      if (target === 'academic-years') setAcademicYears(await getAcademicYears());
      if (target === 'students') {
        const [studentList, classList, yearList] = await Promise.all([getStudents(), getClasses(), getAcademicYears()]);
        setStudents(studentList); setClasses(classList); setAcademicYears(yearList);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'School data could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    authClient.getSession().then(async ({ data }) => {
      if (!active) return;
      const sessionUser = data?.user as SessionUser | undefined;
      if (!sessionUser) { setUser(null); setState('signed-out'); return; }
      // The session payload carries no role, so ask the API for it. A failure here
      // leaves the role unset, which shows the read-only view rather than guessing.
      try {
        const context = await getAuthContext();
        if (active) setUser({ ...sessionUser, role: context.role });
      } catch { if (active) setUser(sessionUser); }
      if (active) setState('signed-in');
    }).catch(() => { if (active) setState('signed-out'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (state === 'signed-out') navigate('/sign-in', { replace: true }); }, [state, navigate]);
  useEffect(() => { if (state === 'signed-in') void refresh(page); }, [state, page, refresh]);

  const switchPage = (next: PageKey) => { setPage(next); setMobileNav(false); setError(''); setNotice(null); };
  const announce = (title: string, message: string, tone: 'success' | 'warning' = 'success') => setNotice({ title, message, tone });
  const onSignOut = async () => {
    setSignOutBusy(true); setSignOutError('');
    try {
      const result = await authClient.signOut();
      if (result.error || result.data?.success === false) throw new Error(result.error?.message ?? 'Sign out could not be completed.');
      setUser(null); setState('signed-out');
    } catch (cause) { setSignOutError(cause instanceof Error ? cause.message : 'Sign out failed. Try again.'); }
    finally { setSignOutBusy(false); }
  };
  if (state === 'loading') return <div className="grid min-h-screen place-items-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Connecting to EduSync School</div></div>;
  if (state === 'signed-out') return null;

  const titles: Record<PageKey, { title: string; description: string }> = {
    dashboard: { title: 'School dashboard', description: 'A current picture of students, classes and the active academic year.' },
    students: { title: 'Students', description: 'Master data for every student enrolled at this school.' },
    classes: { title: 'Classes', description: 'Class groups, grade levels and seat capacity.' },
    'academic-years': { title: 'Academic years', description: 'The school calendar periods students are enrolled in.' },
  };
  return <div className="min-h-screen bg-background lg:flex">
    {mobileNav && <button className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-border bg-white px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 px-3 pb-8"><Brand /><button className="ml-auto rounded p-1 text-muted-foreground lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-slate-50 px-3 py-3"><div className="grid size-9 place-items-center rounded-lg bg-primary text-white"><GraduationCap size={18} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">EduSync</p><p className="text-xs text-muted-foreground">School workspace</p></div><ChevronDown className="ml-auto size-4 text-muted-foreground" /></div>
      <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground">SCHOOL</p>
      <nav className="space-y-1" aria-label="School navigation"><NavButton active={page === 'dashboard'} icon={<LayoutDashboard size={17} />} onClick={() => switchPage('dashboard')}>Dashboard</NavButton><NavButton active={page === 'students'} icon={<Users size={17} />} onClick={() => switchPage('students')}>Students {students.length > 0 && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{students.length}</span>}</NavButton><NavButton active={page === 'classes'} icon={<BookOpen size={17} />} onClick={() => switchPage('classes')}>Classes {classes.length > 0 && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{classes.length}</span>}</NavButton><NavButton active={page === 'academic-years'} icon={<CalendarRange size={17} />} onClick={() => switchPage('academic-years')}>Academic years {academicYears.length > 0 && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{academicYears.length}</span>}</NavButton></nav>
      <div className="mt-auto space-y-3"><div className="rounded-xl border border-teal-100 bg-teal-50/70 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-teal-900"><ShieldCheck size={16} /> Protected access</div><p className="mt-1 text-xs leading-5 text-teal-800/80">Your role determines which school actions are available.</p></div>{signOutError && <p className="text-xs text-rose-700" role="alert">{signOutError}</p>}<div className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">{user?.name?.slice(0, 1).toUpperCase() ?? 'S'}</div><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{user?.name ?? 'School user'}</strong><span className="block truncate text-xs text-muted-foreground">{user?.email}</span></span><Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void onSignOut()} disabled={signOutBusy}>{signOutBusy ? <LoaderCircle size={16} className="animate-spin" /> : <DoorOpen size={16} />}</Button></div></div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-10"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></Button><div className="text-sm text-muted-foreground">EduSync <span className="px-2 text-slate-300">/</span><strong className="text-foreground">{titles[page].title}</strong></div></div><div className="hidden items-center gap-3 sm:flex"><Badge variant={canManage ? 'success' : 'secondary'}><span className="mr-1.5 size-1.5 rounded-full bg-current" />{canManage ? 'School admin' : 'Read only'}</Badge><span className="hidden text-xs text-muted-foreground md:block">{user?.email}</span></div></header>
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold text-primary">{page === 'dashboard' ? 'OVERVIEW' : page === 'students' ? 'MASTER DATA' : page === 'classes' ? 'MASTER DATA' : 'SCHOOL CALENDAR'}</p><h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{titles[page].title}</h1><p className="mt-2 text-sm text-muted-foreground">{titles[page].description}</p></div><Button variant="secondary" onClick={() => void refresh(page)} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
        {error && <Alert variant="destructive" className="mb-5"><CircleAlert size={17} /><AlertTitle>Couldn’t load school data</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void refresh(page)}>Try again</Button></AlertDescription></Alert>}
        {notice && <Alert variant={notice.tone === 'success' ? 'success' : 'warning'} className="mb-5"><Check size={17} /><AlertTitle>{notice.title}</AlertTitle><AlertDescription>{notice.message}</AlertDescription></Alert>}
        {page === 'dashboard' && <DashboardPage overview={overview} loading={loading} canManage={canManage} onNavigate={switchPage} />}
        {page === 'students' && <StudentsPage students={students} classes={classes} academicYears={academicYears} loading={loading} canManage={canManage} onChanged={async (message, tone = 'success') => { announce('Student data updated', message, tone); await refresh('students'); }} />}
        {page === 'classes' && <ClassesPage classes={classes} loading={loading} canManage={canManage} onChanged={async (message, tone = 'success') => { announce('Class data updated', message, tone); await refresh('classes'); }} />}
        {page === 'academic-years' && <AcademicYearsPage academicYears={academicYears} loading={loading} canManage={canManage} onChanged={async (message, tone = 'success') => { announce('Academic year updated', message, tone); await refresh('academic-years'); }} />}
        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:justify-between"><span>EduSync School · {user?.email ?? 'Signed in'}</span><span>Every record belongs to this school only.</span></footer>
      </div>
    </main>
  </div>;
}
