import type { CardKind, CardLayout } from '@edusync/contracts';
import type { DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { fetchImageDataUrl, mapPool } from '@/lib/cards/assets';
import { bestSheetGrid, type SheetOptions } from '@/lib/cards/sheet-layout';
import { saveBlob } from '@/lib/sheet';
import type { CardAssets, PdfCard } from './cards-pdf';

export const MAX_PRINT_CARDS = 300;

/** Data satu kartu sebelum foto diambil: nilai kolom dan jalur foto (null bila belum ada). */
export interface CardSource {
  data: PdfCard['data'];
  photoPath: string | null;
}

export interface PrintJob {
  schoolId: string;
  kind: CardKind;
  title: string;
  layout: CardLayout;
  /** Jalur latar (publik), atau null. */
  backgroundPath: string | null;
  cards: CardSource[];
  mode: 'single' | 'sheet';
  sheet: SheetOptions;
}

export type PrintProgress =
  | { phase: 'assets'; done: number; total: number }
  | { phase: 'render'; done: number; total: number };

/** Jalur berkas gambar tetap (logo dsb.) yang bisa diambil tanpa login. */
export const schoolFilePath = (fileId: string) => `/v1/public/school-files/${fileId}`;

/** Kartu yang tidak muat pada satu lembar (kartu lebih besar dari kertas) membuat cetak lembar mustahil. */
export const sheetFits = (job: Pick<PrintJob, 'layout' | 'sheet'>) =>
  bestSheetGrid(job.layout.widthMm, job.layout.heightMm, job.sheet).perPage > 0;

/** Ambil semua gambar (dengan kemajuan), lalu render PDF. react-pdf dimuat saat dipakai. */
export async function renderCardsPdf(job: PrintJob, onProgress?: (p: PrintProgress) => void): Promise<Blob> {
  const sources = job.cards.slice(0, MAX_PRINT_CARDS);
  const fixedPaths = [
    ...(job.backgroundPath ? [job.backgroundPath] : []),
    ...job.layout.elements.flatMap((e) => (e.type === 'image' && e.fileId ? [schoolFilePath(e.fileId)] : [])),
  ];
  const total = fixedPaths.length + sources.filter((c) => c.photoPath).length;
  let done = 0;
  const tick = () => onProgress?.({ phase: 'assets', done, total });
  tick();

  const fixed = new Map<string, string | null>();
  await mapPool(
    [...new Set(fixedPaths)],
    4,
    async (path) => {
      fixed.set(path, await fetchImageDataUrl(path, job.schoolId));
      done++;
      tick();
    },
    undefined,
  );

  const photos = await mapPool(sources, 6, async (c) => {
    if (!c.photoPath) return null;
    const url = await fetchImageDataUrl(c.photoPath, job.schoolId);
    done++;
    tick();
    return url;
  });

  const assets: CardAssets = {
    background: job.backgroundPath ? (fixed.get(job.backgroundPath) ?? null) : null,
    images: Object.fromEntries(
      job.layout.elements.flatMap((e) => {
        if (e.type !== 'image') return [];
        const url = fixed.get(schoolFilePath(e.fileId));
        return url ? [[e.fileId, url] as const] : [];
      }),
    ),
  };
  const cards: PdfCard[] = sources.map((c, i) => ({ data: c.data, photo: photos[i] ?? null }));

  onProgress?.({ phase: 'render', done: 0, total: cards.length });
  const [{ pdf }, { CardsDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./cards-pdf'),
  ]);
  const element = createElement(CardsDocument, {
    input: {
      title: job.title,
      layout: job.layout,
      assets,
      cards,
      mode: job.mode,
      sheet: job.sheet,
    },
  }) as unknown as ReactElement<DocumentProps>;
  return pdf(element).toBlob();
}

export function saveCardsPdf(blob: Blob, fileName: string): void {
  saveBlob(blob, fileName);
}
