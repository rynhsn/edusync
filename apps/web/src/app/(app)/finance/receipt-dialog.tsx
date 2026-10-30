'use client';

import { Download, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { downloadReceiptPdf } from './pdf/download';
import type { ReceiptDoc } from './pdf/types';
import { localDate, METHOD_KEY } from './shared';

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

  return (
    <Dialog open={!!receipt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {receipt && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">
                {t('receiptTitle')} {receipt.receiptNo}
                {receipt.voided && <span className="text-destructive ml-2 text-sm">({t('voided')})</span>}
              </DialogTitle>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('student')}</dt>
              <dd className="font-medium">
                {receipt.student.name}
                {receipt.student.className ? ` · ${receipt.student.className}` : ''}
              </dd>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoice')}</TableHead>
                  <TableHead className="text-right">{t('amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.items.map((i) => (
                  <TableRow key={i.invoiceId}>
                    <TableCell>{i.title}</TableCell>
                    <TableCell className="text-right">{formatRupiah(i.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">{t('total')}</TableCell>
                  <TableCell className="text-right font-semibold">{formatRupiah(receipt.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
