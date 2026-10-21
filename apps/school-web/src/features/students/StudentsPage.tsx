import { useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import type { AcademicYear, SchoolClass, Student, StudentStatus } from '@edusync/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createStudent, deleteStudent, updateStudent } from '@/lib/school-api';
import { EmptyState, FormError, Loading, StudentStatusBadge } from '@/features/shared';
import { useTranslation, type MessageKey } from '@/i18n';

const STATUS_ORDER: StudentStatus[] = ['AKTIF', 'LULUS', 'MUTASI', 'KELUAR'];

const STATUS_KEYS: Record<StudentStatus, MessageKey> = {
  AKTIF: 'status.AKTIF',
  LULUS: 'status.LULUS',
  MUTASI: 'status.MUTASI',
  KELUAR: 'status.KELUAR',
};

type FormValues = { nis: string; nisn: string; fullName: string; gender: string; classId: string; academicYearId: string; status: StudentStatus };

const emptyForm = (yearId: string): FormValues => ({ nis: '', nisn: '', fullName: '', gender: '', classId: '', academicYearId: yearId, status: 'AKTIF' });

function StudentForm({ mode, student, classes, academicYears, onDone, onCancel }: { mode: 'create' | 'edit'; student?: Student; classes: SchoolClass[]; academicYears: AcademicYear[]; onDone: (message: string) => Promise<void> | void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormValues>(() => student
    ? { nis: student.nis, nisn: student.nisn ?? '', fullName: student.fullName, gender: student.gender ?? '', classId: student.classId ?? '', academicYearId: student.academicYearId ?? '', status: student.status }
    : emptyForm(academicYears.find((year) => year.isActive)?.id ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<FormValues>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.classId || !form.academicYearId) { setError(t('students.errorSelectClassYear')); return; }
    setBusy(true);
    try {
      const base = { nis: form.nis.trim(), nisn: form.nisn.trim() || null, fullName: form.fullName.trim(), gender: (form.gender || null) as 'L' | 'P' | null };
      if (mode === 'create') {
        await createStudent({ ...base, classId: form.classId, academicYearId: form.academicYearId, status: form.status });
        await onDone(t('students.created', { name: base.fullName, className: classes.find((item) => item.id === form.classId)?.name ?? t('students.class') }));
      } else {
        await updateStudent(student!.id, { ...base, classId: form.classId, academicYearId: form.academicYearId, status: form.status });
        await onDone(t('students.updated', { name: base.fullName }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('students.saveFailed')); }
    finally { setBusy(false); }
  };

  return <form className="space-y-4" onSubmit={submit}>
    {error && <FormError message={error} />}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="fullName">{t('students.fullName')}</Label><Input id="fullName" name="fullName" required minLength={2} maxLength={100} placeholder={t('students.fullNamePlaceholder')} value={form.fullName} onChange={(event) => set({ fullName: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="nis">{t('students.nis')}</Label><Input id="nis" name="nis" required maxLength={20} placeholder={t('students.nisPlaceholder')} value={form.nis} onChange={(event) => set({ nis: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="nisn">{t('students.nisn')}</Label><Input id="nisn" name="nisn" maxLength={10} placeholder={t('common.optional')} value={form.nisn} onChange={(event) => set({ nisn: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gender">{t('students.gender')}</Label><Select value={form.gender || 'none'} onValueChange={(value) => set({ gender: value === 'none' ? '' : value })}><SelectTrigger id="gender"><SelectValue placeholder={t('students.genderUnset')} /></SelectTrigger><SelectContent><SelectItem value="none">{t('students.genderUnset')}</SelectItem><SelectItem value="L">{t('students.male')}</SelectItem><SelectItem value="P">{t('students.female')}</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="classId">{t('students.class')}</Label><Select value={form.classId} onValueChange={(value) => set({ classId: value })}><SelectTrigger id="classId"><SelectValue placeholder={classes.length ? t('students.selectClass') : t('students.noClasses')} /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{t('students.classOption', { name: item.name, grade: item.gradeLevel })}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="academicYearId">{t('students.academicYear')}</Label><Select value={form.academicYearId} onValueChange={(value) => set({ academicYearId: value })}><SelectTrigger id="academicYearId"><SelectValue placeholder={academicYears.length ? t('students.selectAcademicYear') : t('students.noAcademicYears')} /></SelectTrigger><SelectContent>{academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isActive ? t('students.yearActiveSuffix') : ''}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="status">{t('students.status')}</Label><Select value={form.status} onValueChange={(value) => set({ status: value as StudentStatus })}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent>{STATUS_ORDER.map((option) => <SelectItem key={option} value={option}>{t(STATUS_KEYS[option])}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {(classes.length === 0 || academicYears.length === 0) && <Alert variant="warning"><CircleAlert size={16} /><AlertDescription>{classes.length === 0 ? `${t('students.needClass')} ` : ''}{academicYears.length === 0 ? t('students.needAcademicYear') : ''}</AlertDescription></Alert>}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button><Button type="submit" disabled={busy || classes.length === 0 || academicYears.length === 0}>{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === 'create' ? t('students.createSubmit') : t('common.saveChanges')}</Button></div>
  </form>;
}

export function StudentsPage({ students, classes, academicYears, loading, canManage, onChanged }: { students: Student[]; classes: SchoolClass[]; academicYears: AcademicYear[]; loading: boolean; canManage: boolean; onChanged: (message: string, tone?: 'success' | 'warning') => Promise<void> | void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StudentStatus>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students.filter((student) => {
      if (statusFilter !== 'all' && student.status !== statusFilter) return false;
      if (!needle) return true;
      return student.fullName.toLowerCase().includes(needle) || student.nis.toLowerCase().includes(needle) || (student.nisn ?? '').toLowerCase().includes(needle);
    });
  }, [students, query, statusFilter]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true); setDeleteError('');
    try {
      await deleteStudent(deleting.id);
      setDeleting(null);
      await onChanged(t('students.deleted', { name: deleting.fullName }), 'warning');
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : t('students.deleteFailed')); }
    finally { setDeleteBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder={t('students.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('students.searchLabel')} /></div>
      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | StudentStatus)}><SelectTrigger className="sm:w-44" aria-label={t('students.filterLabel')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('students.allStatuses')}</SelectItem>{STATUS_ORDER.map((option) => <SelectItem key={option} value={option}>{t(STATUS_KEYS[option])}</SelectItem>)}</SelectContent></Select>
      {canManage && <Button onClick={() => setCreating(true)} disabled={classes.length === 0 || academicYears.length === 0}><Plus className="size-4" />{t('students.add')}</Button>}
    </div>

    {loading && students.length === 0 ? <Loading label={t('students.loading')} /> : filtered.length === 0
      ? <Card><CardContent className="p-0"><EmptyState icon={<Users size={22} />} title={students.length === 0 ? t('students.emptyTitle') : t('students.noMatchTitle')} description={students.length === 0 ? t('students.emptyDescription') : t('students.noMatchDescription')} action={students.length === 0 && canManage && classes.length > 0 && academicYears.length > 0 ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('students.add')}</Button> : undefined} /></CardContent></Card>
      : <Card><CardContent className="p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead><tr className="border-b border-border bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">{t('students.col.student')}</th><th className="px-5 py-3">{t('students.col.nis')}</th><th className="px-5 py-3">{t('students.col.class')}</th><th className="px-5 py-3">{t('students.col.academicYear')}</th><th className="px-5 py-3">{t('students.col.status')}</th>{canManage && <th className="px-5 py-3 text-right">{t('students.col.actions')}</th>}</tr></thead>
        <tbody className="divide-y divide-border">{filtered.map((student) => <tr key={student.id} className="hover:bg-muted/50">
          <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{student.fullName.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-semibold">{student.fullName}</p><p className="text-xs text-muted-foreground">{student.gender === 'L' ? t('students.male') : student.gender === 'P' ? t('students.female') : t('students.genderNotSet')}</p></div></div></td>
          <td className="px-5 py-3.5"><span className="block font-medium">{student.nis}</span><span className="block text-xs text-muted-foreground">{student.nisn ?? '—'}</span></td>
          <td className="px-5 py-3.5">{student.className ? <Badge variant="outline">{student.className}</Badge> : <span className="text-xs text-muted-foreground">{t('students.notEnrolled')}</span>}</td>
          <td className="px-5 py-3.5 text-muted-foreground">{student.academicYearName ?? '—'}</td>
          <td className="px-5 py-3.5"><StudentStatusBadge status={student.status} /></td>
          {canManage && <td className="px-5 py-3.5"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={t('common.editName', { name: student.fullName })} onClick={() => setEditing(student)}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={t('common.deleteName', { name: student.fullName })} onClick={() => { setDeleteError(''); setDeleting(student); }}><Trash2 size={15} className="text-danger-foreground" /></Button></div></td>}
        </tr>)}</tbody>
      </table></div></CardContent></Card>}

    {!canManage && <p className="text-xs text-muted-foreground">{t('students.readOnlyNote')}</p>}

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('students.createTitle')}</DialogTitle><DialogDescription>{t('students.createDescription')}</DialogDescription></DialogHeader>{creating && <StudentForm mode="create" classes={classes} academicYears={academicYears} onCancel={() => setCreating(false)} onDone={async (message) => { setCreating(false); await onChanged(message); }} />}</DialogContent></Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('students.editTitle')}</DialogTitle><DialogDescription>{t('students.editDescription')}</DialogDescription></DialogHeader>{editing && <StudentForm mode="edit" student={editing} classes={classes} academicYears={academicYears} onCancel={() => setEditing(null)} onDone={async (message) => { setEditing(null); await onChanged(message); }} />}</DialogContent></Dialog>

    <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleting ? t('students.deleteTitle', { name: deleting.fullName }) : ''}</AlertDialogTitle><AlertDialogDescription>{t('students.deleteDescription')}</AlertDialogDescription></AlertDialogHeader>{deleteError && <FormError message={deleteError} />}<AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleteBusy} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>{deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}{t('students.deleteConfirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
