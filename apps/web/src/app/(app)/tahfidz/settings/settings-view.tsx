'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, Power, Save, Sprout, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { GeoPattern, TahfidzBanner } from '../shared';

interface ItemDraft {
  name: string;
  kind: 'daily' | 'weekly';
  active: boolean;
}
const EMPTY_ITEM: ItemDraft = { name: '', kind: 'daily', active: true };

function ItemFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: ItemDraft;
  onChange: (d: ItemDraft) => void;
}) {
  const t = useTranslations('tahfidz');
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{t('itemName')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={100}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-kind`}>{t('itemKind')}</Label>
        <SelectField
          id={`${idPrefix}-kind`}
          value={draft.kind}
          onChange={(e) => onChange({ ...draft, kind: e.target.value as ItemDraft['kind'] })}
        >
          <option value="daily">{t('kindDaily')}</option>
          <option value="weekly">{t('kindWeekly')}</option>
        </SelectField>
      </div>
    </div>
  );
}

function ItemsSection() {
  const t = useTranslations('tahfidz');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['tahfidz-ibadah-items', school.schoolId];
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [editing, setEditing] = useState<({ id: string; sort: number } & ItemDraft) | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/tahfidz/ibadah-items', { params: header })),
  });
  const list = items.data ?? [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['tahfidz-ibadah-sheet', school.schoolId] });
  };

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/tahfidz/ibadah-items', {
          params: header,
          body: {
            name: draft.name.trim(),
            kind: draft.kind,
            active: true,
            sort: (list.reduce((m, i) => Math.max(m, i.sort), 0) || 0) + 10,
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY_ITEM);
      toast.success(t('itemSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const update = useMutation({
    mutationFn: async (v: {
      id: string;
      name: string;
      kind: 'daily' | 'weekly';
      sort: number;
      active: boolean;
    }) =>
      unwrap(
        await api.PUT('/v1/tahfidz/ibadah-items/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name.trim(), kind: v.kind, sort: v.sort, active: v.active },
        }),
      ),
    onSuccess: () => {
      toast.success(t('itemSaved'));
      refresh();
    },
    onError: (e) => {
      setError(te(errorKey(e)));
      toast.error(te(errorKey(e)));
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/tahfidz/ibadah-items/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('itemDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  /** Tukar urutan dengan tetangga, lalu beri nomor urut kelipatan 10 agar tidak ada yang sama. */
  async function move(index: number, dir: -1 | 1) {
    if (!list[index] || !list[index + dir]) return;
    const order = [...list];
    [order[index], order[index + dir]] = [order[index + dir]!, order[index]!];
    for (const [pos, item] of order.entries()) {
      if (item.sort !== (pos + 1) * 10) await update.mutateAsync({ ...item, sort: (pos + 1) * 10 });
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('itemsTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('itemsHint')}</p>
        </div>
        <FormDialog
          trigger={
            <Button>
              <Plus className="size-4" /> {t('addItem')}
            </Button>
          }
          title={t('addItem')}
          submitLabel={t('addItem')}
          error={error}
          onOpenChange={() => {
            setDraft(EMPTY_ITEM);
            setError(null);
          }}
          onSubmit={() => create.mutateAsync()}
        >
          <ItemFields idPrefix="new-item" draft={draft} onChange={setDraft} />
        </FormDialog>
      </div>

      {items.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {items.data && list.length === 0 && (
        <Card className="relative items-center overflow-hidden px-6 py-12 text-center">
          <GeoPattern className="text-chart-5 opacity-[0.07]" />
          <Sprout className="text-chart-5 relative size-8" />
          <p className="text-muted-foreground relative text-sm">{t('noItemsSettings')}</p>
        </Card>
      )}
      {list.length > 0 && (
        <ul className="grid gap-2">
          {list.map((i, index) => (
            <li key={i.id}>
              <Card className={cn('flex-row flex-wrap items-center gap-3 p-3', !i.active && 'opacity-60')}>
                <span className="bg-chart-2/20 grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <div className="mt-0.5 flex gap-1.5">
                    <Badge variant="outline" className="text-[11px]">
                      {i.kind === 'daily' ? t('kindDaily') : t('kindWeekly')}
                    </Badge>
                    {!i.active && (
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <EyeOff className="size-3" /> {t('inactive')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('moveUp')} ${i.name}`}
                    disabled={index === 0 || update.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('moveDown')} ${i.name}`}
                    disabled={index === list.length - 1 || update.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${i.active ? t('deactivate') : t('activate')} ${i.name}`}
                    title={i.active ? t('deactivate') : t('activate')}
                    onClick={() => update.mutate({ ...i, active: !i.active })}
                  >
                    <Power className={cn('size-4', i.active && 'text-chart-5')} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${tm('edit')} ${i.name}`}
                    onClick={() => {
                      setError(null);
                      setEditing({ id: i.id, name: i.name, kind: i.kind, active: i.active, sort: i.sort });
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${tm('delete')} ${i.name}`}
                    onClick={() => setDeleting({ id: i.id, name: i.name })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FormDialog
          open
          title={t('itemName')}
          submitLabel={t('save')}
          error={error}
          onOpenChange={(o) => !o && setEditing(null)}
          onSubmit={() => update.mutateAsync(editing)}
        >
          <ItemFields
            idPrefix="edit-item"
            draft={editing}
            onChange={(d) => setEditing({ ...editing, ...d })}
          />
        </FormDialog>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('deleteItemTitle', { name: deleting?.name ?? '' })}
        description={t('deleteItemBody')}
        confirmLabel={tm('delete')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </section>
  );
}

