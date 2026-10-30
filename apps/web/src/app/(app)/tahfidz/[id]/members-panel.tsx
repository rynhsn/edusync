'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { initialsOf } from '../shared';

/** Dialog: pilih kelas lalu centang siswa. Siswa yang sudah ada di halaqah lain pada tahun ajaran ini ditandai. */
function AddMembers({
  halaqahId,
  yearId,
  memberIds,
}: {
  halaqahId: string;
  yearId: string;
  memberIds: Set<string>;
}) {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'tahfidz-add', classId],
    enabled: !!classId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { classId, limit: 100 } } })),
  });
  // Anggota semua halaqah tahun ajaran ini, untuk menandai siswa yang sudah dipakai halaqah lain.
  const others = useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, yearId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah', { params: { ...header, query: { academicYearId: yearId } } }),
      ),
  });
  const otherMembers = useQuery({
    queryKey: ['tahfidz-all-members', school.schoolId, yearId, others.data?.map((h) => h.id).join(',')],
    enabled: !!others.data,
    queryFn: async () => {
      const map = new Map<string, string>();
      for (const h of others.data ?? []) {
        if (h.id === halaqahId) continue;
        const rows = unwrap(
          await api.GET('/v1/tahfidz/halaqah/{id}/members', { params: { ...header, path: { id: h.id } } }),
        );
        for (const m of rows) map.set(m.studentId, h.name);
      }
      return map;
    },
  });

  const needle = q.trim().toLowerCase();
  const list = (students.data?.items ?? []).filter(
    (s) => s.status === 'active' && (!needle || s.name.toLowerCase().includes(needle)),
  );

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/tahfidz/halaqah/{id}/members', {
          params: { ...header, path: { id: halaqahId } },
          body: { studentIds: picked },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('membersAdded', { count: r.added, skipped: r.skipped.length }));
      for (const k of ['tahfidz-members', 'tahfidz-halaqah', 'tahfidz-summary', 'tahfidz-all-members'])
        queryClient.invalidateQueries({ queryKey: [k, school.schoolId] });
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
        <Label htmlFor="th-add-class">{t('class')}</Label>
        <SelectField id="th-add-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
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
              const elsewhere = otherMembers.data?.get(s.id);
              return (
                <li key={s.id}>
                  <Label
                    htmlFor={`th-add-${s.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-normal"
                  >
                    <Checkbox
                      id={`th-add-${s.id}`}
                      disabled={already || !!elsewhere}
                      checked={already || picked.includes(s.id)}
                      onCheckedChange={(next) => toggle(s.id, next)}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {already && <span className="text-muted-foreground text-xs">{t('alreadyMember')}</span>}
                    {elsewhere && !already && (
                      <span className="text-chart-2 max-w-40 truncate text-xs">
                        {t('inOtherHalaqah', { name: elsewhere })}
                      </span>
                    )}
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

export function MembersPanel({
  halaqahId,
  yearId,
  canWrite,
}: {
  halaqahId: string;
  yearId: string;
  canWrite: boolean;
}) {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const members = useQuery({
    queryKey: ['tahfidz-members', school.schoolId, halaqahId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah/{id}/members', { params: { ...header, path: { id: halaqahId } } }),
      ),
  });
  const remove = useMutation({
    mutationFn: async (studentId: string) =>
      unwrap(
        await api.DELETE('/v1/tahfidz/halaqah/{id}/members/{studentId}', {
          params: { ...header, path: { id: halaqahId, studentId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('removed'));
      for (const k of ['tahfidz-members', 'tahfidz-halaqah', 'tahfidz-summary', 'tahfidz-all-members'])
        queryClient.invalidateQueries({ queryKey: [k, school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const memberIds = new Set((members.data ?? []).map((m) => m.studentId));

  return (
    <div className="grid gap-4">
      {canWrite && (
        <div className="flex justify-end">
          <AddMembers halaqahId={halaqahId} yearId={yearId} memberIds={memberIds} />
        </div>
      )}
      {members.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {members.data?.length === 0 && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">
          <UserPlus className="mx-auto mb-2 size-6" />
          {t('noMembers')}
        </Card>
      )}
      {members.data && members.data.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.data.map((m) => (
            <li key={m.studentId}>
              <Card className="flex-row items-center gap-3 p-3">
                <span className="bg-chart-5/15 grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold">
                  {initialsOf(m.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/tahfidz/siswa/${m.studentId}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {m.name}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {[m.className, m.nis].filter(Boolean).join(' · ') || '-'}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('remove')} ${m.name}`}
                    title={t('remove')}
                    onClick={() => setRemoving({ id: m.studentId, name: m.name })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        title={t('removeMemberTitle', { name: removing?.name ?? '' })}
        description={t('removeMemberBody')}
        confirmLabel={t('remove')}
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id);
        }}
      />
    </div>
  );
}
