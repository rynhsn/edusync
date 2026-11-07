/**
 * Aturan isian jam pelajaran (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/schedule.ts.
 * Bentrok antarjam pelajaran diperiksa server (galat tampil di dialog).
 */

import type { FieldErrors } from '@/lib/form-validation';
import { compactErrors, intInRange, requiredText } from '../../../lib/form-issues';
import { timeAfter } from '../../../lib/form-issues-extra';

export interface GenerateValues {
  firstStart: string;
  count: string;
  minutes: string;
  breakAfter: string;
  breakMinutes: string;
}
export type GenerateField = keyof GenerateValues;
export const GENERATE_ORDER: GenerateField[] = [
  'firstStart',
  'count',
  'minutes',
  'breakAfter',
  'breakMinutes',
];

/** Istirahat opsional: lama istirahat hanya diperiksa bila "istirahat setelah jam ke-" diisi. */
export function validateGenerate(v: GenerateValues): FieldErrors<GenerateField> {
  const hasBreak = v.breakAfter.trim() !== '';
  return compactErrors<GenerateField>([
    ['firstStart', requiredText(v.firstStart, 5)],
    ['count', intInRange(v.count, 1, 14, { required: true })],
    ['minutes', intInRange(v.minutes, 10, 120, { required: true })],
    ['breakAfter', intInRange(v.breakAfter, 1, 13, { required: false })],
    ['breakMinutes', hasBreak ? intInRange(v.breakMinutes, 5, 90, { required: true }) : undefined],
  ]);
}

export interface PeriodValues {
  number: string;
  startsAt: string;
  endsAt: string;
}
export type PeriodField = keyof PeriodValues;
export const PERIOD_ORDER: PeriodField[] = ['number', 'startsAt', 'endsAt'];

export function validatePeriod(v: PeriodValues): FieldErrors<PeriodField> {
  return compactErrors<PeriodField>([
    ['number', intInRange(v.number, 1, 20, { required: true })],
    ['startsAt', requiredText(v.startsAt, 5)],
    ['endsAt', requiredText(v.endsAt, 5) ?? timeAfter(v.startsAt, v.endsAt)],
  ]);
}
