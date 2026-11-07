'use client';

import { useMutation } from '@tanstack/react-query';
import { CreditCard, Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { isPayableOnline, MAX_ONLINE_INVOICES, selectedOutstanding } from '@/lib/online-charge';
import { PORTAL_PATHS, type PortalInvoice, type PortalInvoices, type PortalReceipt } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { downloadReceiptPdf } from '../../../finance/pdf/download';
import { usePortalDetail, usePortalMe } from '../../queries';
import { EmptyState } from '../../ui-bits';
import { TabState } from './tab-state';

type Shown = PortalInvoice['status'] | 'overdue';

const STATUS_STYLE: Record<Shown, string> = {
  paid: 'bg-chart-5/20 text-foreground',
  partial: 'bg-chart-2/25 text-foreground',
  unpaid: 'bg-muted text-foreground',
  overdue: 'bg-chart-3/20 text-foreground',
  void: 'bg-muted text-muted-foreground line-through',
};

export function InvoicesTab({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const me = usePortalMe();
  const q = usePortalDetail<PortalInvoices>(studentId, 'invoices', PORTAL_PATHS.invoices(studentId));
  const te = useTranslations();
  const { school } = useSchool();
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const data = q.data;
  const child = me.data?.children.find((c) => c.id === studentId);
  const payable = (data?.invoices ?? []).filter(isPayableOnline);
  // Hanya id yang masih bisa dibayar yang dihitung (data bisa berubah setelah muat ulang).
  const chosen = new Set(payable.filter((i) => selected.has(i.id)).map((i) => i.id));
  const chosenTotal = selectedOutstanding(payable, chosen);

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  // Tombol selalu tampil: portal tidak tahu apakah sekolah sudah mengaktifkan Midtrans, jadi 409
  // `gateway_disabled` dijawab dengan pesan yang ramah.
  const payOnline = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/portal/children/{studentId}/pay-online', {
          params: { header: schoolHeader(school.schoolId), path: { studentId } },
          body: { invoiceIds: [...chosen] },
        }),
      ),
    onSuccess: (r) => {
      window.location.assign(r.paymentUrl);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function receipt(r: PortalReceipt) {
    if (!child || !me.data) return;
    setBusy(r.id);
    try {
      await downloadReceiptPdf({
        id: r.id,
        receiptNo: r.receiptNo,
        paidAt: r.paidAt,
        method: r.method,
        total: r.total,
        note: null,
        voided: false,
        voidReason: null,
        cashierName: null,
        school: { name: me.data.school.name, address: null },
        student: { id: child.id, name: child.name, nis: child.nis, className: child.className },
        items: r.items,
      });
    } catch {
      toast.error(t('receiptError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <TabState query={q} available={data?.available ?? true} />
      {data?.available && data.invoices.length === 0 && (
        <EmptyState title={t('invoicesEmptyTitle')} body={t('invoicesEmptyBody')} />
      )}
      {data?.available && data.invoices.length > 0 && (
        <>
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl p-4',
              data.outstandingTotal > 0 ? 'bg-chart-3/12' : 'bg-chart-5/15',
            )}
          >
            <div>
              <p className="text-muted-foreground text-xs font-medium">{t('outstandingTotal')}</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {data.outstandingTotal > 0 ? formatRupiah(data.outstandingTotal) : t('allPaid')}
              </p>
            </div>
            {data.overdueTotal > 0 && (
              <p className="text-right text-xs">
                <span className="text-muted-foreground block">{t('overdueTotal')}</span>
                <span className="text-destructive font-semibold tabular-nums">
                  {formatRupiah(data.overdueTotal)}
                </span>
              </p>
            )}
          </div>
          {payable.length > 0 && (
            <div className="bg-card grid gap-2 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pay-all"
                    checked={chosen.size === Math.min(payable.length, MAX_ONLINE_INVOICES)}
                    onCheckedChange={(v) =>
                      setSelected(
                        v === true
                          ? new Set(payable.slice(0, MAX_ONLINE_INVOICES).map((i) => i.id))
                          : new Set(),
                      )
                    }
                  />
                  <label htmlFor="pay-all" className="text-sm font-medium">
                    {t('payOnlineSelectAll')}
                  </label>
                </div>
                <Button
                  disabled={chosen.size === 0 || payOnline.isPending}
                  onClick={() => payOnline.mutate()}
                >
                  <CreditCard className="size-4" aria-hidden />
                  {payOnline.isPending
                    ? t('payOnlineWorking')
                    : chosen.size === 0
                      ? t('payOnline')
                      : t('payOnlineCount', { count: chosen.size, total: formatRupiah(chosenTotal) })}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{t('payOnlineHint')}</p>
            </div>
          )}
          <ul className="grid gap-3">
            {data.invoices.map((inv) => {
              const state: Shown = inv.overdue ? 'overdue' : inv.status;
              const pct = inv.amount > 0 ? Math.min(100, (inv.paid / inv.amount) * 100) : 0;
              return (
                <li key={inv.id} className="bg-card grid gap-3 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading font-semibold">{inv.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {t('dueOn', { date: formatCalendarDate(locale, inv.dueDate) })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_STYLE[state],
                      )}
                    >
                      {t(`invoiceStatus.${state}`)}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">{t('amount')}</p>
                      <p className="font-semibold tabular-nums">{formatRupiah(inv.amount)}</p>
                      {inv.discount > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {t('discount', { value: formatRupiah(inv.discount) })}
                        </p>
                      )}
                    </div>
                    {inv.outstanding > 0 && (
                      <div className="text-right">
                        <p className="text-muted-foreground text-xs">{t('remaining')}</p>
                        <p className="text-destructive font-semibold tabular-nums">
                          {formatRupiah(inv.outstanding)}
                        </p>
                      </div>
                    )}
                  </div>
                  {isPayableOnline(inv) && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`pay-${inv.id}`}
                        checked={chosen.has(inv.id)}
                        disabled={!chosen.has(inv.id) && chosen.size >= MAX_ONLINE_INVOICES}
                        onCheckedChange={(v) => toggle(inv.id, v === true)}
                      />
                      <label htmlFor={`pay-${inv.id}`} className="text-sm">
                        {t('payOnlineSelect')}
                      </label>
                    </div>
                  )}
                  {inv.paid > 0 && (
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                      <span className="bg-chart-5 block h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {data.receipts.length > 0 && (
            <section className="grid content-start gap-2" aria-labelledby="portal-receipts">
              <h3 id="portal-receipts" className="font-heading font-semibold">
                {t('receipts')}
              </h3>
              <ul className="bg-card divide-y rounded-2xl border">
                {data.receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.receiptNo}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatCalendarDate(locale, r.paidAt.slice(0, 10))} · {formatRupiah(r.total)}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === r.id || !child}
                      onClick={() => receipt(r)}
                    >
                      <Download className="size-3.5" aria-hidden /> {t('receipt')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
