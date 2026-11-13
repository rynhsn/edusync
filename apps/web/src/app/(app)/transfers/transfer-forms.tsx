'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import {
  FieldError,
  type FormValidation,
  TOUCH_INPUT,
  TOUCH_SELECT,
  useFormValidation,
} from '@/components/form-field-error';
import { AlertTitle } from '@/components/ui/alert';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { STUDENT_ORDER, type StudentField, todayIso, validateStudent } from '@/lib/form-validation';
import {
  buildTransferEditBody,
  buildTransferInBody,
  buildTransferOutBody,
  EMPTY_TRANSFER,
  isFinalLevelBlock,
  LIMITS,
  reasonForKind,
  TRANSFER_KINDS,
  TRANSFER_ORDER,
  TRANSFER_REASONS,
  type TransferField,
  type TransferKind,
  type TransferValues,
  transferToValues,
  validateTransfer,
} from '@/lib/transfer';
import { clean, type Draft, EMPTY, StudentFields } from '../students/student-fields';

/** Kunci cache yang berubah setelah mutasi dicatat, diubah, atau dibatalkan. */
function useRefreshAfterTransfer() {
  const { school } = useSchool();
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['student-transfers', 'students', 'classes', 'student-history'])
      queryClient.invalidateQueries({ queryKey: [key, school.schoolId] });
  };
}

type Direction = 'in' | 'out';

/** Dialog terkendali tidak memanggil onOpenChange(true) saat dibuka induknya, jadi isian disiapkan ulang di sini. */
function useOnOpen(open: boolean, prepare: () => void) {
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) prepare();
  }
}

/** Isian kepindahan yang sama untuk mutasi keluar, masuk, dan ubah keterangan. */
function TransferFields({
  idPrefix,
  direction,
  values,
  onChange,
  v,
  showKind,
  kind,
  onKind,
  showDate = true,
}: {
  idPrefix: string;
  direction: Direction;
  values: TransferValues;
  onChange: (next: TransferValues) => void;
  v: FormValidation<TransferField>;
  showKind?: boolean;
  kind?: TransferKind;
  onKind?: (k: TransferKind) => void;
  showDate?: boolean;
}) {
  const t = useTranslations('transfers');
  const f = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showKind && kind && onKind && (
        <div className="grid content-start gap-2">
          <Label htmlFor={f('kind')}>{t('kind')}</Label>
          <SelectField
            id={f('kind')}
            className={TOUCH_SELECT}
            value={kind}
            onChange={(e) => onKind(e.target.value as TransferKind)}
          >
            {TRANSFER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'transfer' ? t('kindTransfer') : t('kindDropped')}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {showDate && (
        <div className="grid content-start gap-2">
          <Label htmlFor={f('effectiveOn')}>{t('effectiveOn')}</Label>
          <DatePicker
            {...v.fieldProps('effectiveOn')}
            className={TOUCH_INPUT}
            value={values.effectiveOn}
            onChange={(date) => {
              onChange({ ...values, effectiveOn: date });
              v.touch('effectiveOn');
            }}
          />
          <FieldError id={f('effectiveOn')} issue={v.issue('effectiveOn')} />
        </div>
      )}
      <div className="grid content-start gap-2">
        <Label htmlFor={f('reason')}>{t('reason')}</Label>
        <SelectField
          id={f('reason')}
          className={TOUCH_SELECT}
          value={values.reason}
          onChange={(e) => onChange({ ...values, reason: e.target.value as TransferValues['reason'] })}
        >
          {TRANSFER_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reasons.${r}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('reasonNote')}>{t('reasonNote')}</Label>
        <Textarea
          {...v.fieldProps('reasonNote')}
          rows={2}
          maxLength={LIMITS.reasonNote}
          value={values.reasonNote}
          onChange={(e) => onChange({ ...values, reasonNote: e.target.value })}
        />
        <FieldError id={f('reasonNote')} issue={v.issue('reasonNote')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('counterpartSchoolName')}>
          {direction === 'out' ? t('schoolOut') : t('schoolIn')}
        </Label>
        <Input
          {...v.fieldProps('counterpartSchoolName')}
          className={TOUCH_INPUT}
          maxLength={LIMITS.counterpartSchoolName}
          value={values.counterpartSchoolName}
          onChange={(e) => onChange({ ...values, counterpartSchoolName: e.target.value })}
        />
        <FieldError id={f('counterpartSchoolName')} issue={v.issue('counterpartSchoolName')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('counterpartNpsn')}>{t('npsn')}</Label>
        <Input
          {...v.fieldProps('counterpartNpsn')}
          className={TOUCH_INPUT}
          inputMode="numeric"
          maxLength={8}
          value={values.counterpartNpsn}
          onChange={(e) => onChange({ ...values, counterpartNpsn: e.target.value.replace(/\D/g, '') })}
        />
        <FieldError id={f('counterpartNpsn')} issue={v.issue('counterpartNpsn')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('letterNumber')}>{t('letterNumber')}</Label>
        <Input
          {...v.fieldProps('letterNumber')}
          className={TOUCH_INPUT}
          maxLength={LIMITS.letterNumber}
          value={values.letterNumber}
          onChange={(e) => onChange({ ...values, letterNumber: e.target.value })}
        />
        <FieldError id={f('letterNumber')} issue={v.issue('letterNumber')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('letterDate')}>{t('letterDate')}</Label>
        <DatePicker
          {...v.fieldProps('letterDate')}
          className={TOUCH_INPUT}
          value={values.letterDate}
          clearable
          onChange={(date) => {
            onChange({ ...values, letterDate: date });
            v.touch('letterDate');
          }}
        />
        <FieldError id={f('letterDate')} issue={v.issue('letterDate')} />
      </div>
    </div>
  );
}

