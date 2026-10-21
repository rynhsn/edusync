import { ArrowRight, BookOpen, CalendarRange, GraduationCap, Users } from 'lucide-react';
import type { SchoolOverview } from '@edusync/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Loading, StudentStatusBadge, formatDate } from '@/features/shared';
import type { PageKey } from '@/features/types';
import { useTranslation } from '@/i18n';

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-5 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">{icon}</div></div><p className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;
}

export function DashboardPage({ overview, loading, canManage, onNavigate }: { overview: SchoolOverview | null; loading: boolean; canManage: boolean; onNavigate: (page: PageKey) => void }) {
  const { locale, t } = useTranslation();
  if (loading && !overview) return <Loading label={t('dashboard.loading')} />;
  if (!overview) return <Card><CardContent className="p-0"><EmptyState icon={<GraduationCap size={22} />} title={t('dashboard.emptyTitle')} description={t('dashboard.emptyDescription')} action={canManage ? <Button onClick={() => onNavigate('students')}>{t('dashboard.addFirstStudent')}</Button> : undefined} /></CardContent></Card>;

  const seatsLeft = overview.classes.seats - overview.students.active;
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Users size={19} />} label={t('dashboard.stat.students')} value={String(overview.students.total)} hint={t('dashboard.hint.studentsActive', { count: overview.students.active })} />
      <StatCard icon={<BookOpen size={19} />} label={t('dashboard.stat.classes')} value={String(overview.classes.total)} hint={overview.classes.seats > 0 ? t('dashboard.hint.seatsAvailable', { count: seatsLeft > 0 ? seatsLeft : 0 }) : t('dashboard.hint.noCapacity')} />
      <StatCard icon={<CalendarRange size={19} />} label={t('dashboard.stat.academicYears')} value={String(overview.academicYears.total)} hint={overview.academicYears.activeName ? t('dashboard.hint.activeYear', { name: overview.academicYears.activeName }) : t('dashboard.hint.noActiveYear')} />
      <StatCard icon={<GraduationCap size={19} />} label={t('dashboard.stat.enrollmentRate')} value={overview.classes.seats > 0 ? `${Math.min(100, Math.round((overview.students.active / overview.classes.seats) * 100))}%` : '—'} hint={t('dashboard.hint.enrollmentRate')} />
    </div>
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 sm:flex-row"><div><CardTitle>{t('dashboard.recentTitle')}</CardTitle><CardDescription>{t('dashboard.recentDescription')}</CardDescription></div><Button variant="secondary" size="sm" onClick={() => onNavigate('students')}>{t('dashboard.viewAll')} <ArrowRight className="size-3.5" /></Button></CardHeader>
      <CardContent className="p-0 sm:p-0">
        {overview.recentStudents.length === 0
          ? <EmptyState icon={<Users size={22} />} title={t('dashboard.recentEmptyTitle')} description={t('dashboard.recentEmptyDescription')} />
          : <div className="divide-y divide-border border-t border-border">{overview.recentStudents.map((student) => <div key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{student.fullName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{student.fullName}</p><p className="text-xs text-muted-foreground">{t('dashboard.rowNis', { nis: student.nis })}{student.className ? ` · ${student.className}` : ` · ${t('dashboard.rowNotEnrolled')}`}</p></div><StudentStatusBadge status={student.status} /><span className="hidden text-xs text-muted-foreground sm:block">{formatDate(student.createdAt, locale)}</span></div>)}</div>}
      </CardContent>
    </Card>
    {!canManage && <p className="text-xs text-muted-foreground">{t('dashboard.readOnlyNote')}</p>}
  </div>;
}
