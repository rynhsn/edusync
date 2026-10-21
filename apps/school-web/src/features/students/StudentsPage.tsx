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

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'LULUS', label: 'Lulus' },
  { value: 'MUTASI', label: 'Mutasi' },
  { value: 'KELUAR', label: 'Keluar' },
];

type FormValues = { nis: string; nisn: string; fullName: string; gender: string; classId: string; academicYearId: string; status: StudentStatus };

const emptyForm = (yearId: string): FormValues => ({ nis: '', nisn: '', fullName: '', gender: '', classId: '', academicYearId: yearId, status: 'AKTIF' });

function StudentForm({ mode, student, classes, academicYears, onDone, onCancel }: { mode: 'create' | 'edit'; student?: Student; classes: SchoolClass[]; academicYears: AcademicYear[]; onDone: (message: string) => Promise<void> | void; onCancel: () => void }) {
  const [form, setForm] = useState<FormValues>(() => student
    ? { nis: student.nis, nisn: student.nisn ?? '', fullName: student.fullName, gender: student.gender ?? '', classId: student.classId ?? '', academicYearId: student.academicYearId ?? '', status: student.status }
    : emptyForm(academicYears.find((year) => year.isActive)?.id ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<FormValues>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.classId || !form.academicYearId) { setError('Pilih kelas dan tahun ajaran untuk siswa ini.'); return; }
    setBusy(true);
    try {
      const base = { nis: form.nis.trim(), nisn: form.nisn.trim() || null, fullName: form.fullName.trim(), gender: (form.gender || null) as 'L' | 'P' | null };
      if (mode === 'create') {
        await createStudent({ ...base, classId: form.classId, academicYearId: form.academicYearId, status: form.status });
        await onDone(`${base.fullName} ditambahkan ke ${classes.find((item) => item.id === form.classId)?.name ?? 'kelas'}.`);
      } else {
        await updateStudent(student!.id, { ...base, classId: form.classId, academicYearId: form.academicYearId, status: form.status });
        await onDone(`Data ${base.fullName} diperbarui.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Data siswa tidak dapat disimpan.'); }
    finally { setBusy(false); }
  };

  return <form className="space-y-4" onSubmit={submit}>
    {error && <FormError message={error} />}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="fullName">Nama lengkap</Label><Input id="fullName" name="fullName" required minLength={2} maxLength={100} placeholder="Nama siswa" value={form.fullName} onChange={(event) => set({ fullName: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="nis">NIS</Label><Input id="nis" name="nis" required maxLength={20} placeholder="Nomor induk siswa" value={form.nis} onChange={(event) => set({ nis: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="nisn">NISN</Label><Input id="nisn" name="nisn" maxLength={10} placeholder="Opsional" value={form.nisn} onChange={(event) => set({ nisn: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gender">Jenis kelamin</Label><Select value={form.gender || 'none'} onValueChange={(value) => set({ gender: value === 'none' ? '' : value })}><SelectTrigger id="gender"><SelectValue placeholder="Belum diisi" /></SelectTrigger><SelectContent><SelectItem value="none">Belum diisi</SelectItem><SelectItem value="L">Laki-laki</SelectItem><SelectItem value="P">Perempuan</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="classId">Kelas</Label><Select value={form.classId} onValueChange={(value) => set({ classId: value })}><SelectTrigger id="classId"><SelectValue placeholder={classes.length ? 'Pilih kelas' : 'Belum ada kelas'} /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · tingkat {item.gradeLevel}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="academicYearId">Tahun ajaran</Label><Select value={form.academicYearId} onValueChange={(value) => set({ academicYearId: value })}><SelectTrigger id="academicYearId"><SelectValue placeholder={academicYears.length ? 'Pilih tahun ajaran' : 'Belum ada tahun ajaran'} /></SelectTrigger><SelectContent>{academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isActive ? ' · aktif' : ''}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="status">Status</Label><Select value={form.status} onValueChange={(value) => set({ status: value as StudentStatus })}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {(classes.length === 0 || academicYears.length === 0) && <Alert variant="warning"><CircleAlert size={16} /><AlertDescription>{classes.length === 0 ? 'Tambahkan kelas dulu sebelum mendaftarkan siswa. ' : ''}{academicYears.length === 0 ? 'Tambahkan tahun ajaran dulu sebelum mendaftarkan siswa.' : ''}</AlertDescription></Alert>}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Batal</Button><Button type="submit" disabled={busy || classes.length === 0 || academicYears.length === 0}>{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === 'create' ? 'Simpan siswa' : 'Simpan perubahan'}</Button></div>
  </form>;
}

export function StudentsPage({ students, classes, academicYears, loading, canManage, onChanged }: { students: Student[]; classes: SchoolClass[]; academicYears: AcademicYear[]; loading: boolean; canManage: boolean; onChanged: (message: string, tone?: 'success' | 'warning') => Promise<void> | void }) {
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
      await onChanged(`${deleting.fullName} dihapus dari daftar siswa.`, 'warning');
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Siswa tidak dapat dihapus.'); }
    finally { setDeleteBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Cari nama, NIS atau NISN" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search students" /></div>
      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | StudentStatus)}><SelectTrigger className="sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua status</SelectItem>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
      {canManage && <Button onClick={() => setCreating(true)} disabled={classes.length === 0 || academicYears.length === 0}><Plus className="size-4" />Tambah siswa</Button>}
    </div>

    {loading && students.length === 0 ? <Loading label="Loading students" /> : filtered.length === 0
      ? <Card><CardContent className="p-0"><EmptyState icon={<Users size={22} />} title={students.length === 0 ? 'No students yet' : 'No matching students'} description={students.length === 0 ? 'Register the first student to start building this school’s master data.' : 'Try a different name, NIS, NISN or status filter.'} action={students.length === 0 && canManage && classes.length > 0 && academicYears.length > 0 ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />Add student</Button> : undefined} /></CardContent></Card>
      : <Card><CardContent className="p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead><tr className="border-b border-border bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Student</th><th className="px-5 py-3">NIS / NISN</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Academic year</th><th className="px-5 py-3">Status</th>{canManage && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-border">{filtered.map((student) => <tr key={student.id} className="hover:bg-slate-50/60">
          <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{student.fullName.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-semibold">{student.fullName}</p><p className="text-xs text-muted-foreground">{student.gender === 'L' ? 'Laki-laki' : student.gender === 'P' ? 'Perempuan' : 'Gender not set'}</p></div></div></td>
          <td className="px-5 py-3.5"><span className="block font-medium">{student.nis}</span><span className="block text-xs text-muted-foreground">{student.nisn ?? '—'}</span></td>
          <td className="px-5 py-3.5">{student.className ? <Badge variant="outline">{student.className}</Badge> : <span className="text-xs text-muted-foreground">Not enrolled</span>}</td>
          <td className="px-5 py-3.5 text-muted-foreground">{student.academicYearName ?? '—'}</td>
          <td className="px-5 py-3.5"><StudentStatusBadge status={student.status} /></td>
          {canManage && <td className="px-5 py-3.5"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${student.fullName}`} onClick={() => setEditing(student)}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${student.fullName}`} onClick={() => { setDeleteError(''); setDeleting(student); }}><Trash2 size={15} className="text-rose-600" /></Button></div></td>}
        </tr>)}</tbody>
      </table></div></CardContent></Card>}

    {!canManage && <p className="text-xs text-muted-foreground">You have read-only access. Ask a school admin to add or change students.</p>}

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Add a student</DialogTitle><DialogDescription>Creates the student and their enrollment in one step.</DialogDescription></DialogHeader>{creating && <StudentForm mode="create" classes={classes} academicYears={academicYears} onCancel={() => setCreating(false)} onDone={async (message) => { setCreating(false); await onChanged(message); }} />}</DialogContent></Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit student</DialogTitle><DialogDescription>Update the record or move the student to another class.</DialogDescription></DialogHeader>{editing && <StudentForm mode="edit" student={editing} classes={classes} academicYears={academicYears} onCancel={() => setEditing(null)} onDone={async (message) => { setEditing(null); await onChanged(message); }} />}</DialogContent></Dialog>

    <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.fullName}?</AlertDialogTitle><AlertDialogDescription>This removes the student and their enrollments from this school. The record is kept as deleted so it can be audited.</AlertDialogDescription></AlertDialogHeader>{deleteError && <FormError message={deleteError} />}<AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleteBusy} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>{deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}Delete student</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
