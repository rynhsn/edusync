'use client';

import { Ban, CircleCheck, Download, Plus, ReceiptText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconTile, ToneBadge, UserAvatar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { downloadReceiptPdf } from './pdf/download';
import type { ReceiptDoc } from './pdf/types';
import { localDate, METHOD_KEY } from './shared';
import { Money } from './ui';

export type Receipt = ReceiptDoc;

/** Kwitansi: nomor, rincian, unduh PDF. `onNew` menampilkan tombol "Pembayaran baru" (setelah menerima pembayaran). */
export function ReceiptDialog({
  receipt,
  onClose,
  onNew,
}: {
  receipt: Receipt | null;
  onClose: () => void;
  onNew?: () => void;
}) {
  const t = useTranslations('finance');
  const locale = useLocale() as Locale;
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!receipt) return;
    setBusy(true);
    try {
      await downloadReceiptPdf(receipt);
    } catch {
      toast.error(t('pdfError'));
    } finally {
      setBusy(false);
    }
  }

  const fresh = !!onNew;
  return (
    <Dialog open={!!receipt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {receipt && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <IconTile
                  icon={receipt.voided ? Ban : fresh ? CircleCheck : ReceiptText}
                  tone={receipt.voided ? 'slate' : 'emerald'}
                />
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-lg">
                    {fresh && !receipt.voided ? t('paymentReceived') : t('receiptTitle')}
                    {receipt.voided && (
                      <ToneBadge tone="slate" className="ml-2 align-middle">
                        {t('voided')}
                      </ToneBadge>
                    )}
                  </DialogTitle>
                  <p className="text-muted-foreground font-mono text-xs">{receipt.receiptNo}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="bg-muted/40 grid gap-4 rounded-xl border border-dashed p-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={receipt.student.name} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{receipt.student.name}</p>
                  {receipt.student.className && (
                    <p className="text-muted-foreground truncate text-xs">{receipt.student.className}</p>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t('paidAt')}</dt>
                <dd>{formatCalendarDate(locale, localDate(receipt.paidAt))}</dd>
                <dt className="text-muted-foreground">{t('method')}</dt>
                <dd>{t(METHOD_KEY[receipt.method])}</dd>
                {receipt.cashierName && (
                  <>
                    <dt className="text-muted-foreground">{t('cashier')}</dt>
                    <dd>{receipt.cashierName}</dd>
                  </>
                )}
                {receipt.note && (
                  <>
                    <dt className="text-muted-foreground">{t('note')}</dt>
                    <dd>{receipt.note}</dd>
                  </>
                )}
              </dl>
              <ul className="grid gap-1.5 border-t border-dashed pt-3 text-sm">
                {receipt.items.map((i) => (
                  <li key={i.invoiceId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">{i.title}</span>
                    <Money value={i.amount} className="shrink-0" />
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-3 border-t border-dashed pt-3">
                <span className="font-semibold">{t('total')}</span>
                <Money
                  value={receipt.total}
                  className={`font-heading text-2xl font-semibold ${receipt.voided ? 'line-through' : ''}`}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={download}>
                <Download className="size-4" /> {t('downloadReceipt')}
              </Button>
              {onNew && (
                <Button onClick={onNew}>
                  <Plus className="size-4" /> {t('newPayment')}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
