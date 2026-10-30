'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarClock, Download, FilePlus2, Layers, Pencil, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { buildExport, saveBlob } from '@/lib/sheet';
import {
  DiscountMark,
  digitsOnly,
  INSTALLMENT_CHOICES,
  InstallmentBadge,
  InstallmentTimeline,
  type InvoiceStatus,
  installmentInfo,
  PeriodPicker,
  STATUS_KEY,
  STATUSES,
  StatusBadge,
  todayIso,
  useFinanceYear,
  YearSelect,
} from '../shared';

const PAGE = 25;

interface GenerateResult {
  created: number;
  skipped: number;
  free?: number;
  discounted?: number;
  missingPlan: unknown;
}

/** missingPlan bisa berupa jumlah atau daftar (siswa/tingkat tanpa tarif); yang ditampilkan hanya jumlahnya. */
const countOf = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0);

const MISSING_SHOWN = 10;

interface MissingStudent {
  studentId: string;
  name: string;
  className: string;
}

/** Daftar siswa tanpa tarif; kosong bila API mengirim bentuk lain. */
const missingStudents = (v: unknown): MissingStudent[] =>
  Array.isArray(v)
    ? v.filter((s): s is MissingStudent => !!s && typeof s === 'object' && 'studentId' in s)
    : [];

