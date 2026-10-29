'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { SemestersPanel } from './semesters-panel';

export function AcademicYearsView() {
  const t = useTranslations('academicYears');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const key = ['academic-years', school.schoolId];
  const [formError, setFormError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [semestersFor, setSemestersFor] = useState<string | null>(null);
  const ts = useTranslations('semesters');

  const show = (iso: string) => formatCalendarDate(locale, iso);

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });

  const create = useMutation({
    mutationFn: async (body: { name: string; startsOn: string; endsOn: string }) =>
      unwrap(
        await api.POST('/v1/academic-years', {
          params: { header: schoolHeader(school.schoolId) },
          body,
        }),
      ),
    onSuccess: (row) => {
      setFormError(null);
      toast.success(t('created', { name: row.name }));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const activate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/activate', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('activated'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        name: String(data.get('name')),
        startsOn,
        endsOn,
      },
      {
        onSuccess: () => {
          form.reset();
          setStartsOn('');
          setEndsOn('');
        },
      },
    );
  }

  return (
    <div className="grid w-full gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t('list')}</CardTitle>
          </CardHeader>
          <CardContent>
            {list.isPending && <Skeleton className="h-20 w-full" />}
            {list.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
              </Alert>
            )}
            {list.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                {t('empty')} {can('academic_year:manage') ? t('emptyManage') : t('emptyReadonly')}
              </p>
            )}
            {list.data && list.data.length > 0 && (
              <ul className="divide-y">
                {list.data.map((y) => (
                  <li key={y.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {y.name}
                      {y.isActive && <Badge variant="secondary">{t('active')}</Badge>}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-3 text-sm">
                      {show(y.startsOn)} – {show(y.endsOn)}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={semestersFor === y.id}
                        onClick={() => setSemestersFor(semestersFor === y.id ? null : y.id)}
                      >
                        {ts('toggle')}
                      </Button>
                      {!y.isActive && can('academic_year:manage') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate(y.id)}
                        >
                          {t('activate')}
                        </Button>
                      )}
                    </span>
                    {semestersFor === y.id && (
                      <div className="basis-full">
                        <SemestersPanel yearId={y.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {can('academic_year:manage') && (
          <Card>
            <CardHeader>
              <CardTitle>{t('createTitle')}</CardTitle>
              <CardDescription>{t('createDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-4">
                {formError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="name">{t('name')}</Label>
                  <Input id="name" name="name" placeholder="2026/2027" required maxLength={40} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="startsOn">{t('startsOn')}</Label>
                  <DatePicker id="startsOn" value={startsOn} onChange={setStartsOn} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endsOn">{t('endsOn')}</Label>
                  <DatePicker id="endsOn" value={endsOn} onChange={setEndsOn} />
                </div>
                <Button type="submit" disabled={create.isPending || !startsOn || !endsOn}>
                  {create.isPending ? t('saving') : t('save')}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
