'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, Eye, Search, X } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
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
import { downloadReceiptPdf } from './pdf/download';
import { type Receipt, ReceiptDialog } from './receipt-dialog';
import {
  DiscountMark,
  digitsOnly,
  InstallmentBadge,
  installmentInfo,
  localDate,
  METHOD_KEY,
  METHODS,
  type Method,
  paidAtIso,
  StatusBadge,
  todayIso,
  useFinanceYear,
} from './shared';

interface Picked {
  id: string;
  name: string;
}

/** Kasir: cari siswa, pilih tagihan yang dibayar, terima pembayaran, cetak kwitansi, dan lihat riwayatnya. */
export function CashierView() {
  const t = useTranslations('finance');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const pay = can('finance:pay');
  const manage = can('finance:manage');

  const { yearId, loading: yearLoading } = useFinanceYear();

  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [student, setStudent] = useState<Picked | null>(null);
  // invoiceId -> jumlah yang dibayar (teks). Ada kuncinya = tagihan dicentang.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>('cash');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [receipt, setReceipt] = useState<{ doc: Receipt; fresh: boolean } | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; receiptNo: string } | null>(null);
  const [reason, setReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const search = useQuery({
    queryKey: ['finance', school.schoolId, 'student-search', debounced],
    enabled: debounced.length >= 2 && !student,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { q: debounced, limit: 20 } } })),
  });

  const statement = useQuery({
    queryKey: ['finance', school.schoolId, 'statement', student?.id, yearId],
    enabled: !!student && !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/students/{studentId}/statement', {
          params: { ...header, path: { studentId: student?.id ?? '' }, query: { academicYearId: yearId } },
        }),
      ),
  });

  const open = (statement.data?.invoices ?? []).filter(
    (i) => i.status !== 'paid' && i.status !== 'void' && i.outstanding > 0,
  );
  const lines = open.filter((i) => i.id in amounts);
  const parsed = lines.map((i) => ({
    id: i.id,
    outstanding: i.outstanding,
    amount: Number(amounts[i.id] ?? 0),
  }));
  const total = parsed.reduce((s, l) => s + l.amount, 0);
  const valid =
    parsed.length > 0 &&
    parsed.every((l) => Number.isInteger(l.amount) && l.amount >= 1 && l.amount <= l.outstanding);

  function choose(s: Picked) {
    setStudent(s);
    setQ('');
    setDebounced('');
    setAmounts({});
    setNote('');
    setMethod('cash');
    setPaidAt(todayIso());
  }

  function reset() {
    setStudent(null);
    setAmounts({});
    setReceipt(null);
  }

  function toggle(id: string, outstanding: number, on: boolean) {
    setAmounts((a) => {
      const next = { ...a };
      if (on) next[id] = String(outstanding);
      else delete next[id];
      return next;
    });
  }

  const submit = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/finance/payments', {
          params: header,
          body: {
            studentId: student?.id ?? '',
            method,
            ...(paidAtIso(paidAt) ? { paidAt: paidAtIso(paidAt) as string } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            items: parsed.map((l) => ({ invoiceId: l.id, amount: l.amount })),
          },
        }),
      ),
    onSuccess: (doc) => {
      setReceipt({ doc: doc, fresh: true });
      setAmounts({});
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const voidPayment = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/finance/payments/{id}/void', {
          params: { ...header, path: { id: voiding?.id ?? '' } },
          body: { reason: reason.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success(t('paymentVoided'));
      queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });
    },
    onError: (e) => setVoidError(te(errorKey(e))),
  });

  async function fetchReceipt(id: string) {
    return unwrap(await api.GET('/v1/finance/payments/{id}', { params: { ...header, path: { id } } }));
  }

  async function viewReceipt(id: string) {
    try {
      setReceipt({ doc: await fetchReceipt(id), fresh: false });
    } catch (e) {
      toast.error(te(errorKey(e)));
    }
  }

  async function downloadPayment(id: string) {
    try {
      await downloadReceiptPdf(await fetchReceipt(id));
    } catch {
      toast.error(t('pdfError'));
    }
  }

  const totals = statement.data?.totals;

  return (
    <PageBody>
      <PageHeader title={t('cashierTitle')} description={t('cashierSubtitle')} />

      {!student && (
        <Card className="gap-3 p-4">
          <Label htmlFor="fin-search">{t('searchStudent')}</Label>
          <div className="relative w-full sm:max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="fin-search"
              className="pl-8"
              autoComplete="off"
              value={q}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {debounced.length >= 2 && search.isPending && <Skeleton className="h-16 w-full" />}
          {search.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(search.error))}</AlertDescription>
            </Alert>
          )}
          {search.data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noStudentFound')}</p>
          )}
          {search.data && search.data.items.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {search.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                    onClick={() => choose({ id: s.id, name: s.name })}
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
        </Card>
      )}

      {student && (
        <>
          <Card className="flex-row flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-heading text-lg font-semibold">
                {statement.data?.student.name ?? student.name}
              </p>
              <p className="text-muted-foreground text-sm">
                {[statement.data?.student.nis, statement.data?.student.className].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {totals && (
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">{t('totalOutstanding')}</p>
                  <p className="text-lg font-semibold">{formatRupiah(totals.outstanding)}</p>
                </div>
              )}
              <Button variant="outline" onClick={reset}>
                <X className="size-4" /> {t('changeStudent')}
              </Button>
            </div>
          </Card>

          {(statement.isPending || yearLoading) && <Skeleton className="h-40 w-full" />}
          {statement.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(statement.error))}</AlertDescription>
            </Alert>
          )}

          {statement.data && (
            <Card className="gap-4 p-4">
              <h2 className="font-heading text-lg font-semibold">{t('unpaidInvoices')}</h2>
              {open.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('allPaid')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>{t('invoice')}</TableHead>
                        <TableHead>{t('dueDate')}</TableHead>
                        <TableHead className="text-right">{t('outstanding')}</TableHead>
                        <TableHead className="w-44 text-right">{t('payAmount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {open.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>
                            <Checkbox
                              aria-label={i.title}
                              disabled={!pay}
                              checked={i.id in amounts}
                              onCheckedChange={(v) => toggle(i.id, i.outstanding, v === true)}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{i.title}</span>{' '}
                            <StatusBadge status={i.status} overdue={i.overdue} />
                            {(installmentInfo(i.period, i.title) || i.discount > 0) && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                <InstallmentBadge period={i.period} title={i.title} />
                                <DiscountMark amount={i.discount} reason={i.discountReason} />
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={i.overdue ? 'text-destructive' : 'text-muted-foreground'}>
                            {formatCalendarDate(locale, i.dueDate.slice(0, 10))}
                          </TableCell>
                          <TableCell className="text-right">{formatRupiah(i.outstanding)}</TableCell>
                          <TableCell className="text-right">
                            {i.id in amounts && (
                              <Input
                                aria-label={`${t('payAmount')} ${i.title}`}
                                inputMode="numeric"
                                className="ml-auto w-36 text-right"
                                value={amounts[i.id] ?? ''}
                                onChange={(e) =>
                                  setAmounts((a) => ({ ...a, [i.id]: digitsOnly(e.target.value) }))
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {pay && open.length > 0 && (
                <form
                  className="grid gap-4 border-t pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (valid) submit.mutate();
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fin-method">{t('method')}</Label>
                      <SelectField
                        id="fin-method"
                        value={method}
                        onChange={(e) => setMethod(e.target.value as Method)}
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {t(METHOD_KEY[m])}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fin-paidAt">{t('paidAt')}</Label>
                      <DatePicker id="fin-paidAt" value={paidAt} onChange={setPaidAt} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fin-note">{t('note')}</Label>
                      <Input
                        id="fin-note"
                        maxLength={200}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold">
                      {t('total')}: {formatRupiah(total)}
                    </p>
                    <Button type="submit" disabled={!valid || !paidAt || submit.isPending}>
                      {t('receivePayment')}
                    </Button>
                  </div>
                  {parsed.length > 0 && !valid && (
                    <p className="text-destructive text-sm">{t('amountInvalid')}</p>
                  )}
                </form>
              )}
            </Card>
          )}

          {statement.data && (
            <Card className="gap-4 p-4">
              <h2 className="font-heading text-lg font-semibold">{t('paymentHistory')}</h2>
              {statement.data.payments.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('noPayments')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('receiptNo')}</TableHead>
                        <TableHead>{t('paidAt')}</TableHead>
                        <TableHead>{t('method')}</TableHead>
                        <TableHead className="text-right">{t('amount')}</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.data.payments.map((p) => (
                        <TableRow key={p.id} className={p.voided ? 'text-muted-foreground' : ''}>
                          <TableCell className="font-mono text-xs">
                            {p.receiptNo} {p.voided && <Badge variant="outline">{t('voided')}</Badge>}
                          </TableCell>
                          <TableCell>{formatCalendarDate(locale, localDate(p.paidAt))}</TableCell>
                          <TableCell>{t(METHOD_KEY[p.method])}</TableCell>
                          <TableCell className={p.voided ? 'text-right line-through' : 'text-right'}>
                            {formatRupiah(p.total)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t('viewReceipt')}
                              title={t('viewReceipt')}
                              onClick={() => viewReceipt(p.id)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t('downloadReceipt')}
                              title={t('downloadReceipt')}
                              onClick={() => downloadPayment(p.id)}
                            >
                              <Download className="size-4" />
                            </Button>
                            {manage && !p.voided && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t('voidPayment')}
                                title={t('voidPayment')}
                                onClick={() => {
                                  setReason('');
                                  setVoidError(null);
                                  setVoiding({ id: p.id, receiptNo: p.receiptNo });
                                }}
                              >
                                <Ban className="size-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      <ReceiptDialog
        receipt={receipt?.doc ?? null}
        onClose={() => setReceipt(null)}
        {...(receipt?.fresh ? { onNew: reset } : {})}
      />

      <FormDialog
        open={!!voiding}
        title={`${t('voidPayment')} ${voiding?.receiptNo ?? ''}`}
        description={t('voidPaymentHint')}
        submitLabel={t('voidPayment')}
        error={voidError}
        disabled={reason.trim().length < 3}
        onOpenChange={(o) => !o && setVoiding(null)}
        onSubmit={() => voidPayment.mutateAsync()}
      >
        <div className="grid gap-2">
          <Label htmlFor="fin-void-reason">{t('reason')}</Label>
          <Input
            id="fin-void-reason"
            required
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </FormDialog>
    </PageBody>
  );
}
