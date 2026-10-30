import type { DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { buildExport, saveBlob } from '@/lib/sheet';
import { buildLedgerRows, ledgerWidths, reportCardFileName, safeSheetName } from './format';
import type { RecapClass, ReportCardDoc } from './types';

/** Buat blob PDF dari satu atau banyak rapor. react-pdf dimuat saat dipakai agar tidak membebani bundel awal. */
async function renderPdf(docs: ReportCardDoc[]): Promise<Blob> {
  const [{ pdf }, { ReportCardDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./report-card-pdf'),
  ]);
  // ReportCardDocument merender <Document>, tipe elemen react-pdf mengharapkan DocumentProps.
  const element = createElement(ReportCardDocument, { docs }) as unknown as ReactElement<DocumentProps>;
  return pdf(element).toBlob();
}

/** Unduh rapor satu siswa: rapor-{nama-siswa}-{semester}.pdf. */
export async function downloadReportCardPdf(doc: ReportCardDoc): Promise<void> {
  saveBlob(await renderPdf([doc]), reportCardFileName(doc.student.name, doc.semester.name));
}

/** Unduh satu PDF berisi rapor banyak siswa, urutan halaman sesuai `docs`. */
export async function downloadClassReportCardsPdf(docs: ReportCardDoc[], fileName: string): Promise<void> {
  if (docs.length === 0) return;
  saveBlob(await renderPdf(docs), fileName);
}

/** Unduh leger Excel: No, Nama, NIS, nilai akhir tiap mapel, Rata-rata. */
export async function exportLedgerExcel(
  recap: RecapClass,
  meta: { schoolName: string; className: string; semesterName: string; fileName: string },
): Promise<void> {
  const { headers, rows } = buildLedgerRows(recap);
  const blob = await buildExport(safeSheetName(`Leger ${meta.className}`), headers, rows, {
    textColumns: [3],
    widths: ledgerWidths(recap),
  });
  saveBlob(blob, meta.fileName);
}
