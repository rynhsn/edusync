'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

const KEYS = ['kkm', 'predicateA', 'predicateB', 'predicateC'] as const;
type Key = (typeof KEYS)[number];

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(',', '.')));

/** Kartu KKM dan batas predikat: A > B > C, semuanya 0..100. */
function ThresholdsCard() {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [values, setValues] = useState<Record<Key, string>>({
    kkm: '',
    predicateA: '',
    predicateB: '',
    predicateC: '',
  });
  const [dirty, setDirty] = useState(false);

  const key = ['grading-settings', school.schoolId];
  const settings = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/grading/settings', { params: header })),
  });
  useEffect(() => {
    if (!settings.data) return;
    setValues({
      kkm: String(settings.data.kkm),
      predicateA: String(settings.data.predicateA),
      predicateB: String(settings.data.predicateB),
      predicateC: String(settings.data.predicateC),
    });
    setDirty(false);
  }, [settings.data]);

  const n = {
    kkm: num(values.kkm),
    a: num(values.predicateA),
    b: num(values.predicateB),
    c: num(values.predicateC),
  };
  const inRange = [n.kkm, n.a, n.b, n.c].every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
  const ordered = n.a > n.b && n.b > n.c;
  const valid = inRange && ordered;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/grading/settings', {
          params: header,
          body: { kkm: n.kkm, predicateA: n.a, predicateB: n.b, predicateC: n.c },
        }),
      ),
    onSuccess: () => {
      toast.success(t('settingsSaved'));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (settings.isPending) return <Skeleton className="h-40 w-full" />;
  if (!settings.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(settings.error))}</AlertDescription>
      </Alert>
    );

  return (
    <Card className="gap-4 p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">{t('thresholdsTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('thresholdsHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KEYS.map((k) => (
          <div key={k} className="grid gap-2">
            <Label htmlFor={`grade-${k}`}>{t(`field_${k}`)}</Label>
            <Input
              id={`grade-${k}`}
              inputMode="decimal"
              value={values[k]}
              aria-invalid={values[k] !== '' && !valid}
              onChange={(e) => {
                setValues((v) => ({ ...v, [k]: e.target.value }));
                setDirty(true);
              }}
            />
          </div>
        ))}
      </div>
      {dirty && !inRange && (
        <Alert variant="destructive">
          <AlertDescription>{t('rangeError')}</AlertDescription>
        </Alert>
      )}
      {dirty && inRange && !ordered && (
        <Alert variant="destructive">
          <AlertDescription>{t('orderError')}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </div>
    </Card>
  );
}

interface Form {
  name: string;
  weight: string;
  sort: string;
}

/** Kartu komponen nilai (tugas, UH, UTS, UAS, dst.) beserta bobotnya; total bobot idealnya 100. */
function ComponentsCard() {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: '', weight: '', sort: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const key = ['grading-components', school.schoolId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });
  const items = list.data ?? [];
  const total = items.reduce((sum, c) => sum + c.weight, 0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
  };

  const weight = num(form.weight);
  const sort = form.sort.trim() === '' ? 0 : num(form.sort);
  const formValid =
    form.name.trim().length > 0 &&
    Number.isInteger(weight) &&
    weight >= 1 &&
    weight <= 100 &&
    Number.isInteger(sort) &&
    sort >= 0;

  const submit = useMutation({
    mutationFn: async () => {
      const body = { name: form.name.trim(), weight, sort };
      if (editing) {
        return unwrap(
          await api.PUT('/v1/grading/components/{id}', {
            params: { ...header, path: { id: editing } },
            body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/grading/components', { params: header, body }));
    },
    onSuccess: () => {
      toast.success(editing ? t('componentUpdated') : t('componentCreated'));
      refresh();
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/grading/components/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('componentDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const defaults = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/grading/components/defaults', { params: header })),
    onSuccess: () => {
      toast.success(t('defaultsApplied'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openDialog(id: string, init: Form) {
    setForm(init);
    setFormError(null);
    setEditing(id);
  }

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('componentsTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('componentsHint')}</p>
        </div>
        <Button
          onClick={() =>
            openDialog('', { name: '', weight: '', sort: String(items.length > 0 ? items.length + 1 : 1) })
          }
        >
          <Plus className="size-4" /> {t('addComponent')}
        </Button>
      </div>

      {list.isPending && <Skeleton className="h-32 w-full" />}
      {list.data && items.length === 0 && (
        <div className="text-muted-foreground grid justify-items-center gap-3 p-8 text-center text-sm">
          <p>{t('noComponents')}</p>
          <Button variant="outline" disabled={defaults.isPending} onClick={() => defaults.mutate()}>
            {t('applyDefaults')}
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('componentName')}</TableHead>
                <TableHead className="text-right">{t('weight')}</TableHead>
                <TableHead className="text-right">{t('sort')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.weight}%</TableCell>
                  <TableCell className="text-right tabular-nums">{c.sort}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('edit')}
                      onClick={() =>
                        openDialog(c.id, { name: c.name, weight: String(c.weight), sort: String(c.sort) })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('delete')}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(t('confirmDeleteComponent', { name: c.name })))
                          remove.mutate(c.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell>{t('totalWeight')}</TableCell>
                <TableCell className={`text-right tabular-nums ${total === 100 ? '' : 'text-red-600'}`}>
                  {total}%
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
          {total !== 100 && (
            <Alert variant="destructive">
              <AlertDescription>{t('weightWarning', { total })}</AlertDescription>
            </Alert>
          )}
        </>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={editing ? t('editComponent') : t('addComponent')}
        submitLabel={t('save')}
        error={formError}
        disabled={!formValid || submit.isPending}
        onSubmit={() => submit.mutateAsync()}
      >
        <div className="grid gap-2">
          <Label htmlFor="component-name">{t('componentName')}</Label>
          <Input
            id="component-name"
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="component-weight">{t('weightPercent')}</Label>
            <Input
              id="component-weight"
              inputMode="numeric"
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="component-sort">{t('sort')}</Label>
            <Input
              id="component-sort"
              inputMode="numeric"
              value={form.sort}
              onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
            />
          </div>
        </div>
      </FormDialog>
    </Card>
  );
}

/** Pengaturan penilaian: KKM, batas predikat, dan komponen nilai berbobot. */
export function GradeSettingsView() {
  const t = useTranslations('grades');
  return (
    <PageBody>
      <PageHeader title={t('settingsTitle')} description={t('settingsSubtitle')} />
      <ThresholdsCard />
      <ComponentsCard />
    </PageBody>
  );
}
