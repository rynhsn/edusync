import type { FieldErrors, FieldIssue } from './form-validation';

/** Nilai bawaan yang sama dengan skema API laporan (apps/api/src/routes/support.ts). */
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const MIN_TEXT = 3;

export const CATEGORIES = ['account', 'billing', 'bug', 'feature', 'data', 'other'] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const STATUSES = ['open', 'in_progress', 'waiting_reporter', 'resolved', 'closed'] as const;

export type TicketCategory = (typeof CATEGORIES)[number];
export type TicketPriority = (typeof PRIORITIES)[number];
export type TicketStatus = (typeof STATUSES)[number];

export interface TicketFormValues {
  subject: string;
  body: string;
}
export type TicketField = keyof TicketFormValues;
export const TICKET_ORDER: TicketField[] = ['subject', 'body'];

const needs = (value: string, max: number, min = MIN_TEXT): FieldIssue | undefined => {
  const v = value.trim();
  if (v.length < min) return { code: 'required' };
  if (v.length > max) return { code: 'tooLong', max };
  return undefined;
};

/** Formulir laporan baru: judul dan penjelasan wajib (minimal 3 karakter), batas panjang mengikuti API. */
export function validateTicket(v: TicketFormValues): FieldErrors<TicketField> {
  const out: FieldErrors<TicketField> = {};
  const subject = needs(v.subject, SUBJECT_MAX);
  const body = needs(v.body, BODY_MAX);
  if (subject) out.subject = subject;
  if (body) out.body = body;
  return out;
}

/** Kotak balasan: tidak boleh kosong, maksimal 5000 karakter. */
export function validateReply(body: string): FieldErrors<'body'> {
  const issue = needs(body, BODY_MAX, 1);
  return issue ? { body: issue } : {};
}

/** Jumlah di lencana menu: 99+ untuk angka besar agar lebar lencana tetap. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Warna lencana status (nada ui-kit). */
export const STATUS_TONE = {
  open: 'sky',
  in_progress: 'violet',
  waiting_reporter: 'amber',
  resolved: 'emerald',
  closed: 'slate',
} as const satisfies Record<TicketStatus, string>;

export const PRIORITY_TONE = {
  low: 'slate',
  normal: 'sky',
  high: 'amber',
  urgent: 'rose',
} as const satisfies Record<TicketPriority, string>;

const PAGE_KEY = 'edusync:support-last-page';

/** Ingat halaman terakhir yang bukan halaman Laporan, supaya laporan baru membawa konteks halamannya. */
export function rememberPage(pathname: string) {
  if (/\/support(\/|$)/.test(pathname)) return;
  try {
    sessionStorage.setItem(PAGE_KEY, pathname.slice(0, 300));
  } catch {
    // Penyimpanan bisa diblokir; konteks halaman hanya pelengkap.
  }
}

export function lastPage(fallback: string): string {
  try {
    return sessionStorage.getItem(PAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}
