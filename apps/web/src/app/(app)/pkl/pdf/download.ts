import type { DocumentTemplateConfig } from '@edusync/contracts';
import type { DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { saveBlob } from '@/lib/sheet';
import { certificateFileName } from './format';
import type { CertificateDoc } from './types';

/** Buat dan simpan sertifikat PKL. react-pdf dimuat saat dipakai agar tidak membebani bundel awal. */
export async function downloadCertificatePdf(
  doc: CertificateDoc,
  template: DocumentTemplateConfig | null = null,
): Promise<void> {
  const [{ pdf }, { CertificateDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./certificate-pdf'),
  ]);
  const element = createElement(CertificateDocument, {
    doc,
    template,
  }) as unknown as ReactElement<DocumentProps>;
  saveBlob(await pdf(element).toBlob(), certificateFileName(doc.studentName, doc.periodName));
}
