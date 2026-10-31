'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCheck,
  CircleCheck,
  Download,
  Eye,
  ReceiptText,
  Search,
  UserSearch,
  Wallet,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, MODULE_TONE, TONES, ToneBadge, UserAvatar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { cn } from '@/lib/utils';
import { downloadReceiptPdf } from './pdf/download';
import { type Receipt, ReceiptDialog } from './receipt-dialog';
import {
  DiscountMark,
  digitsOnly,
  InstallmentBadge,
  localDate,
  methodIcon,
  paidAtIso,
  StatusBadge,
  todayIso,
  useFinanceYear,
  usePaymentMethods,
} from './shared';
import { ENTER, ListSkeleton, Money, RowMenu } from './ui';

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
  const methods = usePaymentMethods();
  // Pilihan kasir; kosong/tak aktif lagi = metode aktif pertama.
  const [methodChoice, setMethod] = useState('');
  const method = methods.active.some((m) => m.key === methodChoice)
    ? methodChoice
    : (methods.active[0]?.key ?? '');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [confirming, setConfirming] = useState(false);
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
    title: i.title,
    outstanding: i.outstanding,
    amount: Number(amounts[i.id] ?? 0),
  }));
  const total = parsed.reduce((s, l) => s + l.amount, 0);
  const lineOk = (l: { amount: number; outstanding: number }) =>
    Number.isInteger(l.amount) && l.amount >= 1 && l.amount <= l.outstanding;
  const valid = parsed.length > 0 && parsed.every(lineOk) && method !== '';
  const overdueTotal = open.filter((i) => i.overdue).reduce((s, i) => s + i.outstanding, 0);
  const allSelected = open.length > 0 && open.every((i) => i.id in amounts);

  function choose(s: Picked) {
    setStudent(s);
    setQ('');
    setDebounced('');
    setAmounts({});
    setNote('');
    setMethod('');
    setPaidAt(todayIso());
  }

  function reset() {
    setStudent(null);
    setAmounts({});
    setReceipt(null);
    setConfirming(false);
  }

  function toggle(id: string, outstanding: number, on: boolean) {
    setAmounts((a) => {
      const next = { ...a };
      if (on) next[id] = String(outstanding);
      else delete next[id];
      return next;
    });
  }

  function toggleAll() {
    setAmounts(allSelected ? {} : Object.fromEntries(open.map((i) => [i.id, String(i.outstanding)])));
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
  const studentName = statement.data?.student.name ?? student?.name ?? '';
  const studentSub = [statement.data?.student.nis, statement.data?.student.className]
    .filter(Boolean)
    .join(' · ');
  const searching = debounced.length >= 2;

  return (
    <PageBody>
      <PageHeader
        icon={ReceiptText}
        tone={MODULE_TONE.finance}
        title={t('cashierTitle')}
        description={t('cashierSubtitle')}
      />

      {!student && (
        <div className={cn('grid gap-4', ENTER)}>
          <div className="bg-card relative overflow-hidden rounded-2xl border p-5 sm:p-8">
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute -top-16 -right-16 size-56 rounded-full opacity-30 blur-3xl',
                TONES.amber.bar,
              )}
            />
            <div className="relative mx-auto grid max-w-2xl gap-3">
              <Label htmlFor="fin-search" className="font-heading text-base font-semibold">
                {t('searchStudent')}
              </Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
                <Input
                  id="fin-search"
                  className="h-12 rounded-xl pl-12 text-base md:text-base"
                  autoComplete="off"
                  value={q}
                  placeholder={t('searchPlaceholder')}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {!searching && <p className="text-muted-foreground text-sm">{t('searchHint')}</p>}
            </div>
          </div>

          {searching && search.isPending && <ListSkeleton rows={3} />}
          {search.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(search.error))}</AlertDescription>
            </Alert>
          )}
          {search.data?.items.length === 0 && (
            <EmptyPanel
              icon={UserSearch}
              tone="amber"
              title={t('noStudentFound')}
              body={t('noStudentFoundHint')}
            />
          )}
          {search.data && search.data.items.length > 0 && (
            <ul className="mx-auto grid w-full max-w-2xl gap-2">
              {search.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="bg-card hover:border-ring/60 hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3"
                    onClick={() => choose({ id: s.id, name: s.name })}
                  >
                    <UserAvatar name={s.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {[s.nis, s.className].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-primary text-xs font-medium">{t('chooseStudent')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {student && (
        <div className={cn('grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]', ENTER)}>
          <div className="grid min-w-0 gap-6">
            {/* Kartu siswa */}
            <div className="bg-card relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border p-4 sm:p-5">
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute -top-12 -right-12 size-40 rounded-full opacity-30 blur-3xl',
                  TONES.amber.bar,
                )}
              />
              <UserAvatar name={studentName} size="lg" />
              <div className="relative min-w-0 flex-1">
                <p className="font-heading truncate text-xl font-semibold">{studentName}</p>
                <p className="text-muted-foreground truncate text-sm">{studentSub}</p>
              </div>
              <div className="relative flex flex-wrap items-center gap-4">
                {totals && (
                  <div className="sm:text-right">
                    <p className="text-muted-foreground text-xs">{t('totalOutstanding')}</p>
                    <Money value={totals.outstanding} className="font-heading text-2xl font-semibold" />
                    {overdueTotal > 0 && (
                      <p className="mt-0.5">
                        <ToneBadge tone="rose">
                          {t('overdueAmount', { amount: formatRupiah(overdueTotal) })}
                        </ToneBadge>
                      </p>
                    )}
                  </div>
                )}
                <Button variant="outline" onClick={reset}>
                  <X className="size-4" /> {t('changeStudent')}
                </Button>
              </div>
            </div>

            {(statement.isPending || yearLoading) && !statement.isError && (
              <div className="grid gap-3">
                <Skeleton className="h-6 w-40" />
                <ListSkeleton rows={3} />
              </div>
            )}
            {statement.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(statement.error))}</AlertDescription>
              </Alert>
            )}

            {statement.data && (
              <section className="grid gap-3" aria-labelledby="fin-unpaid">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="fin-unpaid" className="font-heading text-lg font-semibold">
                    {t('unpaidInvoices')}
                    {open.length > 0 && (
                      <span className="text-muted-foreground ml-2 text-sm font-normal">{open.length}</span>
                    )}
                  </h2>
                  {pay && open.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={toggleAll}>
                      <CheckCheck className="size-4" /> {allSelected ? t('clearSelection') : t('selectAll')}
                    </Button>
                  )}
                </div>

                {open.length === 0 ? (
                  <EmptyPanel
                    icon={CircleCheck}
                    tone="emerald"
                    title={t('allPaid')}
                    body={t('allPaidHint')}
                  />
                ) : (
                  <ul className="grid gap-2">
                    {open.map((i) => {
                      const on = i.id in amounts;
                      const line = parsed.find((l) => l.id === i.id);
                      const bad = on && !!line && !lineOk(line);
                      return (
                        <li
                          key={i.id}
                          className={cn(
                            'bg-card rounded-xl border p-3 transition-colors sm:p-4',
                            on && 'border-amber-500/60 bg-amber-50/60 dark:bg-amber-500/5',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`fin-inv-${i.id}`}
                              className="mt-1"
                              aria-label={i.title}
                              disabled={!pay}
                              checked={on}
                              onCheckedChange={(v) => toggle(i.id, i.outstanding, v === true)}
                            />
                            <label htmlFor={`fin-inv-${i.id}`} className="min-w-0 flex-1 cursor-pointer">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-medium">{i.title}</span>
                                <StatusBadge status={i.status} overdue={i.overdue} />
                                <InstallmentBadge period={i.period} title={i.title} />
                                <DiscountMark amount={i.discount} reason={i.discountReason} />
                              </span>
                              <span
                                className={cn(
                                  'mt-0.5 block text-xs',
                                  i.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
                                )}
                              >
                                {t('dueDate')}: {formatCalendarDate(locale, i.dueDate.slice(0, 10))}
                              </span>
                            </label>
                            <div className="text-right">
                              <p className="text-muted-foreground text-xs">{t('outstanding')}</p>
                              <Money value={i.outstanding} className="font-semibold" />
                            </div>
                          </div>
                          {on && (
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                              <Label htmlFor={`fin-amt-${i.id}`} className="text-muted-foreground text-xs">
                                {t('payAmount')}
                              </Label>
                              <div className="relative w-44">
                                <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                                  {t('unitRupiah')}
                                </span>
                                <Input
                                  id={`fin-amt-${i.id}`}
                                  aria-label={`${t('payAmount')} ${i.title}`}
                                  inputMode="numeric"
                                  aria-invalid={bad || undefined}
                                  className="pl-9 text-right tabular-nums"
                                  value={amounts[i.id] ?? ''}
                                  onChange={(e) =>
                                    setAmounts((a) => ({ ...a, [i.id]: digitsOnly(e.target.value) }))
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {statement.data && (
              <section className="grid gap-3" aria-labelledby="fin-history">
                <h2 id="fin-history" className="font-heading text-lg font-semibold">
                  {t('paymentHistory')}
                </h2>
                {statement.data.payments.length === 0 ? (
                  <EmptyPanel icon={Wallet} tone="slate" title={t('noPayments')} body={t('noPaymentsHint')} />
                ) : (
                  <ul className="grid gap-2">
                    {statement.data.payments.map((p) => {
                      const Icon = methodIcon(p.method);
                      return (
                        <li
                          key={p.id}
                          className={cn(
                            'bg-card flex items-center gap-3 rounded-xl border p-3',
                            p.voided && 'text-muted-foreground',
                          )}
                        >
                          <IconTile icon={Icon} tone={p.voided ? 'slate' : 'emerald'} className="size-10" />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-medium">{p.receiptNo}</span>
                              {p.voided && <ToneBadge tone="slate">{t('voided')}</ToneBadge>}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatCalendarDate(locale, localDate(p.paidAt))} · {p.methodLabel}
                            </p>
                          </div>
                          <Money
                            value={p.total}
                            className={cn('font-semibold', p.voided && 'line-through')}
                          />
                          <RowMenu
                            label={t('rowActions')}
                            items={[
                              {
                                key: 'view',
                                label: t('viewReceipt'),
                                icon: Eye,
                                onClick: () => viewReceipt(p.id),
                              },
                              {
                                key: 'pdf',
                                label: t('downloadReceipt'),
                                icon: Download,
                                onClick: () => downloadPayment(p.id),
                              },
                              ...(manage && !p.voided
                                ? [
                                    {
                                      key: 'void',
                                      label: t('voidPayment'),
                                      icon: Ban,
                                      destructive: true,
                                      onClick: () => {
                                        setReason('');
                                        setVoidError(null);
                                        setVoiding({ id: p.id, receiptNo: p.receiptNo });
                                      },
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* Panel ringkasan lengket */}
          {statement.data && pay && open.length > 0 && (
            <form
              aria-label={t('summary')}
              className="bg-card grid gap-4 rounded-2xl border p-4 shadow-sm lg:sticky lg:top-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) setConfirming(true);
              }}
            >
              <div className="flex items-center gap-2">
                <IconTile icon={ReceiptText} tone="amber" className="size-9" />
                <h2 className="font-heading text-base font-semibold">{t('summary')}</h2>
              </div>

              {parsed.length === 0 ? (
                <p className="text-muted-foreground bg-muted/50 rounded-xl p-3 text-sm">
                  {t('summaryEmpty')}
                </p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {parsed.map((l) => (
                    <li key={l.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{l.title}</span>
                      <Money value={l.amount} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-2">
                <span id="fin-method-label" className="text-sm font-medium">
                  {t('method')}
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="fin-method-label"
                  className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2"
                >
                  {methods.active.map((m) => {
                    const Icon = methodIcon(m.key);
                    const sel = method === m.key;
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: kartu pilihan metode bayar berbentuk tombol radio
                      <button
                        key={m.key}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        onClick={() => setMethod(m.key)}
                        className={cn(
                          'focus-visible:ring-ring/50 flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3',
                          sel
                            ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100'
                            : 'hover:bg-muted',
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                        <span className="max-w-full truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="fin-paidAt">{t('paidAt')}</Label>
                <DatePicker id="fin-paidAt" value={paidAt} onChange={setPaidAt} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fin-note">{t('note')}</Label>
                <Input id="fin-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="grid gap-3 border-t pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground text-sm">{t('total')}</span>
                  <Money value={total} className="font-heading text-3xl font-semibold" />
                </div>
                {parsed.length > 0 && !valid && (
                  <p className="text-destructive text-sm" role="alert">
                    {t('amountInvalid')}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 w-full bg-amber-500 text-base font-semibold text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                  disabled={!valid || !paidAt || submit.isPending}
                >
                  <Wallet className="size-5" /> {t('receivePayment')}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={t('confirmPayTitle')}
        description={t('confirmPayBody', {
          total: formatRupiah(total),
          name: studentName,
          method: methods.labelOf(method),
        })}
        confirmLabel={t('receivePayment')}
        pending={submit.isPending}
        onOpenChange={setConfirming}
        onConfirm={() => submit.mutateAsync()}
      />

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
