'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import {
  ConfirmDelete,
  DataRows,
  ListSkeleton,
  MonoText,
  REVEAL,
  RowMenu,
  SearchBox,
} from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  type Tone,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';
import { GuardiansPanel } from './guardians-panel';

const PAGE = 25;
const STATUSES = ['active', 'graduated', 'transferred', 'dropped'] as const;
type Status = (typeof STATUSES)[number];
const STATUS_TONE: Record<Status, Tone> = {
  active: 'emerald',
  graduated: 'sky',
  transferred: 'amber',
  dropped: 'slate',
};
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
  const thisYear = new Date().getFullYear();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
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
        <SelectField
          id={f('gender')}
          value={draft.gender}
          onChange={(e) => onChange({ ...draft, gender: e.target.value as 'L' | 'P' })}
        >
          <option value="L">{t('male')}</option>
          <option value="P">{t('female')}</option>
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('birthDate')}>{t('birthDate')}</Label>
        <DatePicker
          id={f('birthDate')}
          value={draft.birthDate}
          onChange={(v) => onChange({ ...draft, birthDate: v })}
          clearable
          yearRange={{ from: thisYear - 40, to: thisYear }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={f('status')}>{t('status')}</Label>
        <SelectField
          id={f('status')}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Status })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </SelectField>
      </div>
      {classes.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor={f('classId')}>{t('class')}</Label>
          <SelectField
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
          </SelectField>
        </div>
      )}
    </div>
  );
}

