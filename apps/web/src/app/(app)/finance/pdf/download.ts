import type { DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { saveBlob } from '@/lib/sheet';
import { receiptFileName } from './format';
import type { ReceiptDoc } from './types';

export type { ReceiptDoc } from './types';

/** Unduh kwitansi: kwitansi-{receiptNo}.pdf. react-pdf dimuat saat dipakai agar tidak membebani bundel awal. */
export async function downloadReceiptPdf(receipt: ReceiptDoc): Promise<void> {
  const [{ pdf }, { ReceiptDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./receipt-pdf'),
  ]);
  // ReceiptDocument merender <Document>, tipe elemen react-pdf mengharapkan DocumentProps.
  const element = createElement(ReceiptDocument, { receipt }) as unknown as ReactElement<DocumentProps>;
  saveBlob(await pdf(element).toBlob(), receiptFileName(receipt.receiptNo));
}