/** Kolom "Alasan pengecualian": tampil setelah larangan semester genap tingkat akhir menolak mutasi. */
function ExceptionField({
  idPrefix,
  value,
  onChange,
  v,
}: {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  v: FormValidation<TransferField>;
}) {
  const t = useTranslations('transfers');
  return (
    <div className="grid content-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <Label htmlFor={`${idPrefix}-exceptionReason`}>{t('exceptionReason')}</Label>
      <Textarea
        {...v.fieldProps('exceptionReason')}
        rows={2}
        aria-required="true"
        maxLength={LIMITS.exceptionReason}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-muted-foreground text-xs">{t('exceptionHint')}</p>
      <FieldError id={`${idPrefix}-exceptionReason`} issue={v.issue('exceptionReason')} />
    </div>
  );
}

/** Pesan galat: larangan semester genap tingkat akhir dijelaskan; galat lain memakai terjemahan kodenya. */
function useFormError() {
  const te = useTranslations();
  const t = useTranslations('transfers');
  const { can } = useSchool();
  const canOverride = can('school:manage');
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  return {
    blocked,
    canOverride,
    /** Isian pengecualian tampil bila larangan sudah menolak dan pengguna berhak menimpanya. */
    overriding: blocked && canOverride,
    reset: () => {
      setMessage(null);
      setBlocked(false);
    },
    fail: (e: unknown) => {
      if (isFinalLevelBlock(e)) {
        setBlocked(true);
        setMessage(null);
      } else {
        setMessage(te(errorKey(e)));
      }
    },
    node: blocked ? (
      <div className="grid gap-1">
        <AlertTitle className="font-medium">{t('blockedTitle')}</AlertTitle>
        <p>{t('blockedBody')}</p>
        <p>{canOverride ? t('blockedOverride') : te('errors.exception_requires_school_manage')}</p>
      </div>
    ) : (
      message
    ),
  };
}

