'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, SlidersHorizontal, Target, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, MODULE_TONE, TONES, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { COMPONENT_TONES, predicateTone } from '../grade-ui';

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

  // Pratinjau rentang predikat dari isian saat ini (hanya bila isian sah dan berurutan).
  const bands = valid
    ? ([
        { p: 'A', range: `≥ ${n.a}` },
        { p: 'B', range: `${n.b} – ${n.a}` },
        { p: 'C', range: `${n.c} – ${n.b}` },
        { p: 'D', range: `< ${n.c}` },
      ] as const)
    : null;

  return (
    <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex items-start gap-3">
        <IconTile icon={Target} tone={MODULE_TONE.academic} />
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('thresholdsTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('thresholdsHint')}</p>
        </div>
      </div>
      {bands && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {bands.map((b) => (
            <div key={b.p} className={cn('rounded-xl px-3 py-2', TONES[predicateTone(b.p)].soft)}>
              <p className="font-heading text-lg leading-none font-semibold">{b.p}</p>
              <p className="mt-1 text-xs tabular-nums opacity-80">{b.range}</p>
            </div>
          ))}
        </div>
      )}
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
  const tc = useTranslations('common');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: '', weight: '', sort: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

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
    <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Layers} tone="amber" />
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('componentsTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('componentsHint')}</p>
          </div>
        </div>
        <Button
          onClick={() =>
            openDialog('', { name: '', weight: '', sort: String(items.length > 0 ? items.length + 1 : 1) })
          }
        >
          <Plus className="size-4" /> {t('addComponent')}
        </Button>
      </div>

      {list.isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {list.data && items.length === 0 && (
        <EmptyPanel
          icon={Layers}
          tone="amber"
          title={t('noComponentsTitle')}
          body={t('noComponents')}
          action={
            <Button variant="outline" disabled={defaults.isPending} onClick={() => defaults.mutate()}>
              {t('applyDefaults')}
            </Button>
          }
        />
      )}
      {items.length > 0 && (
        <>
          <div className="grid gap-2">
            <div
              role="img"
              aria-label={`${t('totalWeight')}: ${total}%`}
              className="bg-muted flex h-3 overflow-hidden rounded-full"
            >
              {items.map((c, i) => (
                <div
                  key={c.id}
                  title={`${c.name} ${c.weight}%`}
                  className={cn(
                    'h-full border-r border-background last:border-0',
                    TONES[COMPONENT_TONES[i % COMPONENT_TONES.length] ?? 'sky'].bar,
                  )}
                  style={{ width: `${Math.min(100, c.weight)}%` }}
                />
              ))}
            </div>
            <p
              className={cn(
                'text-xs font-medium tabular-nums',
                total === 100 ? TONES.emerald.text : TONES.rose.text,
              )}
            >
              {t('totalWeight')}: {total}%
            </p>
          </div>
          <ul className="divide-y rounded-xl border">
            {items.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-3.5 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 rounded-full',
                    TONES[COMPONENT_TONES[i % COMPONENT_TONES.length] ?? 'sky'].bar,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('sort')} {c.sort}
                  </p>
                </div>
                <ToneBadge
                  tone={COMPONENT_TONES[i % COMPONENT_TONES.length]}
                  dot={false}
                  className="tabular-nums"
                >
                  {c.weight}%
                </ToneBadge>
                <RowMenu
                  label={`${t('rowActions')}: ${c.name}`}
                  items={[
                    {
                      key: 'edit',
                      label: t('edit'),
                      icon: Pencil,
                      onSelect: () =>
                        openDialog(c.id, { name: c.name, weight: String(c.weight), sort: String(c.sort) }),
                    },
                    {
                      key: 'delete',
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeleting({ id: c.id, name: c.name }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => {
              if (!o) setDeleting(null);
            }}
            title={t('delete')}
            description={deleting ? t('confirmDeleteComponent', { name: deleting.name }) : undefined}
            confirmLabel={tc('confirmDelete')}
            destructive
            pending={remove.isPending}
            onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
          />
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
      <PageHeader
        icon={SlidersHorizontal}
        tone={MODULE_TONE.academic}
        title={t('settingsTitle')}
        description={t('settingsSubtitle')}
      />
      <ThresholdsCard />
      <ComponentsCard />
    </PageBody>
  );
}
