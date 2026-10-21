import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Building2, Check, ChevronDown, CircleAlert, DoorOpen, GraduationCap, LayoutDashboard,
  LoaderCircle, Menu, RefreshCw, ShieldCheck, Users, X,
} from 'lucide-react';
import type { PlatformOperator, PlatformOperatorInvite, PlatformTenant } from '@edusync/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { authClient, getOperators, getTenants } from '@/lib/platform-api';
import type { PageKey, SessionState, SessionUser } from '@/features/types';
import { Brand } from '@/features/shared';
import { AppearanceControls } from '@/features/appearance/AppearanceControls';
import { canCreateTenants, canManageOperators, canViewOperators, platformAccess } from '@/features/access';
import { useTranslation, type MessageKey } from '@/i18n';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { TenantsPage } from '@/features/tenants/TenantsPage';
import { OperatorsPage } from '@/features/operators/OperatorsPage';
import { DocsPage } from '@/features/docs/DocsPage';

function NavButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? 'bg-accent font-semibold text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{icon}{children}</button>; }

const TITLE_KEYS: Record<PageKey, { title: MessageKey; description: MessageKey }> = {
  overview: { title: 'shell.overviewTitle', description: 'shell.overviewDescription' },
  tenants: { title: 'shell.tenantsTitle', description: 'shell.tenantsDescription' },
  operators: { title: 'shell.operatorsTitle', description: 'shell.operatorsDescription' },
  docs: { title: 'shell.docsTitle', description: 'shell.docsDescription' },
};
const EYEBROW_KEYS: Record<PageKey, MessageKey> = { overview: 'shell.eyebrowOverview', tenants: 'shell.eyebrowTenants', operators: 'shell.eyebrowOperators', docs: 'shell.eyebrowDocs' };