/** Pemilih murid aktif: kotak cari lalu daftar pilihan. */
function StudentPicker({
  idPrefix,
  value,
  onChange,
  v,
}: {
  idPrefix: string;
  value: { id: string; name: string } | null;
  onChange: (s: { id: string; name: string } | null) => void;
  v: FormValidation<TransferField>;
}) {
  const t = useTranslations('transfers');
  const { school } = useSchool();
  const [q, setQ] = useState('');
  const header = { header: schoolHeader(school.schoolId) };
  const list = useQuery({
    queryKey: ['students', school.schoolId, 'picker', q.trim()],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: { ...header, query: { ...(q.trim() ? { q: q.trim() } : {}), status: 'active', limit: 20 } },
        }),
      ),
  });
  const items = list.data?.items ?? [];
  const options =
    value && !items.some((s) => s.id === value.id) ? [{ ...value, className: null }, ...items] : items;
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <Label htmlFor={`${idPrefix}-studentSearch`}>{t('studentLabel')}</Label>
      <Input
        id={`${idPrefix}-studentSearch`}
        className={TOUCH_INPUT}
        autoComplete="off"
        placeholder={t('studentSearch')}
        aria-label={t('studentSearch')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <SelectField
        {...v.fieldProps('student')}
        className={TOUCH_SELECT}
        value={value?.id ?? ''}
        onChange={(e) => {
          const s = options.find((o) => o.id === e.target.value);
          onChange(s ? { id: s.id, name: s.name } : null);
        }}
      >
        <option value="">
          {items.length === 0 && !list.isPending ? t('studentNone') : t('studentPick')}
        </option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.className ? `${s.name} · ${s.className}` : s.name}
          </option>
        ))}
      </SelectField>
      <p className="text-muted-foreground text-xs">{t('studentHint')}</p>
      <FieldError id={`${idPrefix}-student`} issue={v.issue('student')} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** Dialog "Catat mutasi keluar". `preset` mengisi murid lebih dulu (mis. dari menu baris di halaman Siswa). */
export function TransferOutDialog({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: { id: string; name: string } | null;
}) {
  const t = useTranslations('transfers');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshAfterTransfer();
  const err = useFormError();
  const [student, setStudent] = useState<{ id: string; name: string } | null>(preset ?? null);
  const [kind, setKind] = useState<TransferKind>('transfer');
  const [values, setValues] = useState<TransferValues>({ ...EMPTY_TRANSFER, effectiveOn: todayIso() });
  const errors = {
    ...validateTransfer(values, { needsException: err.overriding }),
    ...(student ? {} : { student: { code: 'required' as const } }),
  };
  const validation = useFormValidation<TransferField>({ errors, order: TRANSFER_ORDER, idPrefix: 'out' });

  const send = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('student');
      return unwrap(
        await api.POST('/v1/students/{id}/transfer-out', {
          params: { ...header, path: { id: student.id } },
          body: buildTransferOutBody(values, kind),
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('outDone'));
      refresh();
    },
    onError: err.fail,
  });

  useOnOpen(open, () => {
    setStudent(preset ?? null);
    setKind('transfer');
    setValues({ ...EMPTY_TRANSFER, effectiveOn: todayIso() });
    err.reset();
  });

  return (
    <FormDialog
      size="wide"
      open={open}
      title={t('outTitle')}
      description={t('outDesc')}
      submitLabel={err.overriding ? t('submitOverride') : t('submit')}
      error={err.node}
      validation={validation}
      onOpenChange={onOpenChange}
      onSubmit={() => send.mutateAsync()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {preset ? (
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs">{t('studentLabel')}</p>
            <p className="font-medium">{preset.name}</p>
          </div>
        ) : (
          <StudentPicker idPrefix="out" value={student} onChange={setStudent} v={validation} />
        )}
      </div>
      <TransferFields
        idPrefix="out"
        direction="out"
        values={values}
        onChange={setValues}
        v={validation}
        showKind
        kind={kind}
        onKind={(k) => {
          setKind(k);
          setValues((cur) => ({ ...cur, reason: reasonForKind(k, cur.reason) }));
        }}
      />
      {err.overriding && (
        <ExceptionField
          idPrefix="out"
          value={values.exceptionReason}
          onChange={(exceptionReason) => setValues({ ...values, exceptionReason })}
          v={validation}
        />
      )}
    </FormDialog>
  );
}

