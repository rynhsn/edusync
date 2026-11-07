'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
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
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import {
  FieldError,
  type FormValidation,
  TOUCH_INPUT,
  TOUCH_SELECT,
  useFormValidation,
} from '@/components/form-field-error';
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
import { Textarea } from '@/components/ui/textarea';
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
import { STUDENT_ORDER, type StudentField, validateStudent } from '@/lib/form-validation';
import { GuardiansPanel } from './guardians-panel';
import { StudentCards } from './student-cards';
import { exportStudentsExcel } from './student-export';
import { StudentPhotoField } from './student-photo';

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

const RELIGIONS = ['islam', 'christian', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const;
type Religion = (typeof RELIGIONS)[number];

interface Draft {
  name: string;
  nis: string;
  nisn: string;
  nik: string;
  gender: 'L' | 'P';
  birthPlace: string;
  birthDate: string;
  religion: Religion | '';
  address: string;
  phone: string;
  email: string;
  status: Status;
  classId: string;
}
const EMPTY: Draft = {
  name: '',
  nis: '',
  nisn: '',
  nik: '',
  gender: 'L',
  birthPlace: '',
  birthDate: '',
  religion: '',
  address: '',
  phone: '',
  email: '',
  status: 'active',
  classId: '',
};

const clean = (d: Draft) => ({
  name: d.name,
  nis: d.nis.trim() || null,
  nisn: d.nisn.trim() || null,
  nik: d.nik.trim(),
  gender: d.gender,
  birthPlace: d.birthPlace.trim(),
  birthDate: d.birthDate || null,
  religion: d.religion || null,
  address: d.address.trim(),
  phone: d.phone.trim(),
  email: d.email.trim(),
  status: d.status,
});

function StudentFields({
  idPrefix,
  draft,
  classes,
  onChange,
  v,
}: {
  idPrefix: string;
  draft: Draft;
  classes: { id: string; name: string }[];
  onChange: (d: Draft) => void;
  /** Validasi galat-merah; id isian = `${idPrefix}-${field}`. */
  v: FormValidation<StudentField>;
}) {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const tc = useTranslations('common');
  const f = (k: keyof Draft) => `${idPrefix}-${k}`;
  const thisYear = new Date().getFullYear();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('name')}>{tm('name')}</Label>
        <Input
          {...v.fieldProps('name')}
          className={TOUCH_INPUT}
          aria-required="true"
          autoComplete="off"
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <FieldError id={f('name')} issue={v.issue('name')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('nis')}>{t('nis')}</Label>
        <Input
          {...v.fieldProps('nis')}
          className={TOUCH_INPUT}
          maxLength={30}
          value={draft.nis}
          onChange={(e) => onChange({ ...draft, nis: e.target.value })}
        />
        <FieldError id={f('nis')} issue={v.issue('nis')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('nisn')}>{t('nisn')}</Label>
        <Input
          {...v.fieldProps('nisn')}
          className={TOUCH_INPUT}
          maxLength={30}
          value={draft.nisn}
          onChange={(e) => onChange({ ...draft, nisn: e.target.value })}
        />
        <FieldError id={f('nisn')} issue={v.issue('nisn')} />
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('nik')}>{t('nik')}</Label>
        <Input
          {...v.fieldProps('nik')}
          className={TOUCH_INPUT}
          inputMode="numeric"
          maxLength={16}
          value={draft.nik}
          onChange={(e) => onChange({ ...draft, nik: e.target.value.replace(/\D/g, '') })}
        />
        <FieldError id={f('nik')} issue={v.issue('nik')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('gender')}>{t('gender')}</Label>
        <SelectField
          id={f('gender')}
          className={TOUCH_SELECT}
          value={draft.gender}
          onChange={(e) => onChange({ ...draft, gender: e.target.value as 'L' | 'P' })}
        >
          <option value="L">{t('male')}</option>
          <option value="P">{t('female')}</option>
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('birthPlace')}>{t('birthPlace')}</Label>
        <Input
          {...v.fieldProps('birthPlace')}
          className={TOUCH_INPUT}
          maxLength={80}
          value={draft.birthPlace}
          onChange={(e) => onChange({ ...draft, birthPlace: e.target.value })}
        />
        <FieldError id={f('birthPlace')} issue={v.issue('birthPlace')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('birthDate')}>{t('birthDate')}</Label>
        <DatePicker
          {...v.fieldProps('birthDate')}
          className={TOUCH_INPUT}
          value={draft.birthDate}
          onChange={(date) => {
            onChange({ ...draft, birthDate: date });
            v.touch('birthDate');
          }}
          clearable
          yearRange={{ from: thisYear - 40, to: thisYear }}
        />
        <FieldError id={f('birthDate')} issue={v.issue('birthDate')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('religion')}>{t('religion')}</Label>
        <SelectField
          id={f('religion')}
          className={TOUCH_SELECT}
          value={draft.religion}
          onChange={(e) => onChange({ ...draft, religion: e.target.value as Religion | '' })}
        >
          <option value="">{t('noReligion')}</option>
          {RELIGIONS.map((r) => (
            <option key={r} value={r}>
              {t(`religions.${r}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('status')}>{t('status')}</Label>
        <SelectField
          id={f('status')}
          className={TOUCH_SELECT}
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
        <div className="grid content-start gap-2">
          <Label htmlFor={f('classId')}>{t('class')}</Label>
          <SelectField
            id={f('classId')}
            className={TOUCH_SELECT}
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
      <p className="font-heading border-t pt-4 text-sm font-semibold sm:col-span-2">{t('contactTitle')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('phone')}>{t('phone')}</Label>
        <Input
          {...v.fieldProps('phone')}
          className={TOUCH_INPUT}
          inputMode="tel"
          autoComplete="off"
          maxLength={30}
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
        />
        <FieldError id={f('phone')} issue={v.issue('phone')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('email')}>{t('email')}</Label>
        <Input
          {...v.fieldProps('email')}
          className={TOUCH_INPUT}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={254}
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
        />
        <FieldError id={f('email')} issue={v.issue('email')} />
      </div>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{t('contactHint')}</p>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{tc('loginIdentityHint')}</p>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('address')}>{t('address')}</Label>
        <Textarea
          {...v.fieldProps('address')}
          rows={2}
          maxLength={300}
          value={draft.address}
          onChange={(e) => onChange({ ...draft, address: e.target.value })}
        />
        <FieldError id={f('address')} issue={v.issue('address')} />
      </div>
    </div>
  );
}

export function StudentsView() {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const tg = useTranslations('guardians');
  const tc = useTranslations('gate');
  const te = useTranslations();
  const { school, can, hasModule } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');

  const [q, setQ] = useState('');
  // Pencarian topbar membuka halaman ini dengan ?q=<nama>; isi kolom cari mengikuti alamat.
  const urlQuery = useSearchParams().get('q') ?? '';
  useEffect(() => {
    if (!urlQuery) return;
    setQ(urlQuery.slice(0, 80));
    setPage(0);
  }, [urlQuery]);
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string; originalClassId: string } & Draft) | null>(null);
  // Hanya satu dialog isian yang terbuka pada satu waktu: satu penanda validasi untuk tambah dan ubah.
  const formValues = editing ?? draft;
  const validation = useFormValidation<StudentField>({
    errors: validateStudent(formValues),
    order: STUDENT_ORDER,
    idPrefix: editing ? 'edit' : 'new',
  });
  const [guardiansFor, setGuardiansFor] = useState<{ id: string; name: string } | null>(null);
  const [cardsFor, setCardsFor] = useState<{ id: string; name: string } | null>(null);
  // Kartu RFID: modul absensi + izin konfigurasi absensi. QR identitas: tidak terikat modul, cukup izin kelola siswa.
  const rfidAllowed = hasModule('attendance') && can('attendance:configure');
  const cardsAllowed = rfidAllowed || manage;
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

  /** Ekspor hasil pencarian dan saringan yang sedang tampil (semua halaman), lengkap dengan data diri dan wali; bisa diimpor ulang. */
  async function exportExcel() {
    setExporting(true);
    try {
      const done = await exportStudentsExcel({
        schoolId: school.schoolId,
        schoolSlug: school.schoolSlug,
        query: {
          ...(q.trim() ? { q: q.trim() } : {}),
          ...(classFilter ? { classId: classFilter } : {}),
          ...(statusFilter ? { status: statusFilter as Status } : {}),
        },
      });
      if (done === 'empty') toast.info(tm('exportEmpty'));
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
    validation.reset();
    setEditing({
      id: s.id,
      originalClassId: s.classId ?? '',
      name: s.name,
      nis: s.nis ?? '',
      nisn: s.nisn ?? '',
      gender: s.gender,
      birthDate: s.birthDate ?? '',
      nik: s.nik ?? '',
      birthPlace: s.birthPlace ?? '',
      religion: s.religion ?? '',
      address: s.address ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
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
      validation={validation}
      onOpenChange={() => {
        setDraft(EMPTY);
        setError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <StudentFields idPrefix="new" draft={draft} classes={classList} onChange={setDraft} v={validation} />
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
          <EmptyState
            icon={GraduationCap}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            first={te('emptyState.pages.students')}
            canAct={manage}
            action={
              <>
                {addButton}
                <Button variant="outline" nativeButton={false} render={<Link href="/students/import" />}>
                  <Upload className="size-4" /> {t('importLink')}
                </Button>
              </>
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
                ...(cardsAllowed
                  ? [
                      {
                        label: tc('studentCardsTitle'),
                        icon: CreditCard,
                        onSelect: () => setCardsFor({ id: s.id, name: s.name }),
                      },
                    ]
                  : []),
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
        validation={validation}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <div className="grid gap-4">
            <StudentPhotoField studentId={editing.id} />
            <StudentFields
              idPrefix="edit"
              draft={editing}
              classes={classList}
              onChange={(d) => setEditing({ ...editing, ...d })}
              v={validation}
            />
          </div>
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

      <Dialog open={!!cardsFor} onOpenChange={(open) => !open && setCardsFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {tc('studentCardsTitle')} · {cardsFor?.name}
            </DialogTitle>
          </DialogHeader>
          {cardsFor && (
            <StudentCards studentId={cardsFor.id} name={cardsFor.name} rfid={rfidAllowed} qr={manage} />
          )}
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
