'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';

interface Draft {
  name: string;
  startsOn: string;
  endsOn: string;
}
const EMPTY: Draft = { name: '', startsOn: '', endsOn: '' };

/** Semester satu tahun ajaran: lihat, buat otomatis (Ganjil dan Genap) atau manual, ubah, aktifkan, hapus. */
export function SemestersPanel({ yearId }: { yearId: string }) {
  const t = useTranslations('semesters');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('academic_year:manage');
  const key = ['semesters', school.schoolId, yearId];

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['academic-years', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
  };
  const onError = (e: unknown) => toast.error(te(errorKey(e)));

  const makeDefault = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/academic-years/{id}/semesters/default', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('created'));
      refresh();
    },
    onError,
  });
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/academic-years/{id}/semesters', {
          params: { ...header, path: { id: yearId } },
          body: draft,
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY);
      toast.success(t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/semesters/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, startsOn: v.startsOn, endsOn: v.endsOn },
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      toast.success(t('saved'));
      refresh();
    },
    onError,
  });
  const activate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.PUT('/v1/semesters/{id}/activate', { params: { ...header, path: { id } } })),
    onSuccess: () => refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/semesters/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError,
  });

  const show = (iso: string) => formatCalendarDate(locale, iso);

  return (
    <div className="grid gap-3">
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}
      <ul className="grid gap-2 text-sm">
        {list.data?.map((s) => {
          const open = editing?.id === s.id;
          return (
            <li key={s.id} className="grid gap-2">
              {open && editing ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    aria-label={t('name')}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <DatePicker
                    aria-label={t('starts')}
                    value={editing.startsOn}
                    onChange={(v) => setEditing({ ...editing, startsOn: v })}
                  />
                  <DatePicker
                    aria-label={t('ends')}
                    value={editing.endsOn}
                    onChange={(v) => setEditing({ ...editing, endsOn: v })}
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
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {s.isActive && <Badge variant="secondary">{t('active')}</Badge>}
                    <span className="text-muted-foreground">
                      {show(s.startsOn)} – {show(s.endsOn)}
                    </span>
                  </span>
                  {manage && (
                    <span className="flex flex-wrap gap-2">
                      {!s.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate(s.id)}
                        >
                          {t('activate')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({ id: s.id, name: s.name, startsOn: s.startsOn, endsOn: s.endsOn })
                        }
                      >
                        {t('edit')}
                      </Button>
                      {!s.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(s.id)}
                        >
                          {t('delete')}
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {manage && (
        <>
          {list.data?.length === 0 && (
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={makeDefault.isPending}
                onClick={() => makeDefault.mutate()}
              >
                {t('makeDefault')}
              </Button>
            </div>
          )}
          <form
            className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor={`sem-name-${yearId}`}>{t('name')}</Label>
              <Input
                id={`sem-name-${yearId}`}
                required
                maxLength={40}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`sem-start-${yearId}`}>{t('starts')}</Label>
              <DatePicker
                id={`sem-start-${yearId}`}
                value={draft.startsOn}
                onChange={(v) => setDraft({ ...draft, startsOn: v })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`sem-end-${yearId}`}>{t('ends')}</Label>
              <DatePicker
                id={`sem-end-${yearId}`}
                value={draft.endsOn}
                onChange={(v) => setDraft({ ...draft, endsOn: v })}
              />
            </div>
            <Button type="submit" size="sm" disabled={create.isPending || !draft.startsOn || !draft.endsOn}>
              {t('add')}
            </Button>
            {error && (
              <Alert variant="destructive" className="sm:col-span-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </>
      )}
    </div>
  );
}