export function StudentsView() {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const tg = useTranslations('guardians');
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
  const [guardiansFor, setGuardiansFor] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

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
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
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

  /** Ekspor hasil pencarian dan saringan yang sedang tampil (semua halaman), dengan judul kolom yang sama dengan templat impor. */
  async function exportExcel() {
    setExporting(true);
    try {
      const all: NonNullable<typeof list.data>['items'] = [];
      for (let offset = 0; ; offset += 100) {
        const chunk = unwrap(
          await api.GET('/v1/students', { params: { ...header, query: { ...query, limit: 100, offset } } }),
        );
        all.push(...chunk.items);
        if (all.length >= chunk.total || chunk.items.length === 0) break;
      }
      if (all.length === 0) return void toast.info(tm('exportEmpty'));
      const blob = await buildExport(
        'Siswa',
        ['Nama', 'NIS', 'NISN', 'Jenis Kelamin', 'Tanggal Lahir', 'Kelas', 'Status'],
        all.map((x) => [x.name, x.nis, x.nisn, x.gender, x.birthDate, x.className, t(STATUS_KEY[x.status])]),
        { textColumns: [2, 3], widths: [30, 14, 16, 16, 16, 14, 14] },
      );
      saveBlob(blob, `siswa-${school.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error(tm('exportError'));
    } finally {
      setExporting(false);
    }
  }

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  // Ringkasan: dua kueri ringan (limit 1) hanya untuk membaca `total`, ditambah data kelas yang sudah dimuat.
  const statAll = useQuery({
    queryKey: ['students', school.schoolId, 'stat', 'all'],
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { limit: 1 } } })),
  });
  const statActive = useQuery({
    queryKey: ['students', school.schoolId, 'stat', 'active'],
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { status: 'active', limit: 1 } } })),
  });
  const allCount = statAll.data?.total;
  const activeCount = statActive.data?.total;
  const placed = classList.reduce((n, c) => n + c.studentCount, 0);
  const unplaced = activeCount !== undefined && classes.data ? Math.max(0, activeCount - placed) : undefined;
  const levels = new Map<string, number>();
  for (const c of classList) levels.set(c.level, (levels.get(c.level) ?? 0) + c.studentCount);
  const levelText = [...levels.entries()].map(([lv, n]) => `${lv}: ${n}`).join(' · ');
  const hasFilters = !!(q.trim() || classFilter || statusFilter);
  const activePercent = allCount ? Math.round(((activeCount ?? 0) / allCount) * 100) : 0;

  const openEdit = (s: NonNullable<typeof list.data>['items'][number]) => {
    setError(null);
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
    });
  };

  const addButton = (
    <FormDialog
      size="wide"
      trigger={
        <Button>
          <Plus className="size-4" /> {t('addTitle')}
        </Button>
      }
      title={t('addTitle')}
      submitLabel={tm('add')}
      error={error}
      onOpenChange={() => {
        setDraft(EMPTY);
        setError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <StudentFields idPrefix="new" draft={draft} classes={classList} onChange={setDraft} />
    </FormDialog>
  );

  return (
    <PageBody>
      <PageHeader
        icon={GraduationCap}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            <Button variant="outline" disabled={exporting} onClick={exportExcel}>
              <Download className="size-4" /> {exporting ? tm('exporting') : tm('export')}
            </Button>
            {manage && (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href="/students/import" />}>
                  <Upload className="size-4" /> {t('importLink')}
                </Button>
                {addButton}
              </>
            )}
          </>
        }
      />

      <StatGrid className={REVEAL}>
        <StatCard
          icon={Users}
          tone="teal"
          label={t('statTotal')}
          value={allCount ?? '…'}
          hint={t('statTotalHint')}
        />
        <StatCard
          icon={UserCheck}
          tone="emerald"
          label={t('statActive')}
          value={activeCount ?? '…'}
          progress={activePercent}
          hint={allCount ? t('statActiveHint', { percent: activePercent }) : undefined}
        />
        <StatCard
          icon={UserMinus}
          tone="amber"
          label={t('statNoClass')}
          value={unplaced ?? '…'}
          hint={t('statNoClassHint')}
        />
        <StatCard
          icon={Layers}
          tone="violet"
          label={t('statLevels')}
          value={classes.data ? levels.size : '…'}
          hint={levelText || t('statLevelsEmpty')}
        />
      </StatGrid>

      <Toolbar>
        <SearchBox
          value={q}
          placeholder={t('searchPlaceholder')}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
        />
        {classList.length > 0 && (
          <SelectField
            aria-label={t('class')}
            className="sm:w-44"
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
          </SelectField>
        )}
        <SelectField
          aria-label={t('status')}
          className="sm:w-44"
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
        </SelectField>
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: total })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={6} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.items.length === 0 &&
        (hasFilters ? (
          <EmptyPanel
            icon={Users}
            tone={MODULE_TONE.master}
            title={t('emptyFilteredTitle')}
            body={t('emptyFilteredBody')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  setClassFilter('');
                  setStatusFilter('');
                  setPage(0);
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyPanel
            icon={GraduationCap}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={manage ? t('emptyBody') : tm('empty')}
            action={
              manage && (
                <div className="flex flex-wrap justify-center gap-2">
                  {addButton}
                  <Button variant="outline" nativeButton={false} render={<Link href="/students/import" />}>
                    <Upload className="size-4" /> {t('importLink')}
                  </Button>
                </div>
              )
            }
          />
        ))}

      {list.data && list.data.items.length > 0 && (
        <DataRows
          rows={list.data.items}
          rowKey={(s) => s.id}
          actionsHeader={tm('actions')}
          onRowClick={manage ? openEdit : (s) => setGuardiansFor({ id: s.id, name: s.name })}
          columns={[
            {
              key: 'name',
              header: tm('name'),
              cell: (s) => <PersonCell name={s.name} sub={s.gender === 'L' ? t('male') : t('female')} />,
            },
            {
              key: 'nis',
              header: `${t('nis')} / ${t('nisn')}`,
              cell: (s) => <MonoText>{[s.nis, s.nisn].filter(Boolean).join(' / ') || tm('none')}</MonoText>,
            },
            {
              key: 'class',
              header: t('class'),
              cell: (s) =>
                s.className ? (
                  <ToneBadge tone="sky" dot={false}>
                    {s.className}
                  </ToneBadge>
                ) : (
                  <span className="text-muted-foreground text-xs">{t('noClass')}</span>
                ),
            },
            {
              key: 'status',
              header: t('status'),
              cell: (s) => <ToneBadge tone={STATUS_TONE[s.status]}>{t(STATUS_KEY[s.status])}</ToneBadge>,
            },
          ]}
          actions={(s) => (
            <RowMenu
              label={tm('actionsFor', { name: s.name })}
              actions={[
                {
                  label: tg('button'),
                  icon: Users,
                  onSelect: () => setGuardiansFor({ id: s.id, name: s.name }),
                },
                ...(manage
                  ? [
                      { label: tm('edit'), icon: Pencil, onSelect: () => openEdit(s) },
                      {
                        label: tm('delete'),
                        icon: Trash2,
                        destructive: true,
                        separated: true,
                        onSelect: () => setDeleting({ id: s.id, name: s.name }),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        />
      )}

      {list.data && pages > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('prev')}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            {t('next')}
          </Button>
        </div>
      )}

      <ConfirmDelete
        name={deleting?.name ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />

      <FormDialog
        size="wide"
        open={!!editing}
        title={tm('edit')}
        submitLabel={tm('save')}
        error={error}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <StudentFields
            idPrefix="edit"
            draft={editing}
            classes={classList}
            onChange={(d) => setEditing({ ...editing, ...d })}
          />
        )}
      </FormDialog>

      <Dialog open={!!guardiansFor} onOpenChange={(open) => !open && setGuardiansFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {tg('title')} · {guardiansFor?.name}
            </DialogTitle>
          </DialogHeader>
          {guardiansFor && <GuardiansPanel studentId={guardiansFor.id} />}
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
