import type { DocumentTemplateConfig } from '@edusync/contracts';
import type { DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { documentFileName, type GraduationStudent, type PrintMeta, type SklLabels } from '@/lib/graduation';
import { saveBlob } from '@/lib/sheet';

/** Buat dan simpan SKL satu murid (PDF). react-pdf dimuat saat dipakai agar tidak membebani bundel awal. */
export async function downloadSklPdf(
  student: GraduationStudent,
  labels: SklLabels,
  meta: PrintMeta,
  template: DocumentTemplateConfig | null = null,
): Promise<void> {
  const [{ pdf }, { SklDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./skl-pdf')]);
  const element = createElement(SklDocument, {
    student,
    labels,
    meta,
    template,
  }) as unknown as ReactElement<DocumentProps>;
  saveBlob(await pdf(element).toBlob(), `${documentFileName('skl', student.name, meta.yearName)}.pdf`);
}