/** Daftar tagihan dengan saringan, ubah diskon/jatuh tempo, pembatalan, pembuatan tagihan massal, dan ekspor. */
export function InvoicesView() {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('finance:manage');

  const { years, yearId, setYear } = useFinanceYear();
  const [classId, setClassId] = useState('');
  const [feeTypeId, setFeeTypeId] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [exporting, setExporting] = useState(false);

  // Dialog ubah, batalkan, dan buat tagihan.
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    discount: string;
    discountReason: string;
    dueDate: string;
  } | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState({
    feeTypeId: '',
    period: '',
    classId: '',
    dueDate: todayIso(),
    installments: '',
  });
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [splitting, setSplitting] = useState<{
    id: string;
    title: string;
    count: string;
    firstDue: string;
  } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: can('class:read') && !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const feeTypes = useQuery({
    queryKey: ['finance', school.schoolId, 'fee-types'],
    queryFn: async () => unwrap(await api.GET('/v1/finance/fee-types', { params: header })),
  });
  const studentSearch = useQuery({
    queryKey: ['finance', school.schoolId, 'student-search', debounced],
    enabled: debounced.length >= 2 && !student,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { q: debounced, limit: 8 } } })),
  });

  const query = {
    academicYearId: yearId,
    ...(classId ? { classId } : {}),
    ...(student ? { studentId: student.id } : {}),
    ...(feeTypeId ? { feeTypeId } : {}),
    ...(period ? { period } : {}),
    ...(status ? { status: status as InvoiceStatus } : {}),
    limit: PAGE,
    offset: page * PAGE,
  };
  const list = useQuery({
    queryKey: ['finance', school.schoolId, 'invoices', query],
    enabled: !!yearId,
    queryFn: async () => unwrap(await api.GET('/v1/finance/invoices', { params: { ...header, query } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });

  const classList = classes.data ?? [];
  const feeList = feeTypes.data ?? [];
  const genFee = feeList.find((f) => f.id === gen.feeTypeId);
  const genMonthly = genFee?.kind === 'monthly';
  const genCount = Number(gen.installments || 0);

  // Tarif jenis biaya terpilih, untuk pratinjau nominal cicilan (hanya bila semua tarifnya sama).
  const genPlans = useQuery({
    queryKey: ['finance', school.schoolId, 'fee-plans', yearId],
    enabled: manage && !!yearId && !!genFee && !genMonthly,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/fee-plans', { params: { ...header, query: { academicYearId: yearId } } }),
      ),
  });
  const genAmounts = [
    ...new Set((genPlans.data ?? []).filter((p) => p.feeTypeId === gen.feeTypeId).map((p) => p.amount)),
  ];
  const genAmount = genAmounts.length === 1 ? (genAmounts[0] as number) : 0;

  const generate = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/finance/invoices/generate', {
          params: header,
          body: {
            academicYearId: yearId,
            feeTypeId: gen.feeTypeId,
            period: genMonthly ? gen.period : null,
            classId: gen.classId || null,
            dueDate: gen.dueDate,
            ...(!genMonthly && genCount >= 2 ? { installments: genCount } : {}),
          },
        }),
      ),
    onSuccess: (r) => {
      setGenResult(r as GenerateResult);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const split = useMutation({
    mutationFn: async (v: NonNullable<typeof splitting>) =>
      unwrap(
        await api.POST('/v1/finance/invoices/{id}/split', {
          params: { ...header, path: { id: v.id } },
          body: { installments: Number(v.count), firstDueDate: v.firstDue },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('splitDone', { count: r.invoices.length }));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const save = useMutation({
    mutationFn: async (v: NonNullable<typeof editing>) =>
      unwrap(
        await api.PUT('/v1/finance/invoices/{id}', {
          params: { ...header, path: { id: v.id } },
          body: {
            discount: Number(v.discount || 0),
            discountReason: v.discountReason.trim(),
            dueDate: v.dueDate,
          },
        }),
      ),
    onSuccess: () => {
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const voidInvoice = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/finance/invoices/{id}/void', {
          params: { ...header, path: { id: voiding?.id ?? '' } },
          body: { reason: reason.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success(t('invoiceVoided'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  /** Ekspor semua tagihan yang lolos saringan (semua halaman). */
  async function exportExcel() {
    setExporting(true);
    try {
      const all: NonNullable<typeof list.data>['items'] = [];
      for (let offset = 0; ; offset += 100) {
        const chunk = unwrap(
          await api.GET('/v1/finance/invoices', {
            params: { ...header, query: { ...query, limit: 100, offset } },
          }),
        );
        all.push(...chunk.items);
        if (all.length >= chunk.total || chunk.items.length === 0) break;
      }
      if (all.length === 0) return void toast.info(tm('exportEmpty'));
      const blob = await buildExport(
        'Tagihan',
        [
          'Siswa',
          'NIS',
          'Kelas',
          'Tagihan',
          'Periode',
          'Jatuh tempo',
          'Jumlah',
          'Diskon',
          'Dibayar',
          'Sisa',
          'Status',
        ],
        all.map((x) => [
          x.studentName,
          x.nis,
          x.className,
          x.title,
          x.period,
          x.dueDate.slice(0, 10),
          x.amount,
          x.discount,
          x.paid,
          x.outstanding,
          t(STATUS_KEY[x.status]),
        ]),
        { textColumns: [2], widths: [30, 14, 14, 30, 12, 14, 14, 14, 14, 14, 12] },
      );
      saveBlob(blob, `tagihan-${school.schoolSlug}-${todayIso()}.xlsx`);
    } catch {
      toast.error(tm('exportError'));
    } finally {
      setExporting(false);
    }
  }

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const resetPage = () => setPage(0);

  return (
    <PageBody>
      <PageHeader
        title={t('invoicesTitle')}
        description={t('invoicesSubtitle')}
        actions={
          <>
            <Button variant="outline" disabled={exporting} onClick={exportExcel}>
              <Download className="size-4" /> {exporting ? tm('exporting') : tm('export')}
            </Button>
            {manage && (
              <FormDialog
                size="wide"
                trigger={
                  <Button>
                    <FilePlus2 className="size-4" /> {t('generate')}
                  </Button>
                }
                title={t('generate')}
                description={t('generateHint')}
                submitLabel={t('generate')}
                error={error}
                disabled={!gen.feeTypeId || !gen.dueDate || (genMonthly && !gen.period)}
                onOpenChange={() => {
                  setGen({ feeTypeId: '', period: '', classId: '', dueDate: todayIso(), installments: '' });
                  setError(null);
                }}
                onSubmit={() => generate.mutateAsync()}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="gen-fee">{t('feeType')}</Label>
                    <SelectField
                      id="gen-fee"
                      value={gen.feeTypeId}
                      placeholder={t('chooseFeeType')}
                      onChange={(e) => {
                        const f = feeList.find((x) => x.id === e.target.value);
                        setGen({
                          ...gen,
                          feeTypeId: e.target.value,
                          period: f?.kind === 'monthly' ? todayIso().slice(0, 7) : '',
                          installments: '',
                        });
                      }}
                    >
                      {feeList
                        .filter((f) => f.active)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </SelectField>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gen-class">{t('class')}</Label>
                    <SelectField
                      id="gen-class"
                      value={gen.classId}
                      onChange={(e) => setGen({ ...gen, classId: e.target.value })}
                    >
                      <option value="">{t('allClasses')}</option>
                      {classList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {genMonthly && (
                    <div className="grid gap-2">
                      <Label htmlFor="gen-period-month">{t('period')}</Label>
                      <PeriodPicker
                        idPrefix="gen-period"
                        value={gen.period}
                        onChange={(v) => setGen({ ...gen, period: v })}
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="gen-due">{t('dueDate')}</Label>
                    <DatePicker
                      id="gen-due"
                      value={gen.dueDate}
                      onChange={(v) => setGen({ ...gen, dueDate: v })}
                    />
                  </div>
                  {genFee && !genMonthly && (
                    <div className="bg-muted/40 grid gap-3 rounded-xl border p-3 sm:col-span-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="gen-installments">{t('installments')}</Label>
                          <SelectField
                            id="gen-installments"
                            value={gen.installments}
                            onChange={(e) => setGen({ ...gen, installments: e.target.value })}
                          >
                            <option value="">{t('installmentsOnce')}</option>
                            {INSTALLMENT_CHOICES.map((n) => (
                              <option key={n} value={String(n)}>
                                {t('installmentsN', { count: n })}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        <p className="text-muted-foreground self-end text-xs">{t('installmentsHint')}</p>
                      </div>
                      {genCount >= 2 && (
                        <div className="grid gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            <CalendarClock className="text-primary size-4" aria-hidden="true" />
                            {genAmount > 0
                              ? t('installmentsPreview', {
                                  count: genCount,
                                  amount: formatRupiah(Math.floor(genAmount / genCount)),
                                })
                              : t('installmentsPreviewPlain', { count: genCount })}
                          </p>
                          <InstallmentTimeline count={genCount} firstDue={gen.dueDate} locale={locale} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </FormDialog>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <YearSelect
          className="sm:w-44"
          years={years}
          yearId={yearId}
          onChange={(v) => {
            setYear(v);
            setClassId('');
            resetPage();
          }}
        />
        {classList.length > 0 && (
          <SelectField
            aria-label={t('class')}
            className="sm:w-40"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              resetPage();
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
          aria-label={t('feeType')}
          className="sm:w-48"
          value={feeTypeId}
          onChange={(e) => {
            setFeeTypeId(e.target.value);
            resetPage();
          }}
        >
          <option value="">{t('allFeeTypes')}</option>
          {feeList.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </SelectField>
        <div className="sm:w-64">
          <PeriodPicker
            allowEmpty
            idPrefix="flt-period"
            value={period}
            onChange={(v) => {
              setPeriod(v);
              resetPage();
            }}
          />
        </div>
        <SelectField
          aria-label={t('status')}
          className="sm:w-40"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPage();
          }}
        >
          <option value="">{t('allStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </SelectField>
        {student ? (
          <Badge variant="secondary" className="h-8 gap-2 pr-1.5 pl-3 text-sm">
            {student.name}
            <button
              type="button"
              aria-label={t('clearStudent')}
              className="hover:bg-muted rounded-full p-0.5"
              onClick={() => {
                setStudent(null);
                resetPage();
              }}
            >
              <X className="size-3.5" />
            </button>
          </Badge>
        ) : (
          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label={t('searchStudent')}
              className="pl-8"
              autoComplete="off"
              value={q}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
            {studentSearch.data && studentSearch.data.items.length > 0 && (
              <ul className="bg-popover absolute z-20 mt-1 w-full divide-y rounded-lg border shadow-md">
                {studentSearch.data.items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="hover:bg-muted flex w-full flex-col px-3 py-1.5 text-left text-sm"
                      onClick={() => {
                        setStudent({ id: s.id, name: s.name });
                        setQ('');
                        setDebounced('');
                        resetPage();
                      }}
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {[s.nis, s.className].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.items.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noInvoices')}</Card>
      )}

      {list.data && list.data.items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('student')}</TableHead>
                  <TableHead>{t('invoice')}</TableHead>
                  <TableHead>{t('dueDate')}</TableHead>
                  <TableHead className="text-right">{t('billed')}</TableHead>
                  <TableHead className="text-right">{t('discount')}</TableHead>
                  <TableHead className="text-right">{t('paid')}</TableHead>
                  <TableHead className="text-right">{t('outstanding')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  {manage && <TableHead className="w-32" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((i) => {
                  const late = i.overdue && i.status !== 'paid' && i.status !== 'void';
                  return (
                    <TableRow key={i.id} className={i.status === 'void' ? 'text-muted-foreground' : ''}>
                      <TableCell>
                        <span className="font-medium">{i.studentName}</span>
                        <span className="text-muted-foreground block text-xs">
                          {[i.nis, i.className].filter(Boolean).join(' · ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {i.title}
                        {(installmentInfo(i.period, i.title) || i.discount > 0) && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            <InstallmentBadge period={i.period} title={i.title} />
                            <DiscountMark amount={i.discount} reason={i.discountReason} />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={late ? 'text-destructive font-medium' : ''}>
                        {formatCalendarDate(locale, i.dueDate.slice(0, 10))}
                      </TableCell>
                      <TableCell className="text-right">{formatRupiah(i.amount)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(i.discount)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(i.paid)}</TableCell>
                      <TableCell className={late ? 'text-destructive text-right font-medium' : 'text-right'}>
                        {formatRupiah(i.outstanding)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={i.status} overdue={i.overdue} />
                      </TableCell>
                      {manage && (
                        <TableCell className="text-right whitespace-nowrap">
                          {i.status !== 'void' && (
                            <>
                              {i.status === 'unpaid' &&
                                i.paid === 0 &&
                                !installmentInfo(i.period, i.title) && (
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={t('splitInstallments')}
                                    title={t('splitInstallments')}
                                    onClick={() => {
                                      setError(null);
                                      setSplitting({
                                        id: i.id,
                                        title: `${i.studentName} · ${i.title}`,
                                        count: '3',
                                        firstDue: i.dueDate.slice(0, 10),
                                      });
                                    }}
                                  >
                                    <Layers className="size-4" />
                                  </Button>
                                )}
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={tm('edit')}
                                title={tm('edit')}
                                onClick={() => {
                                  setError(null);
                                  setEditing({
                                    id: i.id,
                                    title: i.title,
                                    discount: String(i.discount),
                                    discountReason: '',
                                    dueDate: i.dueDate.slice(0, 10),
                                  });
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t('voidInvoice')}
                                title={t('voidInvoice')}
                                onClick={() => {
                                  setError(null);
                                  setReason('');
                                  setVoiding({ id: i.id, title: `${i.studentName} · ${i.title}` });
                                }}
                              >
                                <Ban className="size-4" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {list.data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{t('totalInvoices', { count: total })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t('prev')}
            </Button>
            <span className="text-muted-foreground">
              {page + 1} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      <FormDialog
        open={!!editing}
        title={`${t('editInvoice')} · ${editing?.title ?? ''}`}
        submitLabel={tm('save')}
        error={error}
        onOpenChange={(o) => !o && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inv-discount">{t('discount')}</Label>
              <Input
                id="inv-discount"
                inputMode="numeric"
                value={editing.discount}
                onChange={(e) => setEditing({ ...editing, discount: digitsOnly(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-due">{t('dueDate')}</Label>
              <DatePicker
                id="inv-due"
                value={editing.dueDate}
                onChange={(v) => setEditing({ ...editing, dueDate: v })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="inv-reason">{t('discountReason')}</Label>
              <Input
                id="inv-reason"
                maxLength={200}
                value={editing.discountReason}
                onChange={(e) => setEditing({ ...editing, discountReason: e.target.value })}
              />
            </div>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={!!voiding}
        title={`${t('voidInvoice')} · ${voiding?.title ?? ''}`}
        description={t('voidInvoiceHint')}
        submitLabel={t('voidInvoice')}
        error={error}
        disabled={reason.trim().length < 3}
        onOpenChange={(o) => !o && setVoiding(null)}
        onSubmit={() => voidInvoice.mutateAsync()}
      >
        <div className="grid gap-2">
          <Label htmlFor="inv-void-reason">{t('reason')}</Label>
          <Input
            id="inv-void-reason"
            required
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </FormDialog>

      <FormDialog
        open={!!splitting}
        title={`${t('splitInstallments')} · ${splitting?.title ?? ''}`}
        description={t('splitHint')}
        submitLabel={t('splitInstallments')}
        error={error}
        disabled={!splitting || Number(splitting.count) < 2 || !splitting.firstDue}
        onOpenChange={(o) => !o && setSplitting(null)}
        onSubmit={() => (splitting ? split.mutateAsync(splitting) : Promise.resolve())}
      >
        {splitting && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="split-count">{t('installmentCount')}</Label>
                <SelectField
                  id="split-count"
                  value={splitting.count}
                  onChange={(e) => setSplitting({ ...splitting, count: e.target.value })}
                >
                  {INSTALLMENT_CHOICES.map((n) => (
                    <option key={n} value={String(n)}>
                      {t('installmentsN', { count: n })}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="split-due">{t('firstDueDate')}</Label>
                <DatePicker
                  id="split-due"
                  value={splitting.firstDue}
                  onChange={(v) => setSplitting({ ...splitting, firstDue: v })}
                />
              </div>
            </div>
            <InstallmentTimeline
              count={Number(splitting.count)}
              firstDue={splitting.firstDue}
              locale={locale}
            />
          </div>
        )}
      </FormDialog>

      <Dialog open={!!genResult} onOpenChange={(o) => !o && setGenResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('generateResult')}</DialogTitle>
          </DialogHeader>
          {genResult && (
            <ul className="grid gap-1 text-sm">
              <li>{t('resultCreated', { count: genResult.created })}</li>
              <li>{t('resultSkipped', { count: genResult.skipped })}</li>
              {(genResult.free ?? 0) > 0 && <li>{t('resultFree', { count: genResult.free ?? 0 })}</li>}
              {(genResult.discounted ?? 0) > 0 && (
                <li className="text-amber-700 dark:text-amber-300">
                  {t('resultDiscounted', { count: genResult.discounted ?? 0 })}
                </li>
              )}
              <li className={countOf(genResult.missingPlan) > 0 ? 'text-destructive' : ''}>
                {t('resultMissingPlan', { count: countOf(genResult.missingPlan) })}
              </li>
            </ul>
          )}
          {genResult && missingStudents(genResult.missingPlan).length > 0 && (
            <div className="grid gap-2 text-sm">
              <p className="text-muted-foreground">{t('missingPlanStudents')}</p>
              <ul className="grid list-disc gap-0.5 pl-5">
                {missingStudents(genResult.missingPlan)
                  .slice(0, MISSING_SHOWN)
                  .map((s) => (
                    <li key={s.studentId}>
                      {s.name} <span className="text-muted-foreground">({s.className})</span>
                    </li>
                  ))}
              </ul>
              {missingStudents(genResult.missingPlan).length > MISSING_SHOWN && (
                <p className="text-muted-foreground">
                  {t('missingPlanMore', {
                    count: missingStudents(genResult.missingPlan).length - MISSING_SHOWN,
                  })}
                </p>
              )}
              <Link href="/finance/settings" className="text-primary font-medium underline">
                {t('missingPlanSettings')}
              </Link>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setGenResult(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
