'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/** Guru pengampu mata pelajaran di satu kelas. */
function Assignments({ classId }: { classId: string }) {
  const t = useTranslations('classes');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('class:manage');
  const key = ['assignments', school.schoolId, classId];
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const assignments = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes/{id}/assignments', { params: { ...header, path: { id: classId } } })),
  });
  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    enabled: can('subject:read'),
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });

  const assign = useMutation({
    mutationFn: async (v: { subjectId: string; teacherId: string }) =>
      unwrap(
        await api.PUT('/v1/classes/{id}/assignments/{subjectId}', {
          params: { ...header, path: { id: classId, subjectId: v.subjectId } },
          body: { teacherId: v.teacherId },
        }),
      ),
    onSuccess: () => {
      setSubjectId('');
      setTeacherId('');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const release = useMutation({
    mutationFn: async (sid: string) =>
      unwrap(
        await api.DELETE('/v1/classes/{id}/assignments/{subjectId}', {
          params: { ...header, path: { id: classId, subjectId: sid } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <div className="grid gap-3">
      {assignments.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('noAssignments')}</p>
      )}
      <ul className="grid gap-1.5 text-sm">
        {assignments.data?.map((a) => (
          <li key={a.subjectId} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {a.subjectName} <span className="text-muted-foreground">· {a.teacherName}</span>
            </span>
            {manage && (
              <Button
                size="sm"
                variant="ghost"
                disabled={release.isPending}
                onClick={() => release.mutate(a.subjectId)}
              >
                {t('remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {manage && subjects.data && teachers.data && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`as-${classId}`}>{t('subject')}</Label>
            <SelectField
              id={`as-${classId}`}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">{t('choose')}</option>
              {subjects.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`at-${classId}`}>{t('teacher')}</Label>
            <SelectField
              id={`at-${classId}`}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">{t('choose')}</option>
              {teachers.data
                .filter((x) => x.status === 'active')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </SelectField>
          </div>
          <Button
            size="sm"
            disabled={!subjectId || !teacherId || assign.isPending}
            onClick={() => assign.mutate({ subjectId, teacherId })}
          >
            {t('assign')}
          </Button>
        </div>
      )}
    </div>
  );
}

const emptyDraft = { name: '', level: '', programId: '', homeroomTeacherId: '' };

export function ClassesView() {
  const t = useTranslations('classes');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('class:manage');

  const [yearChoice, setYearChoice] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [editError, setEditError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<{ id: string; name: string } | null>(null);
  const [programDraft, setProgramDraft] = useState({ code: '', name: '' });
  const [programError, setProgramError] = useState<string | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearId = yearChoice || years.data?.find((y) => y.isActive)?.id || years.data?.[0]?.id || '';

  const programs = useQuery({
    queryKey: ['programs', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/programs', { params: header })),
  });
  // Calon wali kelas: guru aktif. Bila pengguna tak boleh melihat guru, isian disembunyikan.
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const refreshClasses = () => queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
  const refreshPrograms = () => queryClient.invalidateQueries({ queryKey: ['programs', school.schoolId] });

  const createClass = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/classes', {
          params: header,
          body: {
            academicYearId: yearId,
            programId: draft.programId || null,
            name: draft.name,
            level: draft.level,
            homeroomTeacherId: draft.homeroomTeacherId || null,
          },
        }),
      ),
    onSuccess: () => {
      setDraft({ ...emptyDraft, level: draft.level, programId: draft.programId });
      toast.success(tm('created'));
      refreshClasses();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const updateClass = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/classes/{id}', {
          params: { ...header, path: { id: editing ?? '' } },
          body: {
            programId: editDraft.programId || null,
            name: editDraft.name,
            level: editDraft.level,
            homeroomTeacherId: editDraft.homeroomTeacherId || null,
          },
        }),
      ),
    onSuccess: () => {
      toast.success(tm('saved'));
      refreshClasses();
    },
    onError: (e) => setEditError(te(errorKey(e))),
  });
  const removeClass = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/classes/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refreshClasses();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const createProgram = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/programs', { params: header, body: programDraft })),
    onSuccess: () => {
      setProgramError(null);
      setProgramDraft({ code: '', name: '' });
      toast.success(tm('created'));
      refreshPrograms();
    },
    onError: (e) => setProgramError(te(errorKey(e))),
  });
  const removeProgram = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/programs/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refreshPrograms();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const hasYears = (years.data?.length ?? 0) > 0;

  /** Isian kelas yang sama untuk dialog tambah dan ubah. */
  const fields = (prefix: string, value: typeof emptyDraft, set: (next: typeof emptyDraft) => void) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${prefix}-name`}
          required
          maxLength={80}
          value={value.name}
          onChange={(e) => set({ ...value, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-level`}>{t('level')}</Label>
        <Input
          id={`${prefix}-level`}
          required
          maxLength={20}
          placeholder={t('levelHint')}
          value={value.level}
          onChange={(e) => set({ ...value, level: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-program`}>{t('program')}</Label>
        <SelectField
          id={`${prefix}-program`}
          value={value.programId}
          onChange={(e) => set({ ...value, programId: e.target.value })}
        >
          <option value="">{t('noProgram')}</option>
          {programs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      </div>
      {teachers.data && (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-homeroom`}>{t('homeroomTeacher')}</Label>
          <SelectField
            id={`${prefix}-homeroom`}
            value={value.homeroomTeacherId}
            onChange={(e) => set({ ...value, homeroomTeacherId: e.target.value })}
          >
            <option value="">{t('noHomeroom')}</option>
            {teachers.data
              .filter((x) => x.status === 'active' || x.id === value.homeroomTeacherId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </SelectField>
        </div>
      )}
    </div>
  );

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="outline">
                    <Layers className="size-4" /> {t('programsTitle')}
                  </Button>
                }
              />
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading text-lg">{t('programsTitle')}</DialogTitle>
                  <DialogDescription>{t('programsHint')}</DialogDescription>
                </DialogHeader>
                {programs.data?.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t('noPrograms')}</p>
                )}
                <ul className="divide-y rounded-lg border">
                  {programs.data?.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {p.name} <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                      </span>
                      {manage && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={tm('delete')}
                          disabled={removeProgram.isPending}
                          onClick={() => removeProgram.mutate(p.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {manage && (
                  <form
                    className="grid gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      createProgram.mutate();
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor="program-code">{tm('code')}</Label>
                      <Input
                        id="program-code"
                        required
                        maxLength={20}
                        value={programDraft.code}
                        onChange={(e) => setProgramDraft({ ...programDraft, code: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="program-name">{tm('name')}</Label>
                      <Input
                        id="program-name"
                        required
                        maxLength={80}
                        value={programDraft.name}
                        onChange={(e) => setProgramDraft({ ...programDraft, name: e.target.value })}
                      />
                    </div>
                    <Button type="submit" disabled={createProgram.isPending}>
                      <Plus className="size-4" /> {tm('add')}
                    </Button>
                    {programError && (
                      <Alert variant="destructive" className="sm:col-span-3">
                        <AlertDescription>{programError}</AlertDescription>
                      </Alert>
                    )}
                  </form>
                )}
              </DialogContent>
            </Dialog>
            {manage && hasYears && (
              <FormDialog
                trigger={
                  <Button>
                    <Plus className="size-4" /> {t('addTitle')}
                  </Button>
                }
                title={t('addTitle')}
                submitLabel={tm('add')}
                error={error}
                onOpenChange={() => setError(null)}
                onSubmit={() => createClass.mutateAsync()}
              >
                {fields('class', draft, setDraft)}
              </FormDialog>
            )}
          </>
        }
      />

      {years.isPending && <Skeleton className="h-24 w-full" />}
      {years.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noYears')}</Card>
      )}

      {hasYears && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              aria-label={t('year')}
              className="sm:w-52"
              value={yearId}
              onChange={(e) => setYearChoice(e.target.value)}
            >
              {years.data?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </SelectField>
          </div>

          {classes.isPending && <Skeleton className="h-32 w-full" />}
          {classes.data?.length === 0 && (
            <Card className="text-muted-foreground p-10 text-center text-sm">{tm('empty')}</Card>
          )}

          {classes.data && classes.data.length > 0 && (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tm('name')}</TableHead>
                    <TableHead>{t('level')}</TableHead>
                    <TableHead>{t('program')}</TableHead>
                    <TableHead>{t('homeroomTeacher')}</TableHead>
                    <TableHead>{t('studentsHeading')}</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.level}</Badge>
                      </TableCell>
                      <TableCell>{c.programName ?? tm('none')}</TableCell>
                      <TableCell>{c.homeroomTeacherName ?? tm('none')}</TableCell>
                      <TableCell className="tabular-nums">{c.studentCount}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t('assignments')}
                          title={t('assignments')}
                          onClick={() => setAssignFor({ id: c.id, name: c.name })}
                        >
                          <UserCheck className="size-4" />
                        </Button>
                        {manage && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('edit')}
                            title={tm('edit')}
                            onClick={() => {
                              setEditError(null);
                              setEditDraft({
                                name: c.name,
                                level: c.level,
                                programId: c.programId ?? '',
                                homeroomTeacherId: c.homeroomTeacherId ?? '',
                              });
                              setEditing(c.id);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {manage && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('delete')}
                            disabled={removeClass.isPending}
                            onClick={() => removeClass.mutate(c.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <FormDialog
        open={editing !== null}
        title={t('editTitle')}
        submitLabel={tm('save')}
        error={editError}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        onSubmit={() => updateClass.mutateAsync()}
      >
        {fields('class-edit', editDraft, setEditDraft)}
      </FormDialog>

      <Dialog open={!!assignFor} onOpenChange={(open) => !open && setAssignFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {t('assignments')} · {assignFor?.name}
            </DialogTitle>
          </DialogHeader>
          {assignFor && <Assignments classId={assignFor.id} />}
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
