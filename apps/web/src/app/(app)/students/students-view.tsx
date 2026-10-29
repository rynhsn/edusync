'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

const PAGE = 25;
const STATUSES = ['active', 'graduated', 'transferred', 'dropped'] as const;
type Status = (typeof STATUSES)[number];
const STATUS_KEY = {
  active: 'statusActive',
  graduated: 'statusGraduated',
  transferred: 'statusTransferred',
  dropped: 'statusDropped',
} as const;

interface Draft {
  name: string;
  nis: string;
  nisn: string;
  gender: 'L' | 'P';
  birthDate: string;
  status: Status;
  classId: string;
}
const EMPTY: Draft = {
  name: '',
  nis: '',
  nisn: '',
  gender: 'L',
  birthDate: '',
  status: 'active',
  classId: '',
};

const clean = (d: Draft) => ({
  name: d.name,
  nis: d.nis.trim() || null,
  nisn: d.nisn.trim() || null,
  gender: d.gender,
  birthDate: d.birthDate || null,
  status: d.status,
});

function StudentFields({
  idPrefix,
  draft,
  classes,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  classes: { id: string; name: string }[];
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const f = (k: keyof Draft) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor={f('name')}>{tm('name')}</Label>
        <Input
          id={f('name')}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('nis')}>{t('nis')}</Label>
        <Input
          id={f('nis')}
          maxLength={30}
          value={draft.nis}
          onChange={(e) => onChange({ ...draft, nis: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('nisn')}>{t('nisn')}</Label>
        <Input
          id={f('nisn')}
          maxLength={30}
          value={draft.nisn}
          onChange={(e) => onChange({ ...draft, nisn: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('gender')}>{t('gender')}</Label>
        <NativeSelect
          id={f('gender')}
          value={draft.gender}
          onChange={(e) => onChange({ ...draft, gender: e.target.value as 'L' | 'P' })}
        >
          <option value="L">{t('male')}</option>
          <option value="P">{t('female')}</option>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('birthDate')}>{t('birthDate')}</Label>
        <Input
          id={f('birthDate')}
          type="date"
          value={draft.birthDate}
          onChange={(e) => onChange({ ...draft, birthDate: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('status')}>{t('status')}</Label>
        <NativeSelect
          id={f('status')}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Status })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </NativeSelect>
      </div>
      {classes.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor={f('classId')}>{t('class')}</Label>
          <NativeSelect
            id={f('classId')}
            value={draft.classId}
            onChange={(e) => onChange({ ...draft, classId: e.target.value })}
          >
            <option value="">{t('noClass')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}

export function StudentsView() {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');

  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string; originalClassId: string } & Draft) | null>(null);

  // Kelas yang dapat dipilih: hanya tahun ajaran aktif, karena siswa ditempatkan pada tahun berjalan.
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: can('class:read') && !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const classList = classes.data ?? [];

  const query = {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(classFilter ? { classId: classFilter } : {}),
    ...(statusFilter ? { status: statusFilter as Status } : {}),
    limit: PAGE,
    offset: page * PAGE,
  };
  const list = useQuery({
    queryKey: ['students', school.schoolId, query],
    queryFn: async () => unwrap(await api.GET('/v1/students', { params: { ...header, query } })),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
  };

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/students', {
          params: header,
          body: { ...clean(draft), classId: draft.classId || null },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY);
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const save = useMutation({
    mutationFn: async (v: NonNullable<typeof editing>) => {
      const path = { id: v.id };
      await unwrap(await api.PUT('/v1/students/{id}', { params: { ...header, path }, body: clean(v) }));
      if (v.classId !== v.originalClassId) {
        await unwrap(
          await api.PUT('/v1/students/{id}/class', {
            params: { ...header, path },
            body: { classId: v.classId || null },
          }),
        );
      }
    },
    onSuccess: () => {
      setEditing(null);
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/students/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{tm('readOnly')}</p>}
        {manage && (
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href="/students/import" />}
          >
            {t('importLink')}
          </Button>
        )}
      </div>

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('addTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <StudentFields idPrefix="new" draft={draft} classes={classList} onChange={setDraft} />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button type="submit" disabled={create.isPending}>
                  {tm('add')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="student-q">{tm('search')}</Label>
          <Input
            id="student-q"
            value={q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {classList.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="student-class">{t('class')}</Label>
            <NativeSelect
              id="student-class"
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">{t('allClasses')}</option>
              {classList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="student-status">{t('status')}</Label>
          <NativeSelect
            id="student-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('allStatus')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_KEY[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.items.length === 0 && <p className="text-muted-foreground text-sm">{tm('empty')}</p>}

      {list.data && list.data.items.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {list.data.items.map((s) => {
                const open = editing?.id === s.id;
                return (
                  <li key={s.id} className="grid gap-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{s.name}</span>
                        <p className="text-muted-foreground text-xs">
                          {[s.nis && `${t('nis')} ${s.nis}`, s.nisn && `${t('nisn')} ${s.nisn}`]
                            .filter(Boolean)
                            .join(' · ') || tm('none')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {s.className && <Badge variant="outline">{s.className}</Badge>}
                        <Badge variant={s.status === 'active' ? 'secondary' : 'outline'}>
                          {t(STATUS_KEY[s.status])}
                        </Badge>
                        {manage && !open && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEditing({
                                  id: s.id,
                                  originalClassId: s.classId ?? '',
                                  name: s.name,
                                  nis: s.nis ?? '',
                                  nisn: s.nisn ?? '',
                                  gender: s.gender,
                                  birthDate: s.birthDate ?? '',
                                  status: s.status,
                                  classId: s.classId ?? '',
                                })
                              }
                            >
                              {tm('edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(s.id)}
                            >
                              {tm('delete')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {open && editing && (
                      <div className="grid gap-3">
                        <StudentFields
                          idPrefix={`edit-${s.id}`}
                          draft={editing}
                          classes={classList}
                          onChange={(d) => setEditing({ ...editing, ...d })}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(editing)}>
                            {tm('save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            {tm('cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {list.data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{t('total', { count: total })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t('prev')}
            </Button>
            <span className="text-muted-foreground">
              {page + 1} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