/** Dialog "Catat mutasi masuk": data murid baru + sekolah asal + kelas tujuan. */
export function TransferInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('transfers');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshAfterTransfer();
  const err = useFormError();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [classId, setClassId] = useState('');
  const [values, setValues] = useState<TransferValues>({ ...EMPTY_TRANSFER, effectiveOn: todayIso() });

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: open && can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: open && can('class:read') && !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const classList = classes.data ?? [];

  const errors = {
    ...validateStudent(draft),
    ...validateTransfer(values, { needsException: err.overriding }),
    ...(classId ? {} : { classId: { code: 'choose' as const } }),
  };
  const validation = useFormValidation<StudentField | TransferField>({
    errors,
    order: [...STUDENT_ORDER, ...TRANSFER_ORDER],
    idPrefix: 'in',
  });

  const send = useMutation({
    mutationFn: async () => {
      const { status: _status, ...person } = clean(draft);
      return unwrap(
        await api.POST('/v1/students/transfer-in', {
          params: header,
          body: buildTransferInBody(person, values, classId),
        }),
      );
    },
    onSuccess: (res) => {
      toast.success(t('inDone', { name: res.student.name }));
      refresh();
    },
    onError: err.fail,
  });

  useOnOpen(open, () => {
    setDraft(EMPTY);
    setClassId('');
    setValues({ ...EMPTY_TRANSFER, effectiveOn: todayIso() });
    err.reset();
  });

  return (
    <FormDialog
      size="wide"
      open={open}
      title={t('inTitle')}
      description={t('inDesc')}
      submitLabel={err.overriding ? t('submitOverride') : t('submit')}
      error={err.node}
      validation={validation}
      onOpenChange={onOpenChange}
      onSubmit={() => send.mutateAsync()}
    >
      <p className="font-heading text-sm font-semibold">{t('studentSection')}</p>
      <StudentFields idPrefix="in" draft={draft} classes={[]} onChange={setDraft} v={validation} lean />
      <p className="font-heading border-t pt-4 text-sm font-semibold">{t('transferSection')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor="in-classId">{t('classIn')}</Label>
        <SelectField
          {...validation.fieldProps('classId')}
          className={TOUCH_SELECT}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">{t('classPick')}</option>
          {classList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {classes.isSuccess && classList.length === 0 && (
          <p className="text-muted-foreground text-xs">{t('classNone')}</p>
        )}
        <FieldError id="in-classId" issue={validation.issue('classId')} />
      </div>
      <TransferFields idPrefix="in" direction="in" values={values} onChange={setValues} v={validation} />
      {err.overriding && (
        <ExceptionField
          idPrefix="in"
          value={values.exceptionReason}
          onChange={(exceptionReason) => setValues({ ...values, exceptionReason })}
          v={validation}
        />
      )}
    </FormDialog>
  );
}

/** Ubah keterangan mutasi: alasan, sekolah, NPSN, nomor dan tanggal surat. */
export function TransferEditDialog({
  transfer,
  onClose,
}: {
  transfer: {
    id: string;
    studentName: string;
    direction: Direction;
    effectiveOn: string;
    reason: string;
    reasonNote: string | null;
    counterpartSchoolName: string | null;
    counterpartNpsn: string | null;
    letterNumber: string | null;
    letterDate: string | null;
    exceptionReason: string | null;
  } | null;
  onClose: () => void;
}) {
  const t = useTranslations('transfers');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshAfterTransfer();
  const [values, setValues] = useState<TransferValues>(EMPTY_TRANSFER);
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation<TransferField>({
    errors: validateTransfer(values, { editing: true }),
    order: TRANSFER_ORDER,
    idPrefix: 'edit-transfer',
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!transfer) throw new Error('transfer');
      return unwrap(
        await api.PUT('/v1/student-transfers/{id}', {
          params: { ...header, path: { id: transfer.id } },
          body: buildTransferEditBody(values),
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  // Isian dimuat ulang tiap kali dialog dibuka untuk mutasi lain.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (transfer && loadedFor !== transfer.id) {
    setLoadedFor(transfer.id);
    setValues(transferToValues(transfer));
    setError(null);
  }
  if (!transfer && loadedFor !== null) setLoadedFor(null);

  return (
    <FormDialog
      size="wide"
      open={!!transfer}
      title={`${t('editTitle')} · ${transfer?.studentName ?? ''}`}
      description={t('editHint')}
      submitLabel={te('masterData.save')}
      error={error}
      validation={validation}
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => send.mutateAsync()}
    >
      {transfer && (
        <TransferFields
          idPrefix="edit-transfer"
          direction={transfer.direction}
          values={values}
          onChange={setValues}
          v={validation}
          showDate={false}
        />
      )}
    </FormDialog>
  );
}
