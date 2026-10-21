import { ArrowRight, BookOpen, CalendarRange, GraduationCap, Users } from 'lucide-react';
import type { SchoolOverview } from '@edusync/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Loading, StudentStatusBadge, formatDate } from '@/features/shared';
import type { PageKey } from '@/features/types';

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-5 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-teal-50 text-primary">{icon}</div></div><p className="mt-4 font-display text-3xl font-extrabold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;
}

export function DashboardPage({ overview, loading, canManage, onNavigate }: { overview: SchoolOverview | null; loading: boolean; canManage: boolean; onNavigate: (page: PageKey) => void }) {
  if (loading && !overview) return <Loading label="Loading the school dashboard" />;
  if (!overview) return <Card><CardContent className="p-0"><EmptyState icon={<GraduationCap size={22} />} title="No dashboard data yet" description="Once students and classes are registered, the school summary appears here." action={canManage ? <Button onClick={() => onNavigate('students')}>Add the first student</Button> : undefined} /></CardContent></Card>;

  const seatsLeft = overview.classes.seats - overview.students.active;
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Users size={19} />} label="Students" value={String(overview.students.total)} hint={`${overview.students.active} currently active`} />
      <StatCard icon={<BookOpen size={19} />} label="Classes" value={String(overview.classes.total)} hint={overview.classes.seats > 0 ? `${seatsLeft > 0 ? seatsLeft : 0} seats still available` : 'No seat capacity set'} />
      <StatCard icon={<CalendarRange size={19} />} label="Academic years" value={String(overview.academicYears.total)} hint={overview.academicYears.activeName ? `Active: ${overview.academicYears.activeName}` : 'No active year selected'} />
      <StatCard icon={<GraduationCap size={19} />} label="Enrollment rate" value={overview.classes.seats > 0 ? `${Math.min(100, Math.round((overview.students.active / overview.classes.seats) * 100))}%` : '—'} hint="Active students against total seats" />
    </div>
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 sm:flex-row"><div><CardTitle>Recently added students</CardTitle><CardDescription>The five most recent student records in this school.</CardDescription></div><Button variant="secondary" size="sm" onClick={() => onNavigate('students')}>View all <ArrowRight className="size-3.5" /></Button></CardHeader>
      <CardContent className="p-0 sm:p-0">
        {overview.recentStudents.length === 0
          ? <EmptyState icon={<Users size={22} />} title="No students registered" description="Students you add will be listed here with their current class." />
          : <div className="divide-y divide-border border-t border-border">{overview.recentStudents.map((student) => <div key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{student.fullName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{student.fullName}</p><p className="text-xs text-muted-foreground">NIS {student.nis}{student.className ? ` · ${student.className}` : ' · not enrolled'}</p></div><StudentStatusBadge status={student.status} /><span className="hidden text-xs text-muted-foreground sm:block">{formatDate(student.createdAt)}</span></div>)}</div>}
      </CardContent>
    </Card>
    {!canManage && <p className="text-xs text-muted-foreground">You have read-only access. Ask a school admin to add or change records.</p>}
  </div>;
}
