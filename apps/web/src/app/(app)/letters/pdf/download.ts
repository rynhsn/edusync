import type { DocumentProps } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { createElement, type ReactElement } from 'react';
import { saveBlob } from '@/lib/sheet';
import { letterFileName, sha256Hex } from '../format';
import type { LetterPdfDoc } from './types';

export type { LetterPdfDoc } from './types';

/** QR (data URL PNG) untuk tautan verifikasi. */
export function makeQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
}

/** Buat byte PDF surat. react-pdf dimuat saat dipakai agar tidak membebani bundel awal. */
export async function renderLetterPdf(doc: LetterPdfDoc): Promise<Blob> {
  const [{ pdf }, { LetterDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./letter-pdf'),
  ]);
  // LetterDocument merender <Document>, tipe elemen react-pdf mengharapkan DocumentProps.
  const element = createElement(LetterDocument, { doc }) as unknown as ReactElement<DocumentProps>;
  return pdf(element).toBlob();
}

/** Hitung hash SHA-256 heksa dari blob PDF. */
export async function hashBlob(blob: Blob): Promise<string> {
  return sha256Hex(new Uint8Array(await blob.arrayBuffer()));
}

/** Simpan PDF sebagai berkas unduhan dengan nama baku surat. */
export function saveLetterPdf(blob: Blob, number: string, subject: string): void {
  saveBlob(blob, letterFileName(number, subject));
}
