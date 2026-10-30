'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/** Dialog pilih kelas lalu centang siswa yang akan ditambahkan sebagai anggota. */
function AddMembers({ id, memberIds }: { id: string; memberIds: Set<string> }) {
  const t = useTranslations('extracurricular');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'extracurricular-add', classId],
    enabled: !!classId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { classId, limit: 100 } } })),
  });

  const needle = q.trim().toLowerCase();
  const list = (students.data?.items ?? []).filter(
    (s) => s.status === 'active' && (!needle || s.name.toLowerCase().includes(needle)),
  );

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/extracurriculars/{id}/members', {
          params: { ...header, path: { id } },
          body: { studentIds: picked },
        }),
      ),
    onSuccess: () => {
      toast.success(t('membersAdded', { count: picked.length }));
      queryClient.invalidateQueries({ queryKey: ['extracurricular-members', school.schoolId, id] });
      queryClient.invalidateQueries({ queryKey: ['extracurriculars', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const toggle = (sid: string, on: boolean) =>
    setPicked((p) => (on ? [...p.filter((x) => x !== sid), sid] : p.filter((x) => x !== sid)));

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" /> {t('addMembers')}
        </Button>
      }
      title={t('addMembers')}
      description={t('addMembersHint')}
      submitLabel={t('addSelected')}
      disabled={picked.length === 0}
      error={error}
      onOpenChange={() => {
        setClassId('');
        setQ('');
        setPicked([]);
        setError(null);
      }}
      onSubmit={() => add.mutateAsync()}
    >
      <div className="grid gap-2">
        <Label htmlFor="ek-add-class">{t('class')}</Label>
        <SelectField id="ek-add-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('chooseClass')}</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      {classId && (
        <>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label={t('searchStudent')}
              className="pl-8"
              placeholder={t('searchStudent')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {students.isPending && <Skeleton className="h-32 w-full" />}
          {students.data && list.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noStudents')}</p>
          )}
          <ul className="grid max-h-72 gap-1 overflow-y-auto">
            {list.map((s) => {
              const already = memberIds.has(s.id);
              return (
                <li key={s.id}>
                  <Label
                    htmlFor={`ek-add-${s.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-normal"
                  >
                    <Checkbox
                      id={`ek-add-${s.id}`}
                      disabled={already}
                      checked={already || picked.includes(s.id)}
                      onCheckedChange={(next) => toggle(s.id, next)}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {already && <span className="text-muted-foreground text-xs">{t('alreadyMember')}</span>}
                  </Label>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {picked.length > 0 && (
        <p className="text-muted-foreground text-sm">{t('selectedCount', { count: picked.length })}</p>
      )}
    </FormDialog>
  );
}

export function MembersPanel({ id, canWrite }: { id: string; canWrite: boolean }) {
  const t = useTranslations('extracurricular');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['extracurricular-members', school.schoolId, id];

  const members = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/extracurriculars/{id}/members', { params: { ...header, path: { id } } })),
  });
  const remove = useMutation({
    mutationFn: async (studentId: string) =>
      unwrap(
        await api.DELETE('/v1/extracurriculars/{id}/members/{studentId}', {
          params: { ...header, path: { id, studentId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('removed'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['extracurriculars', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const memberIds = new Set((members.data ?? []).map((m) => m.studentId));

  return (
    <div className="grid gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <AddMembers id={id} memberIds={memberIds} />
        </div>
      )}
      {members.isPending && <Skeleton className="h-40 w-full" />}
      {members.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          <UserPlus className="mx-auto mb-2 size-5" />
          {t('noMembers')}
        </Card>
      )}
      {members.data && members.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('student')}</TableHead>
                <TableHead>{t('nis')}</TableHead>
                <TableHead>{t('className')}</TableHead>
                <TableHead>{t('joinedOn')}</TableHead>
                {canWrite && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => (
                <TableRow key={m.studentId}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{m.nis ?? '-'}</TableCell>
                  <TableCell>{m.className ?? '-'}</TableCell>
                  <TableCell className="tabular-nums">{m.joinedOn}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${t('remove')} ${m.name}`}
                        title={t('remove')}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.studentId)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
