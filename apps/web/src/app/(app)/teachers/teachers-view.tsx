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
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';

interface Draft {
  name: string;
  nip: string;
  status: 'active' | 'inactive';
}
const EMPTY: Draft = { name: '', nip: '', status: 'active' };

function TeacherFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-nip`}>{t('nip')}</Label>
        <Input
          id={`${idPrefix}-nip`}
          maxLength={30}
          value={draft.nip}
          onChange={(e) => onChange({ ...draft, nip: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-status`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-status`}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Draft['status'] })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

export function TeachersView() {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('teacher:manage');

  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const key = ['teachers', school.schoolId, q];
  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/teachers', { params: { ...header, query: q.trim() ? { q: q.trim() } : {} } }),
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/teachers', { params: header, body: { ...draft, nip: draft.nip.trim() || null } }),
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
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/teachers/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, nip: v.nip.trim() || null, status: v.status },
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  async function exportExcel() {
    const rows = list.data ?? [];
    if (rows.length === 0) return void toast.info(tm('exportEmpty'));
    const blob = await buildExport(
      'Guru',
      ['Nama', 'NIP', 'Status'],
      rows.map((r) => [r.name, r.nip, r.status === 'active' ? t('active') : t('inactive')]),
      { textColumns: [2], widths: [30, 24, 14] },
    );
    saveBlob(blob, `guru-${school.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/teachers/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <div className="grid w-full gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{tm('readOnly')}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportExcel}>
            {tm('export')}
          </Button>
          {manage && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/teachers/import" />}
            >
              {t('importLink')}
            </Button>
          )}
        </div>
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
              <TeacherFields idPrefix="new" draft={draft} onChange={setDraft} />
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

      <div className="grid max-w-sm gap-2">
        <Label htmlFor="teacher-q">{tm('search')}</Label>
        <Input
          id="teacher-q"
          value={q}
          placeholder={t('searchPlaceholder')}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{tm('empty')}</p>}

      {list.data && list.data.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {list.data.map((r) => {
                const open = editing?.id === r.id;
                return (
                  <li key={r.id} className="grid gap-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{r.name}</span>{' '}
                        <span className="text-muted-foreground font-mono text-xs">{r.nip ?? ''}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={r.status === 'active' ? 'secondary' : 'outline'}>
                          {r.status === 'active' ? t('active') : t('inactive')}
                        </Badge>
                        {manage && !open && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEditing({ id: r.id, name: r.name, nip: r.nip ?? '', status: r.status })
                              }
                            >
                              {tm('edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(r.id)}
                            >
                              {tm('delete')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {open && editing && (
                      <div className="grid gap-3">
                        <TeacherFields
                          idPrefix={`edit-${r.id}`}
                          draft={editing}
                          onChange={(d) => setEditing({ id: r.id, ...d })}
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
    </div>
  );
}
