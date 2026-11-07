/**
 * Aturan isian penyunting pengumuman (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/announcements.ts:
 * judul 1-150, isi 1-5000, keduanya teks biasa (tag HTML ditolak), agenda wajib bertanggal acara.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compactErrors, customIssue, requiredText } from '../../../lib/form-issues';

export const ANNOUNCEMENT_MAX_BODY = 5000;

// Sama dengan HTML_LIKE di API.
const HTML_LIKE = /<\s*\/?\s*[a-z!?]/i;

const plain = (value: string, max: number): FieldIssue | undefined =>
  requiredText(value, max) ??
  (HTML_LIKE.test(value.trim()) ? customIssue('announcements.noHtml') : undefined);

export interface AnnouncementValues {
  title: string;
  body: string;
  category: string;
  eventDate: string;
}
export type AnnouncementField = 'title' | 'eventDate' | 'body';
export const ANNOUNCEMENT_ORDER: AnnouncementField[] = ['title', 'eventDate', 'body'];

export function validateAnnouncement(v: AnnouncementValues): FieldErrors<AnnouncementField> {
  return compactErrors<AnnouncementField>([
    ['title', plain(v.title, 150)],
    ['eventDate', v.category === 'agenda' && v.eventDate === '' ? { code: 'required' } : undefined],
    ['body', plain(v.body, ANNOUNCEMENT_MAX_BODY)],
  ]);
}
