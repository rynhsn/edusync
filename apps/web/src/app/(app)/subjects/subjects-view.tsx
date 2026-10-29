'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { CurriculumBank } from './curriculum-bank';

interface Draft {
  code: string;
  name: string;
}

export function SubjectsView() {
  const t = useTranslations('subjects');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['subjects', school.schoolId];
  const manage = can('subject:manage');

  const [draft, setDraft] = useState<Draft>({ code: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/subjects', { params: header, body: draft })),
    onSuccess: () => {
      setError(null);
      setDraft({ code: '', name: '' });
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/subjects/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { code: v.code, name: v.name },
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/subjects/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{tm('readOnly')}</p>}
      </div>

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('addTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid max-w-xl gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="subject-code">{tm('code')}</Label>
                <Input
                  id="subject-code"
                  required
                  maxLength={20}
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subject-name">{tm('name')}</Label>
                <Input
                  id="subject-name"
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={create.isPending}>
                {tm('add')}
              </Button>
              {error && (
                <Alert variant="destructive" className="sm:col-span-3">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {manage && <CurriculumBank />}

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
              {list.data.map((s) => {
                const open = editing?.id === s.id;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    {open && editing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label={tm('code')}
                          className="w-28"
                          value={editing.code}
                          onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                        />
                        <Input
                          aria-label={tm('name')}
                          className="w-60"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(editing)}>
                          {tm('save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          {tm('cancel')}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="font-medium">{s.name}</span>{' '}
                          <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
                        </div>
                        {manage && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing({ id: s.id, code: s.code, name: s.name })}
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
                          </div>
                        )}
                      </>
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
