import type { CardKind } from '@edusync/contracts';

export const MAX_CARDS_PER_PDF = 300;

/** Potongan nama berkas: huruf kecil, angka, dan tanda hubung. */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Nama berkas PDF, mis. `kartu-siswa-vii-a-2026-11-07.pdf`. */
export function cardsFileName(kind: CardKind, label: string, today: string): string {
  const base = kind === 'student' ? 'kartu-siswa' : 'kartu-ujian';
  return `${[base, slug(label), today].filter(Boolean).join('-')}.pdf`;
}

/** Kemajuan 0..100 untuk batang kemajuan; total 0 dianggap selesai. */
export function percent(done: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