export function AuthenticatedApp() {
  const [state, setState] = useState<SessionState>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [page, setPage] = useState<PageKey>('overview');
  const [tenantList, setTenantList] = useState<PlatformTenant[]>([]);
  const [operatorList, setOperatorList] = useState<{ operators: PlatformOperator[]; invitations: PlatformOperatorInvite[] }>({ operators: [], invitations: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string; tone: 'success' | 'warning' } | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const access = platformAccess(user);
  const canManage = access === 'admin';

  // Operators are an operator concern: customers never see or manage them.
  const operatorsVisible = canViewOperators(access);

  const refresh = useCallback(async (target: PageKey) => {
    setLoading(true); setError('');
    try {
      if (target === 'tenants' || target === 'overview') setTenantList(await getTenants());
      if ((target === 'operators' || target === 'overview') && operatorsVisible) setOperatorList(await getOperators());
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('shell.loadFailed')); }
    finally { setLoading(false); }
  }, [t, operatorsVisible]);

  useEffect(() => {
    let active = true;
    authClient.getSession().then(({ data }) => {
      if (!active) return;
      const sessionUser = data?.user as SessionUser | undefined;
      setUser(sessionUser ?? null); setState(sessionUser ? 'signed-in' : 'signed-out');
    }).catch(() => { if (active) setState('signed-out'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (state === 'signed-out') navigate('/sign-in', { replace: true }); }, [state, navigate]);
  useEffect(() => { if (state === 'signed-in') void refresh(page); }, [state, page, refresh]);

  const switchPage = (next: PageKey) => {
    if (next === 'operators' && !operatorsVisible) return;
    setPage(next); setMobileNav(false); setError(''); setNotice(null);
  };
  const onSignOut = async () => {
    setSignOutBusy(true); setSignOutError('');
    try {
      const result = await authClient.signOut();
      if (result.error || result.data?.success === false) throw new Error(result.error?.message ?? t('shell.signOutIncomplete'));
      setUser(null); setState('signed-out');
    } catch (cause) { setSignOutError(cause instanceof Error ? cause.message : t('shell.signOutFailed')); }
    finally { setSignOutBusy(false); }
  };
  if (state === 'loading') return <div className="grid min-h-screen place-items-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> {t('shell.loading')}</div></div>;
  if (state === 'signed-out') return null;

  const titles: Record<PageKey, { title: string; description: string }> = {
    overview: { title: t(TITLE_KEYS.overview.title), description: t(TITLE_KEYS.overview.description) },
    tenants: { title: t(TITLE_KEYS.tenants.title), description: t(TITLE_KEYS.tenants.description) },
    operators: { title: t(TITLE_KEYS.operators.title), description: t(TITLE_KEYS.operators.description) },
    docs: { title: t(TITLE_KEYS.docs.title), description: t(TITLE_KEYS.docs.description) },
  };
  return <div className="min-h-screen bg-background lg:flex">
    {mobileNav && <button className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" aria-label={t('shell.closeNavigation')} onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-border bg-card px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 px-3 pb-8"><Brand /><button className="ml-auto rounded p-1 text-muted-foreground lg:hidden" onClick={() => setMobileNav(false)} aria-label={t('shell.closeMenu')}><X size={18} /></button></div>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-3"><div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><GraduationCap size={18} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">EduSync</p><p className="text-xs text-muted-foreground">{t('shell.controlPlane')}</p></div><ChevronDown className="ml-auto size-4 text-muted-foreground" /></div>
      <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground">{t('shell.platformSection')}</p>
      <nav className="space-y-1" aria-label={t('shell.navLabel')}><NavButton active={page === 'overview'} icon={<LayoutDashboard size={17} />} onClick={() => switchPage('overview')}>{t('shell.navOverview')}</NavButton><NavButton active={page === 'tenants'} icon={<Building2 size={17} />} onClick={() => switchPage('tenants')}>{t('shell.navTenants')} <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tenantList.length}</span></NavButton>{operatorsVisible && <NavButton active={page === 'operators'} icon={<Users size={17} />} onClick={() => switchPage('operators')}>{t('shell.navOperators')}</NavButton>}<NavButton active={page === 'docs'} icon={<BookOpen size={17} />} onClick={() => switchPage('docs')}>{t('shell.navDocs')}</NavButton></nav>
      <div className="mt-auto space-y-3"><div className="rounded-xl border border-border p-3"><AppearanceControls /></div><div className="rounded-xl border border-primary/20 bg-accent/70 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-accent-foreground"><ShieldCheck size={16} /> {t('shell.protectedAccess')}</div><p className="mt-1 text-xs leading-5 text-accent-foreground/80">{t('shell.protectedHint')}</p></div>{signOutError && <p className="text-xs text-danger-foreground" role="alert">{signOutError}</p>}<div className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{user?.name?.slice(0, 1).toUpperCase() ?? 'P'}</div><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{user?.name ?? t('shell.operatorFallback')}</strong><span className="block truncate text-xs text-muted-foreground">{user?.email}</span></span><Button variant="ghost" size="icon" aria-label={t('shell.signOut')} onClick={() => void onSignOut()} disabled={signOutBusy}>{signOutBusy ? <LoaderCircle size={16} className="animate-spin" /> : <DoorOpen size={16} />}</Button></div></div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-7 lg:px-10"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label={t('shell.openNavigation')}><Menu size={19} /></Button><div className="text-sm text-muted-foreground">EduSync <span className="px-2 text-border">/</span><strong className="text-foreground">{titles[page].title}</strong></div></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden items-center gap-3 sm:flex"><Badge variant={canManage ? 'success' : 'secondary'}><span className="mr-1.5 size-1.5 rounded-full bg-current" />{access === 'admin' ? t('common.platformAdmin') : access === 'user' ? t('common.platformUser') : t('common.readOnly')}</Badge><span className="hidden text-xs text-muted-foreground md:block">{user?.email}</span></div></div></header>
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold text-primary">{t(EYEBROW_KEYS[page])}</p><h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{titles[page].title}</h1><p className="mt-2 text-sm text-muted-foreground">{titles[page].description}</p></div><Button variant="secondary" onClick={() => void refresh(page)} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />{t('common.refresh')}</Button></div>
        {error && <Alert variant="destructive" className="mb-5"><CircleAlert size={17} /><AlertTitle>{t('shell.errorTitle')}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void refresh(page)}>{t('common.tryAgain')}</Button></AlertDescription></Alert>}
        {notice && <Alert variant={notice.tone === 'success' ? 'success' : 'warning'} className="mb-5"><Check size={17} /><AlertTitle>{notice.title}</AlertTitle><AlertDescription>{notice.message}</AlertDescription></Alert>}
        {page === 'overview' && <OverviewPage tenants={tenantList} operators={operatorList.operators} loading={loading} access={access} onNavigate={switchPage} />}
        {page === 'tenants' && <TenantsPage tenants={tenantList} loading={loading} canCreate={canCreateTenants(access)} onCreated={(tenant, adminName) => { setTenantList((current) => [tenant, ...current.filter((item) => item.id !== tenant.id)]); setNotice({ tone: 'warning', title: t('shell.tenantProvisioned', { name: tenant.name }), message: t('shell.adminActivation', { name: adminName }) }); }} />}
        {page === 'operators' && operatorsVisible && <OperatorsPage data={operatorList} user={user} canManage={canManageOperators(access)} onChanged={async (message, tone = 'success') => { setNotice({ title: t('shell.noticeTitle'), message, tone }); await refresh('operators'); }} />}
        {page === 'docs' && <DocsPage />}
        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:justify-between"><span>{t('shell.footerAuthorized')}</span><span>{t('shell.footerActivation')}</span></footer>
      </div>
    </main>
  </div>;
}
