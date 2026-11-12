import type { QueryClient } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from './format-date';

/**
 * Logika murni untuk konfigurasi nilai per semester (pembekuan). Tanpa React dan tanpa jaringan supaya mudah diuji.
 * Penjelasan istilah untuk pengguna: "beku" berarti aturan nilai semester itu tersimpan sendiri, jadi rapor yang sudah
 * terbit tidak berubah walau aturan sekolah diubah kemudian.
 */

/** Asal salinan beku, sama dengan yang dikirim server. Nilai tak dikenal diperlakukan sebagai `unknown`. */
const ORIGINS = ['finalize', 'semester_closed', 'sync', 'backfill', 'manual'] as const;
export type FreezeOriginKey = (typeof ORIGINS)[number] | 'unknown';

/** Kunci terjemahan (namespace `grades`) untuk asal pembekuan; asal baru dari server jatuh ke teks netral. */
export function originMessageKey(origin: string | null | undefined): `freezeOrigin_${FreezeOriginKey}` {
  return `freezeOrigin_${(ORIGINS as readonly string[]).includes(origin ?? '') ? (origin as FreezeOriginKey) : 'unknown'}`;
}

export interface SemesterConfigStatus {
  frozen: boolean;
  matchesLive: boolean;
  finalReportCount: number;
}

/**
 * Tombol "Samakan dengan aturan hari ini":
 * - `none`: tak ada yang perlu disamakan (semester masih hidup, atau salinan sudah sama dengan aturan hari ini);
 * - `sync`: salinan berbeda dan tidak ada rapor final, jadi boleh disamakan;
 * - `blocked`: salinan berbeda tetapi ada rapor final, server akan menolak (buka kembali rapornya dulu).
 */
export function syncAction(s: SemesterConfigStatus): 'none' | 'sync' | 'blocked' {
  if (!s.frozen || s.matchesLive) return 'none';
  return s.finalReportCount > 0 ? 'blocked' : 'sync';
}

/**
 * Nama kelas dari pesan galat `report_final` server. Dua bentuk pesan dikenali:
 * "... masih ada rapor final: 7A, 7B. Buka kembali ..." (sinkron semester) dan
 * "Rapor kelas 7A pada semester ini sudah difinalkan ..." / "Rapor kelas-kelas 7A, 7B pada ..." (penulisan data).
 * Daftar kosong bila pesan tidak dikenali, supaya pemanggil memakai teks tanpa nama kelas.
 */
export function classNamesFromReportFinal(message: string | null | undefined): string[] {
  if (!message) return [];
  const m =
    /rapor final:\s*(.+?)\.\s*(?:Buka kembali|$)/i.exec(message) ??
    /Rapor kelas(?:-kelas)?\s+(.+?)\s+pada semester/i.exec(message);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
}

/** `syncedSemesterId` dari badan respons tulis konfigurasi (tulis-tembus ke semester aktif yang beku); null bila tidak ada. */
export function syncedSemesterIdOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const id = (body as { syncedSemesterId?: unknown }).syncedSemesterId;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** Angka berasal dari rapor yang sudah final (bukan dihitung ulang)? Server hanya mengirim `source: 'report'`. */
export function isFromReport(x: { source?: string | undefined } | null | undefined): boolean {
  return x?.source === 'report';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal dan jam (waktu setempat) untuk waktu pembekuan, mis. "13 November 2026, 09.05". */
export function formatFrozenAt(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const sep = locale === 'en' ? ':' : '.';
  return `${formatCalendarDate(locale, day)}, ${pad(d.getHours())}${sep}${pad(d.getMinutes())}`;
}

/** Cache yang bergantung pada konfigurasi nilai; disegarkan setelah konfigurasi berubah atau disamakan. */
export function invalidateGradingConfig(queryClient: QueryClient, schoolId: string): void {
  for (const root of ['grading-semester-config', 'grading-settings', 'grading-components', 'grading-recap']) {
    queryClient.invalidateQueries({ queryKey: [root, schoolId] });
  }
  // Pratinjau KKM memakai kunci ['kktp', 'resolve', ...], jadi cukup akar.
  queryClient.invalidateQueries({ queryKey: ['kktp'] });
}
