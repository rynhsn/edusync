'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="grid gap-3 border-t pt-3">
      <p className="text-sm font-medium">{t('assignments')}</p>
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
            <NativeSelect
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
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`at-${classId}`}>{t('teacher')}</Label>
            <NativeSelect
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
            </NativeSelect>
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

export function ClassesView() {
  const t = useTranslations('classes');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('class:manage');

  const [yearChoice, setYearChoice] = useState('');
  const [draft, setDraft] = useState({ name: '', level: '', programId: '' });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
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
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft({ name: '', level: draft.level, programId: draft.programId });
      toast.success(tm('created'));
      refreshClasses();
    },
    onError: (e) => setError(te(errorKey(e))),
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

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{tm('readOnly')}</p>}
      </div>

      {years.isPending && <Skeleton className="h-24 w-full" />}
      {years.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('noYears')}</p>}

      {years.data && years.data.length > 0 && (
        <>
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="class-year">{t('year')}</Label>
            <NativeSelect id="class-year" value={yearId} onChange={(e) => setYearChoice(e.target.value)}>
              {years.data.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          {manage && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t('addTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createClass.mutate();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="class-name">{tm('name')}</Label>
                    <Input
                      id="class-name"
                      required
                      maxLength={80}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="class-level">{t('level')}</Label>
                    <Input
                      id="class-level"
                      required
                      maxLength={20}
                      placeholder={t('levelHint')}
                      value={draft.level}
                      onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="class-program">{t('program')}</Label>
                    <NativeSelect
                      id="class-program"
                      value={draft.programId}
                      onChange={(e) => setDraft({ ...draft, programId: e.target.value })}
                    >
                      <option value="">{t('noProgram')}</option>
                      {programs.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Button type="submit" disabled={createClass.isPending}>
                    {tm('add')}
                  </Button>
                  {error && (
                    <Alert variant="destructive" className="sm:col-span-2 lg:col-span-4">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {classes.isPending && <Skeleton className="h-32 w-full" />}
          {classes.data?.length === 0 && <p className="text-muted-foreground text-sm">{tm('empty')}</p>}

          <div className="grid gap-3">
            {classes.data?.map((c) => (
              <Card key={c.id}>
                <CardContent className="grid gap-3 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-lg font-semibold">{c.name}</span>
                      <Badge variant="outline">{c.level}</Badge>
                      {c.programName && <Badge variant="secondary">{c.programName}</Badge>}
                      <span className="text-muted-foreground text-sm">
                        {t('students', { count: c.studentCount })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen(open === c.id ? null : c.id)}
                      >
                        {t('assignments')}
                      </Button>
                      {manage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removeClass.isPending}
                          onClick={() => removeClass.mutate(c.id)}
                        >
                          {tm('delete')}
                        </Button>
                      )}
                    </div>
                  </div>
                  {open === c.id && <Assignments classId={c.id} />}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('programsTitle')}</CardTitle>
          <CardDescription>{t('programsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {programs.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('noPrograms')}</p>}
          <ul className="divide-y">
            {programs.data?.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {p.name} <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                </span>
                {manage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeProgram.isPending}
                    onClick={() => removeProgram.mutate(p.id)}
                  >
                    {tm('delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {manage && (
            <form
              className="grid gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                createProgram.mutate();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="program-code">{tm('code')}</Label>
                <Input
                  id="program-code"
                  required
                  maxLength={20}
                  value={programDraft.code}
                  onChange={(e) => setProgramDraft({ ...programDraft, code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
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
                {tm('add')}
              </Button>
              {programError && (
                <Alert variant="destructive" className="sm:col-span-3">
                  <AlertDescription>{programError}</AlertDescription>
                </Alert>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
