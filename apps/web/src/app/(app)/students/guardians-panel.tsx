'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

const RELATIONS = ['father', 'mother', 'guardian', 'other'] as const;
type Relation = (typeof RELATIONS)[number];

interface Draft {
  name: string;
  phone: string;
  email: string;
  relation: Relation;
  isPrimary: boolean;
}
const EMPTY: Draft = { name: '', phone: '', email: '', relation: 'father', isPrimary: false };

/** Wali seorang siswa: lihat, tambah baru, tautkan yang sudah ada (kakak-adik), ubah, jadikan utama, dan lepas. */
export function GuardiansPanel({ studentId }: { studentId: string }) {
  const t = useTranslations('guardians');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');
  const key = ['guardians', school.schoolId, studentId];

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string; email: string } | null>(
    null,
  );

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students/{id}/guardians', { params: { ...header, path: { id: studentId } } }),
      ),
  });
  const found = useQuery({
    queryKey: ['guardian-search', school.schoolId, search],
    enabled: manage && search.trim().length >= 2,
    queryFn: async () =>
      unwrap(await api.GET('/v1/guardians', { params: { ...header, query: { q: search.trim() } } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (e: unknown) => toast.error(te(errorKey(e)));

  const add = useMutation({
    mutationFn: async (body: Partial<Draft> & { guardianId?: string; relation: Relation }) =>
      unwrap(
        await api.POST('/v1/students/{id}/guardians', {
          params: { ...header, path: { id: studentId } },
          body,
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY);
      setSearch('');
      toast.success(t('added'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const relink = useMutation({
    mutationFn: async (v: { guardianId: string; relation: Relation; isPrimary: boolean }) =>
      unwrap(
        await api.PUT('/v1/students/{id}/guardians/{guardianId}', {
          params: { ...header, path: { id: studentId, guardianId: v.guardianId } },
          body: { relation: v.relation, isPrimary: v.isPrimary },
        }),
      ),
    onSuccess: () => refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: async (guardianId: string) =>
      unwrap(
        await api.DELETE('/v1/students/{id}/guardians/{guardianId}', {
          params: { ...header, path: { id: studentId, guardianId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('removed'));
      refresh();
    },
    onError,
  });
  const save = useMutation({
    mutationFn: async (v: { id: string; name: string; phone: string; email: string }) =>
      unwrap(
        await api.PUT('/v1/guardians/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, phone: v.phone, email: v.email },
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      toast.success(t('saved'));
      refresh();
    },
    onError,
  });

  const linkedIds = new Set(list.data?.map((g) => g.guardianId));

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <p className="text-sm font-medium">{t('title')}</p>

      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}
      <ul className="grid gap-3">
        {list.data?.map((g) => {
          const open = editing?.id === g.guardianId;
          return (
            <li key={g.guardianId} className="grid gap-2 text-sm">
              {open && editing ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    aria-label={t('name')}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <Input
                    aria-label={t('phone')}
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  />
                  <Input
                    aria-label={t('email')}
                    type="email"
                    value={editing.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                  <div className="flex gap-2 sm:col-span-3">
                    <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(editing)}>
                      {t('save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{g.name}</span>{' '}
                    <Badge variant="outline">{t(g.relation)}</Badge>{' '}
                    {g.isPrimary && <Badge variant="secondary">{t('primary')}</Badge>}
                    <p className="text-muted-foreground text-xs">
                      {[g.phone, g.email].filter(Boolean).join(' · ')}
                      {g.studentCount > 1 && ` · ${t('siblings', { count: g.studentCount })}`}
                    </p>
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      {!g.isPrimary && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={relink.isPending}
                          onClick={() =>
                            relink.mutate({ guardianId: g.guardianId, relation: g.relation, isPrimary: true })
                          }
                        >
                          {t('makePrimary')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: g.guardianId,
                            name: g.name,
                            phone: g.phone ?? '',
                            email: g.email ?? '',
                          })
                        }
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(g.guardianId)}
                      >
                        {t('remove')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {manage && (
        <>
          <form
            className="grid gap-3 border-t pt-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(draft);
            }}
          >
            <p className="text-sm font-medium sm:col-span-2">{t('addTitle')}</p>
            <div className="grid gap-1.5">
              <Label htmlFor={`g-name-${studentId}`}>{t('name')}</Label>
              <Input
                id={`g-name-${studentId}`}
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`g-rel-${studentId}`}>{t('relation')}</Label>
              <NativeSelect
                id={`g-rel-${studentId}`}
                value={draft.relation}
                onChange={(e) => setDraft({ ...draft, relation: e.target.value as Relation })}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`g-phone-${studentId}`}>{t('phone')}</Label>
              <Input
                id={`g-phone-${studentId}`}
                inputMode="tel"
                maxLength={30}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">{t('phoneHint')}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`g-email-${studentId}`}>{t('email')}</Label>
              <Input
                id={`g-email-${studentId}`}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={draft.isPrimary}
                onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
              />
              {t('primaryCheck')}
            </label>
            {error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={add.isPending}>
                {t('add')}
              </Button>
            </div>
          </form>

          <div className="grid gap-2 border-t pt-4">
            <p className="text-sm font-medium">{t('link')}</p>
            <p className="text-muted-foreground text-xs">{t('linkHint')}</p>
            <Input
              aria-label={t('linkSearch')}
              placeholder={t('linkSearch')}
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {found.data?.length === 0 && <p className="text-muted-foreground text-xs">{t('noMatch')}</p>}
            <ul className="grid gap-1.5 text-sm">
              {found.data
                ?.filter((g) => !linkedIds.has(g.id))
                .map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {g.name} <span className="text-muted-foreground">{g.phone ?? ''}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={add.isPending}
                      onClick={() => add.mutate({ guardianId: g.id, relation: 'guardian' })}
                    >
                      {t('linkAction')}
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
