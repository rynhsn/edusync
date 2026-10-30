'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookHeart, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { fmtPercent, GeoPattern, ProgressRing, STALE_DAYS, TahfidzBanner } from './shared';

interface Draft {
  name: string;
  mentorTeacherId: string;
  scheduleNote: string;
  active: boolean;
}
const EMPTY: Draft = { name: '', mentorTeacherId: '', scheduleNote: '', active: true };

/** Isian halaqah (dipakai dialog tambah dan ubah). */
function HalaqahFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('tahfidz');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{t('halaqahName')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-mentor`}>{t('mentor')}</Label>
        <SelectField
          id={`${idPrefix}-mentor`}
          value={draft.mentorTeacherId}
          onChange={(e) => onChange({ ...draft, mentorTeacherId: e.target.value })}
        >
          <option value="">{t('noMentor')}</option>
          {teachers.data
            ?.filter((x) => x.status === 'active' || x.id === draft.mentorTeacherId)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-note`}>{t('scheduleNote')}</Label>
        <Input
          id={`${idPrefix}-note`}
          maxLength={200}
          placeholder={t('scheduleNotePlaceholder')}
          value={draft.scheduleNote}
          onChange={(e) => onChange({ ...draft, scheduleNote: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-active`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-active`}
          value={draft.active ? 'active' : 'inactive'}
          onChange={(e) => onChange({ ...draft, active: e.target.value === 'active' })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

const toBody = (yearId: string, d: Draft) => ({
  academicYearId: yearId,
  name: d.name.trim(),
  mentorTeacherId: d.mentorTeacherId || null,
  scheduleNote: d.scheduleNote.trim() || null,
  active: d.active,
});

/** Ringkasan kartu: rata-rata progres anggota dan jumlah yang belum setor 7 hari atau lebih. */
function useHalaqahStats(halaqahId: string, memberCount: number) {
  const { school } = useSchool();
  const q = useQuery({
    queryKey: ['tahfidz-summary', school.schoolId, halaqahId, 'card'],
    enabled: memberCount > 0,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah/{id}/summary', {
          params: { header: schoolHeader(school.schoolId), path: { id: halaqahId }, query: {} },
        }),
      ),
  });
  const students = q.data?.students ?? [];
  const avg = students.length ? students.reduce((s, x) => s + x.percent, 0) / students.length : 0;
  const stale = students.filter((x) => x.daysSinceLast === null || x.daysSinceLast >= STALE_DAYS).length;
  return { avg, stale, ready: memberCount === 0 || q.isSuccess };
}

type HalaqahItem = NonNullable<ReturnType<typeof useHalaqahList>['data']>[number];
function useHalaqahList(yearId: string) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, yearId],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah', {
          params: { header: schoolHeader(school.schoolId), query: { academicYearId: yearId } },
        }),
      ),
  });
}

