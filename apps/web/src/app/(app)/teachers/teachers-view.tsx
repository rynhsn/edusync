'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  KeyRound,
  Link2,
  Mail,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { CompletenessBadge } from '@/components/completeness-badge';
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
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { countMissingNik, hasNik } from '@/lib/data-completeness';
import { errorKey } from '@/lib/errors';
import { TEACHER_ORDER, type TeacherField, validateTeacher } from '@/lib/form-validation';
import { buildExport, saveBlob } from '@/lib/sheet';
import {
  TEACHER_ACCOUNT_ORDER,
  type TeacherAccountField,
  validateTeacherAccount,
} from './teacher-account-validation';

const RELIGIONS = ['islam', 'christian', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const;
type Religion = (typeof RELIGIONS)[number];

interface Draft {
  name: string;
  nip: string;
  nik: string;
  gender: 'L' | 'P' | '';
  birthPlace: string;
  birthDate: string;
  religion: Religion | '';
  education: string;
  status: 'active' | 'inactive';
  phone: string;
  email: string;
  address: string;
}
const EMPTY: Draft = {
  name: '',
  nip: '',
  nik: '',
  gender: '',
  birthPlace: '',
  birthDate: '',
  religion: '',
  education: '',
  status: 'active',
  phone: '',
  email: '',
  address: '',
};

/** Badan permintaan API: PUT mengganti semua isian, jadi selalu kirim seluruhnya. */
const toBody = (d: Draft) => ({
  name: d.name,
  nip: d.nip.trim() || null,
  status: d.status,
  nik: d.nik.trim() || null,
  phone: d.phone.trim() || null,
  email: d.email.trim() || null,
  gender: d.gender || null,
  birthPlace: d.birthPlace.trim() || null,
  birthDate: d.birthDate || null,
  address: d.address.trim() || null,
  religion: d.religion || null,
  education: d.education.trim() || null,
});

function TeacherFields({
  idPrefix,
  draft,
  onChange,
  v,
  nikPlaceholder,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** Validasi galat-merah; id isian = `${idPrefix}-${field}`. */
  v: FormValidation<TeacherField>;
  /** NIK tersamar sebagai petunjuk bila NIK utuh tidak dikirim server. */
  nikPlaceholder?: string | null;
}) {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  const ts = useTranslations('students');
  const tc = useTranslations('common');
  const thisYear = new Date().getFullYear();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="font-heading text-sm font-semibold sm:col-span-2">{tc('sectionIdentity')}</p>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          {...v.fieldProps('name')}
          className={TOUCH_INPUT}
          aria-required="true"
          autoComplete="off"
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <FieldError id={v.idOf('name')} issue={v.issue('name')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-nip`}>{t('nip')}</Label>
        <Input
          {...v.fieldProps('nip')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={30}
          value={draft.nip}
          onChange={(e) => onChange({ ...draft, nip: e.target.value })}
        />
        <FieldError id={v.idOf('nip')} issue={v.issue('nip')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-nik`}>{t('nik')}</Label>
        <Input
          {...v.fieldProps('nik')}
          className={TOUCH_INPUT}
          inputMode="numeric"
          autoComplete="off"
          maxLength={16}
          placeholder={nikPlaceholder ?? undefined}
          value={draft.nik}
          onChange={(e) => onChange({ ...draft, nik: e.target.value.replace(/\D/g, '') })}
        />
        <FieldError id={v.idOf('nik')} issue={v.issue('nik')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-gender`}>{ts('gender')}</Label>
        <SelectField
          id={`${idPrefix}-gender`}
          className={TOUCH_SELECT}
          value={draft.gender}
          onChange={(e) => onChange({ ...draft, gender: e.target.value as Draft['gender'] })}
        >
          <option value="">{ts('noReligion')}</option>
          <option value="L">{ts('male')}</option>
          <option value="P">{ts('female')}</option>
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-religion`}>{ts('religion')}</Label>
        <SelectField
          id={`${idPrefix}-religion`}
          className={TOUCH_SELECT}
          value={draft.religion}
          onChange={(e) => onChange({ ...draft, religion: e.target.value as Religion | '' })}
        >
          <option value="">{ts('noReligion')}</option>
          {RELIGIONS.map((r) => (
            <option key={r} value={r}>
              {ts(`religions.${r}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-birthPlace`}>{ts('birthPlace')}</Label>
        <Input
          {...v.fieldProps('birthPlace')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={80}
          value={draft.birthPlace}
          onChange={(e) => onChange({ ...draft, birthPlace: e.target.value })}
        />
        <FieldError id={v.idOf('birthPlace')} issue={v.issue('birthPlace')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-birthDate`}>{ts('birthDate')}</Label>
        <DatePicker
          {...v.fieldProps('birthDate')}
          className={TOUCH_INPUT}
          value={draft.birthDate}
          onChange={(date) => {
            onChange({ ...draft, birthDate: date });
            v.touch('birthDate');
          }}
          clearable
          yearRange={{ from: thisYear - 80, to: thisYear }}
        />
        <FieldError id={v.idOf('birthDate')} issue={v.issue('birthDate')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-education`}>{t('education')}</Label>
        <Input
          {...v.fieldProps('education')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={120}
          placeholder={t('educationHint')}
          value={draft.education}
          onChange={(e) => onChange({ ...draft, education: e.target.value })}
        />
        <FieldError id={v.idOf('education')} issue={v.issue('education')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-status`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-status`}
          className={TOUCH_SELECT}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Draft['status'] })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
      <p className="font-heading border-t pt-4 text-sm font-semibold sm:col-span-2">{tc('sectionContact')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-phone`}>{t('phone')}</Label>
        <Input
          {...v.fieldProps('phone')}
          className={TOUCH_INPUT}
          inputMode="tel"
          autoComplete="off"
          maxLength={30}
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
        />
        <FieldError id={v.idOf('phone')} issue={v.issue('phone')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-email`}>{t('email')}</Label>
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
        <FieldError id={v.idOf('email')} issue={v.issue('email')} />
      </div>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{t('contactHint')}</p>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{tc('loginIdentityHint')}</p>
      <p className="font-heading border-t pt-4 text-sm font-semibold sm:col-span-2">{tc('sectionAddress')}</p>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>{t('address')}</Label>
        <Textarea
          {...v.fieldProps('address')}
          rows={2}
          maxLength={300}
          value={draft.address}
          onChange={(e) => onChange({ ...draft, address: e.target.value })}
        />
        <FieldError id={v.idOf('address')} issue={v.issue('address')} />
      </div>
    </div>
  );
}

export function TeachersView() {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const tc = useTranslations('common');
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('teacher:manage');
  const manageAccount = manage && can('member:manage');

  const [q, setQ] = useState('');
  // Pencarian topbar membuka halaman ini dengan ?q=<nama>; isi kolom cari mengikuti alamat.
  const urlQuery = useSearchParams().get('q') ?? '';
  useEffect(() => {
    if (urlQuery) setQ(urlQuery.slice(0, 80));
  }, [urlQuery]);
  const [statusFilter, setStatusFilter] = useState('');
  const [missingNikOnly, setMissingNikOnly] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string; nikMasked: string | null } & Draft) | null>(null);
  const validation = useFormValidation<TeacherField>({
    errors: validateTeacher(editing ?? draft),
    order: TEACHER_ORDER,
    idPrefix: editing ? 'edit' : 'new',
  });
  const [account, setAccount] = useState<{ id: string; name: string; memberId: string | null } | null>(null);
  const [mode, setMode] = useState<'link' | 'invite'>('link');
  const [pick, setPick] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const accountValidation = useFormValidation<TeacherAccountField>({
    errors: account?.memberId ? {} : validateTeacherAccount(mode, pick, inviteEmail),
    order: TEACHER_ACCOUNT_ORDER,
    idPrefix: 'acc',
  });

  const list = useQuery({
    queryKey: ['teachers', school.schoolId, q],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/teachers', { params: { ...header, query: q.trim() ? { q: q.trim() } : {} } }),
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers', school.schoolId] });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/teachers', { params: header, body: toBody(draft) })),
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
        await api.PUT('/v1/teachers/{id}', {
          params: { ...header, path: { id: v.id } },
          body: toBody(v),
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
      unwrap(await api.DELETE('/v1/teachers/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const members = useQuery({
    queryKey: ['members', school.schoolId],
    enabled: manageAccount,
    queryFn: async () => unwrap(await api.GET('/v1/members', { params: header })),
  });
  const invitations = useQuery({
    queryKey: ['invitations', school.schoolId],
    enabled: manageAccount,
    queryFn: async () => unwrap(await api.GET('/v1/invitations', { params: header })),
  });
  const accountDone = (message: string) => {
    toast.success(message);
    setAccount(null);
    refresh();
    queryClient.invalidateQueries({ queryKey: ['invitations', school.schoolId] });
  };
  const linkAccount = useMutation({
    mutationFn: async (v: { id: string; memberId: string | null }) =>
      unwrap(
        await api.PUT('/v1/teachers/{id}/account', {
          params: { ...header, path: { id: v.id } },
          body: { memberId: v.memberId },
        }),
      ),
    onSuccess: (_d, v) => accountDone(v.memberId ? t('linkedOk') : t('unlinkedOk')),
    onError: (e) => setAccountError(te(errorKey(e))),
  });
  const inviteTeacher = useMutation({
    mutationFn: async (v: { id: string; email: string }) =>
      unwrap(
        await api.POST('/v1/invitations', {
          params: header,
          body: { email: v.email.trim(), roles: ['teacher'], teacherId: v.id },
        }),
      ),
    onSuccess: () => accountDone(t('inviteOk')),
    onError: (e) => setAccountError(te(errorKey(e))),
  });

  async function exportExcel() {
    const rows = list.data ?? [];
    if (rows.length === 0) return void toast.info(tm('exportEmpty'));
    const blob = await buildExport(
      'Guru',
      ['Nama', 'NIP', 'Status'],
      rows.map((r) => [r.name, r.nip, r.status === 'active' ? t('active') : t('inactive')]),
      { textColumns: [2], widths: [30, 24, 14] },
    );
    saveBlob(blob, `guru-${school.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Ringkasan memakai daftar tanpa saringan (kunci yang sama dengan pemilih guru di halaman kelas).
  const all = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  const allRows = all.data ?? [];
  const activeCount = allRows.filter((r) => r.status === 'active').length;
  const linkedCount = allRows.filter((r) => r.memberId).length;
  const linkedMemberIds = new Set(allRows.map((r) => r.memberId));
  const freeMembers = (members.data ?? []).filter((m) => m.status === 'active' && !linkedMemberIds.has(m.id));
  const now = Date.now();
  const invitedFor = (teacherId: string) =>
    (invitations.data ?? []).find((i) => i.teacherId === teacherId && new Date(i.expiresAt).getTime() > now);
  const linkedMember = (memberId: string | null) => (members.data ?? []).find((m) => m.id === memberId);
  const openAccount = (r: { id: string; name: string; memberId: string | null }) => {
    setAccountError(null);
    setMode('link');
    setPick('');
    setInviteEmail('');
    setAccount({ id: r.id, name: r.name, memberId: r.memberId });
  };
  const activePercent = allRows.length ? Math.round((activeCount / allRows.length) * 100) : 0;
  const missingNikTotal = countMissingNik(allRows);
  const rows = (list.data ?? []).filter(
    (r) => (!statusFilter || r.status === statusFilter) && (!missingNikOnly || !hasNik(r)),
  );
  const hasFilters = !!(q.trim() || statusFilter || missingNikOnly);

  const openEdit = (r: NonNullable<typeof list.data>[number]) => {
    setError(null);
    validation.reset();
    setEditing({
      id: r.id,
      // NIK utuh hanya dikirim ke pengelola; bila null jangan diisi dari bentuk tersamar.
      nikMasked: r.nikMasked,
      name: r.name,
      nip: r.nip ?? '',
      nik: r.nik ?? '',
      gender: r.gender ?? '',
      birthPlace: r.birthPlace ?? '',
      birthDate: r.birthDate ?? '',
      religion: r.religion ?? '',
      education: r.education ?? '',
      status: r.status,
      phone: r.phone ?? '',
      email: r.email ?? '',
      address: r.address ?? '',
    });
  };

  const addButton = (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" /> {t('addTitle')}
        </Button>
      }
      size="wide"
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
      <TeacherFields idPrefix="new" draft={draft} onChange={setDraft} v={validation} />
    </FormDialog>
  );

  return (
    <PageBody>
      <PageHeader
        icon={Presentation}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={[
          manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`,
          all.data && missingNikTotal > 0 ? tc('nikMissingCount', { count: missingNikTotal }) : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="size-4" /> {tm('export')}
            </Button>
            {manage && (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href="/teachers/import" />}>
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
          value={all.data ? allRows.length : '…'}
          hint={t('statTotalHint')}
        />
        <StatCard
          icon={UserCheck}
          tone="emerald"
          label={t('active')}
          value={all.data ? activeCount : '…'}
          progress={activePercent}
          hint={all.data ? t('statActiveHint', { percent: activePercent }) : undefined}
        />
        <StatCard
          icon={UserX}
          tone="slate"
          label={t('inactive')}
          value={all.data ? allRows.length - activeCount : '…'}
          hint={t('statInactiveHint')}
        />
        <StatCard
          icon={KeyRound}
          tone="sky"
          label={t('statLinked')}
          value={all.data ? linkedCount : '…'}
          hint={t('statLinkedHint')}
        />
      </StatGrid>

      <Toolbar>
        <SearchBox value={q} placeholder={t('searchPlaceholder')} onChange={setQ} />
        <SelectField
          aria-label={t('status')}
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('allStatus')}</option>
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
        <Button
          type="button"
          variant={missingNikOnly ? 'default' : 'outline'}
          aria-pressed={missingNikOnly}
          onClick={() => setMissingNikOnly(!missingNikOnly)}
        >
          {tc('filterNikMissing')}
        </Button>
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: rows.length })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={6} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data &&
        rows.length === 0 &&
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
                  setStatusFilter('');
                  setMissingNikOnly(false);
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Presentation}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            first={te('emptyState.pages.teachers')}
            canAct={manage}
            action={
              <>
                {addButton}
                <Button variant="outline" nativeButton={false} render={<Link href="/teachers/import" />}>
                  <Upload className="size-4" /> {t('importLink')}
                </Button>
              </>
            }
          />
        ))}

      {rows.length > 0 && (
        <DataRows
          rows={rows}
          rowKey={(r) => r.id}
          actionsHeader={tm('actions')}
          onRowClick={manage ? openEdit : undefined}
          columns={[
            {
              key: 'name',
              header: tm('name'),
              cell: (r) => (
                <PersonCell
                  name={r.name}
                  sub={r.memberId ? t('hasAccount') : invitedFor(r.id) ? t('invited') : t('noAccount')}
                />
              ),
            },
            { key: 'nip', header: t('nip'), cell: (r) => <MonoText>{r.nip ?? tm('none')}</MonoText> },
            {
              key: 'nik',
              header: t('nik'),
              cell: (r) => <MonoText>{r.nik ?? r.nikMasked ?? tm('none')}</MonoText>,
            },
            {
              key: 'completeness',
              header: tc('completenessHeader'),
              cell: (r) => <CompletenessBadge person={r} />,
            },
            {
              key: 'status',
              header: t('status'),
              cell: (r) => (
                <ToneBadge tone={r.status === 'active' ? 'emerald' : 'slate'}>
                  {r.status === 'active' ? t('active') : t('inactive')}
                </ToneBadge>
              ),
            },
          ]}
          actions={
            manage
              ? (r) => (
                  <RowMenu
                    label={tm('actionsFor', { name: r.name })}
                    actions={[
                      { label: tm('edit'), icon: Pencil, onSelect: () => openEdit(r) },
                      ...(manageAccount
                        ? [{ label: t('accountAction'), icon: Link2, onSelect: () => openAccount(r) }]
                        : []),
                      {
                        label: tm('delete'),
                        icon: Trash2,
                        destructive: true,
                        separated: true,
                        onSelect: () => setDeleting({ id: r.id, name: r.name }),
                      },
                    ]}
                  />
                )
              : undefined
          }
        />
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
        open={!!account}
        title={t('accountTitle', { name: account?.name ?? '' })}
        submitLabel={account?.memberId ? t('unlink') : mode === 'link' ? t('link') : t('sendInvite')}
        validation={accountValidation}
        error={accountError}
        onOpenChange={(open) => !open && setAccount(null)}
        onSubmit={() => {
          if (!account) return Promise.resolve();
          if (account.memberId) return linkAccount.mutateAsync({ id: account.id, memberId: null });
          return mode === 'link'
            ? linkAccount.mutateAsync({ id: account.id, memberId: pick })
            : inviteTeacher.mutateAsync({ id: account.id, email: inviteEmail.trim() });
        }}
      >
        {account?.memberId ? (
          <div className="grid content-start gap-2 text-sm">
            <p>
              {t('accountLinked', {
                account: linkedMember(account.memberId)
                  ? `${linkedMember(account.memberId)?.name} (${linkedMember(account.memberId)?.email})`
                  : '…',
              })}
            </p>
            <p className="text-muted-foreground">{t('unlinkHint')}</p>
          </div>
        ) : (
          account && (
            <div className="grid gap-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'link' ? 'default' : 'outline'}
                  onClick={() => setMode('link')}
                >
                  <Link2 className="size-4" /> {t('linkExisting')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'invite' ? 'default' : 'outline'}
                  onClick={() => setMode('invite')}
                >
                  <Mail className="size-4" /> {t('inviteByEmail')}
                </Button>
              </div>
              {mode === 'link' ? (
                freeMembers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('noFreeMembers')}</p>
                ) : (
                  <div className="grid content-start gap-2">
                    <Label htmlFor={accountValidation.idOf('pick')}>{t('pickMember')}</Label>
                    <SelectField
                      {...accountValidation.fieldProps('pick')}
                      className={TOUCH_SELECT}
                      value={pick}
                      onChange={(e) => setPick(e.target.value)}
                    >
                      <option value="">{t('pickPlaceholder')}</option>
                      {freeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </SelectField>
                    <FieldError id={accountValidation.idOf('pick')} issue={accountValidation.issue('pick')} />
                  </div>
                )
              ) : (
                <div className="grid content-start gap-2">
                  <Label htmlFor={accountValidation.idOf('email')}>{t('inviteEmail')}</Label>
                  <Input
                    {...accountValidation.fieldProps('email')}
                    className={TOUCH_INPUT}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    aria-required="true"
                    maxLength={254}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <FieldError id={accountValidation.idOf('email')} issue={accountValidation.issue('email')} />
                  <p className="text-muted-foreground text-xs">{t('inviteHint')}</p>
                  {invitedFor(account.id) && (
                    <p className="text-xs text-amber-600">
                      {t('inviteSent', { email: invitedFor(account.id)?.email ?? '' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </FormDialog>

      <FormDialog
        open={!!editing}
        title={tm('edit')}
        submitLabel={tm('save')}
        error={error}
        size="wide"
        validation={validation}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <TeacherFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, nikMasked: editing.nikMasked, ...d })}
            v={validation}
            nikPlaceholder={editing.nik ? null : editing.nikMasked}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