function TargetsSection() {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [semesterChoice, setSemesterChoice] = useState('');
  const [halaqahChoice, setHalaqahChoice] = useState('');
  // Isian per siswa (teks, agar kosong tetap bisa diketik).
  const [values, setValues] = useState<Record<string, { z: string; m: string }>>({});
  const [fill, setFill] = useState({ z: '', m: '' });

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const semester =
    semesters.data?.find((s) => s.id === semesterChoice) ??
    semesters.data?.find((s) => s.isActive) ??
    semesters.data?.[0];
  const semesterId = semester?.id ?? '';

  const halaqah = useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, semester?.academicYearId],
    enabled: !!semester,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah', {
          params: { ...header, query: { academicYearId: semester?.academicYearId } },
        }),
      ),
  });
  const halaqahId = halaqah.data?.some((h) => h.id === halaqahChoice)
    ? halaqahChoice
    : (halaqah.data?.[0]?.id ?? '');

  const targets = useQuery({
    queryKey: ['tahfidz-targets', school.schoolId, semesterId, halaqahId],
    enabled: !!semesterId && !!halaqahId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/targets', { params: { ...header, query: { semesterId, halaqahId } } }),
      ),
  });

  // Isi ulang isian saat data target (semester atau halaqah) berganti.
  useEffect(() => {
    if (!targets.data) return;
    setValues(
      Object.fromEntries(
        targets.data.map((r) => [
          r.studentId,
          {
            z: r.ziyadahAyahs ? String(r.ziyadahAyahs) : '',
            m: r.murajaahAyahs ? String(r.murajaahAyahs) : '',
          },
        ]),
      ),
    );
  }, [targets.data]);

  const toInt = (s: string) => Math.max(0, Math.trunc(Number(s) || 0));
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/tahfidz/targets', {
          params: header,
          body: {
            semesterId,
            records: (targets.data ?? []).map((r) => ({
              studentId: r.studentId,
              ziyadahAyahs: toInt(values[r.studentId]?.z ?? ''),
              murajaahAyahs: toInt(values[r.studentId]?.m ?? ''),
            })),
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('targetsSaved'));
      queryClient.invalidateQueries({ queryKey: ['tahfidz-targets', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['tahfidz-progress', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['tahfidz-summary', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const rows = targets.data ?? [];

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">{t('targetsTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('targetsHint')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tg-semester">{t('semester')}</Label>
          <SelectField
            id="tg-semester"
            className="w-56"
            value={semesterId}
            onChange={(e) => setSemesterChoice(e.target.value)}
          >
            {semesters.data?.length === 0 && <option value="">{t('chooseSemester')}</option>}
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tg-halaqah">{t('halaqahFilter')}</Label>
          <SelectField
            id="tg-halaqah"
            className="w-56"
            value={halaqahId}
            onChange={(e) => setHalaqahChoice(e.target.value)}
          >
            {halaqah.data?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {targets.isPending && !!semesterId && !!halaqahId && <Skeleton className="h-48 w-full rounded-2xl" />}
      {halaqah.data?.length === 0 && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">{t('emptyTitle')}</Card>
      )}
      {targets.data && rows.length === 0 && (
        <Card className="text-muted-foreground items-center p-10 text-center text-sm">
          {t('noTargetStudents')}
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="bg-chart-5/10 flex flex-wrap items-end gap-3 border-b p-3">
            <div className="grid gap-1">
              <span className="text-sm font-medium">{t('fillAll')}</span>
              <span className="text-muted-foreground text-xs">{t('fillAllHint')}</span>
            </div>
            <Input
              aria-label={t('targetZiyadah')}
              placeholder={t('targetZiyadah')}
              type="number"
              inputMode="numeric"
              min={0}
              className="w-36"
              value={fill.z}
              onChange={(e) => setFill({ ...fill, z: e.target.value })}
            />
            <Input
              aria-label={t('targetMurajaah')}
              placeholder={t('targetMurajaah')}
              type="number"
              inputMode="numeric"
              min={0}
              className="w-36"
              value={fill.m}
              onChange={(e) => setFill({ ...fill, m: e.target.value })}
            />
            <Button
              variant="outline"
              onClick={() =>
                setValues(Object.fromEntries(rows.map((r) => [r.studentId, { z: fill.z, m: fill.m }])))
              }
            >
              {t('applyFill')}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b text-left">
                  <th className="px-3 py-2 font-medium">{t('student')}</th>
                  <th className="px-3 py-2 font-medium">{t('targetZiyadah')}</th>
                  <th className="px-3 py-2 font-medium">{t('targetMurajaah')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="even:bg-muted/20 border-b last:border-b-0">
                    <td className="max-w-56 truncate px-3 py-1.5 font-medium">{r.name}</td>
                    {(['z', 'm'] as const).map((f) => (
                      <td key={f} className="px-3 py-1.5">
                        <Input
                          aria-label={`${r.name}: ${f === 'z' ? t('targetZiyadah') : t('targetMurajaah')}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="w-32"
                          value={values[r.studentId]?.[f] ?? ''}
                          onChange={(e) =>
                            setValues((v) => ({
                              ...v,
                              [r.studentId]: {
                                z: v[r.studentId]?.z ?? '',
                                m: v[r.studentId]?.m ?? '',
                                [f]: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t p-3">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" /> {t('saveTargets')}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

export function SettingsView() {
  const t = useTranslations('tahfidz');
  return (
    <PageBody className="gap-10">
      <TahfidzBanner>
        <PageHeader title={t('settingsTitle')} description={t('ibadahSubtitle')} />
      </TahfidzBanner>
      <ItemsSection />
      <TargetsSection />
    </PageBody>
  );
}