function HalaqahCard({
  h,
  index,
  manage,
  onEdit,
  onDelete,
}: {
  h: HalaqahItem;
  index: number;
  manage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('tahfidz');
  const tm = useTranslations('masterData');
  const { avg, stale, ready } = useHalaqahStats(h.id, h.memberCount);
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <Card
        className={cn(
          'group relative h-full gap-4 overflow-hidden p-5 transition-shadow hover:shadow-md',
          !h.active && 'opacity-70',
        )}
      >
        <GeoPattern className="text-chart-5 opacity-[0.05] transition-opacity group-hover:opacity-[0.1]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading truncate text-lg font-semibold">
              <Link
                href={`/tahfidz/${h.id}`}
                className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
              >
                {h.name}
              </Link>
            </h2>
            <p className="text-muted-foreground truncate text-sm">
              {h.mentorName ?? t('noMentor')}
              {h.scheduleNote ? ` · ${h.scheduleNote}` : ''}
            </p>
          </div>
          <ProgressRing percent={avg} size={64} stroke={7} label={t('avgProgress')}>
            <span className="text-sm font-semibold tabular-nums">{fmtPercent(avg)}%</span>
          </ProgressRing>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Users className="size-3" /> {t('memberCount', { count: h.memberCount })}
          </Badge>
          {!h.active && <Badge variant="outline">{t('inactive')}</Badge>}
          {ready && stale > 0 && (
            <Badge className="bg-destructive/10 text-destructive gap-1 border-transparent">
              <AlertTriangle className="size-3" /> {t('staleCount', { count: stale })}
            </Badge>
          )}
          {ready && stale === 0 && h.memberCount > 0 && (
            <Badge className="bg-chart-5/15 text-foreground border-transparent">{t('allCaughtUp')}</Badge>
          )}
        </div>
        {h.canManage && manage && (
          <div className="relative z-10 -mb-1 flex justify-end gap-1">
            <Button size="icon-sm" variant="ghost" aria-label={`${tm('edit')} ${h.name}`} onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`${tm('delete')} ${h.name}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

export function HalaqahListView() {
  const t = useTranslations('tahfidz');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('tahfidz:manage');

  const [yearChoice, setYearChoice] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const year =
    years.data?.find((y) => y.id === yearChoice) ?? years.data?.find((y) => y.isActive) ?? years.data?.[0];
  const yearId = year?.id ?? '';

  const list = useHalaqahList(yearId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tahfidz-halaqah', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/tahfidz/halaqah', { params: header, body: toBody(yearId, draft) })),
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
        await api.PUT('/v1/tahfidz/halaqah/{id}', {
          params: { ...header, path: { id: v.id } },
          body: toBody(yearId, v),
        }),
      ),
    onSuccess: () => {
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/tahfidz/halaqah/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <TahfidzBanner>
        <PageHeader
          title={t('title')}
          description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
          actions={
            <>
              <SelectField
                aria-label={t('academicYear')}
                className="bg-card w-52"
                value={yearId}
                onChange={(e) => setYearChoice(e.target.value)}
              >
                {years.data?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </SelectField>
              {manage && yearId && (
                <FormDialog
                  trigger={
                    <Button>
                      <Plus className="size-4" /> {t('newHalaqah')}
                    </Button>
                  }
                  title={t('newHalaqah')}
                  submitLabel={tm('add')}
                  error={error}
                  onOpenChange={() => {
                    setDraft(EMPTY);
                    setError(null);
                  }}
                  onSubmit={() => create.mutateAsync()}
                >
                  <HalaqahFields idPrefix="new" draft={draft} onChange={setDraft} />
                </FormDialog>
              )}
            </>
          }
        />
      </TahfidzBanner>

      {(years.isPending || list.isPending) && yearId !== '' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {(years.isError || list.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {years.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noYears')}</Card>
      )}

      {list.data && list.data.length === 0 && (
        <Card className="relative overflow-hidden px-6 py-14 text-center">
          <GeoPattern className="text-chart-5 opacity-[0.08]" />
          <div className="relative mx-auto grid max-w-sm place-items-center gap-3">
            <span className="bg-chart-5/15 text-chart-5 grid size-14 place-items-center rounded-full">
              <BookHeart className="size-7" />
            </span>
            <p className="font-heading text-lg font-semibold">{t('emptyTitle')}</p>
            <p className="text-muted-foreground text-sm">
              {manage ? t('emptyBody') : t('emptyBodyReadOnly')}
            </p>
          </div>
        </Card>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((h, i) => (
            <HalaqahCard
              key={h.id}
              h={h}
              index={i}
              manage={manage}
              onEdit={() => {
                setError(null);
                setEditing({
                  id: h.id,
                  name: h.name,
                  mentorTeacherId: h.mentorTeacherId ?? '',
                  scheduleNote: h.scheduleNote ?? '',
                  active: h.active,
                });
              }}
              onDelete={() => setDeleting({ id: h.id, name: h.name })}
            />
          ))}
        </ul>
      )}

      {editing && (
        <FormDialog
          open
          title={t('editHalaqah')}
          submitLabel={tm('save')}
          error={error}
          onOpenChange={(o) => !o && setEditing(null)}
          onSubmit={() => save.mutateAsync(editing)}
        >
          <HalaqahFields idPrefix="edit" draft={editing} onChange={(d) => setEditing({ ...editing, ...d })} />
        </FormDialog>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('deleteHalaqahTitle', { name: deleting?.name ?? '' })}
        description={t('deleteHalaqahBody')}
        confirmLabel={tm('delete')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </PageBody>
  );
}
