/**
 * Aturan isian formulir kegiatan kalender (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/calendar.ts.
 * Rentang tanggal terhadap tahun ajaran diperiksa server (galat tampil di dialog).
 */

import type { FieldErrors } from '@/lib/form-validation';
import { compactErrors, requiredText } from '../../../lib/form-issues';
import { dateNotBefore } from '../../../lib/form-issues-extra';

export interface EventValues {
  title: string;
  startsOn: string;
  endsOn: string;
}
export type EventField = keyof EventValues;
export const EVENT_ORDER: EventField[] = ['title', 'startsOn', 'endsOn'];

/** Tanggal selesai boleh kosong (berarti satu hari); bila diisi tidak boleh sebelum tanggal mulai. */
export function validateEvent(v: EventValues): FieldErrors<EventField> {
  return compactErrors<EventField>([
    ['title', requiredText(v.title, 120)],
    ['startsOn', requiredText(v.startsOn, 10)],
    ['endsOn', dateNotBefore(v.startsOn, v.endsOn)],
  ]);
}
