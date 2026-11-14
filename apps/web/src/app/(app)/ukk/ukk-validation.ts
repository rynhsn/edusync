/**
 * Aturan isian formulir kegiatan UKK (murni, mudah diuji). Mengikuti zod di packages/contracts/src/ukk.ts.
 */

import type { FieldErrors } from '@/lib/form-validation';
import { compactErrors, optionalText, requiredChoice, requiredText } from '../../../lib/form-issues';
import { dateNotBefore } from '../../../lib/form-issues-extra';

export interface EventValues {
  title: string;
  academicYearId: string;
  semesterId: string;
  concentrationId: string;
  schemeName: string;
  lspName: string;
  lspLicenseRef: string;
  tukName: string;
  startsOn: string;
  endsOn: string;
}
export type EventField = keyof EventValues;
export const EVENT_ORDER: EventField[] = [
  'title',
  'academicYearId',
  'semesterId',
  'concentrationId',
  'schemeName',
  'lspName',
  'lspLicenseRef',
  'tukName',
  'startsOn',
  'endsOn',
];

export function validateEvent(v: EventValues): FieldErrors<EventField> {
  return compactErrors<EventField>([
    ['title', requiredText(v.title, 200)],
    ['academicYearId', requiredChoice(v.academicYearId)],
    ['semesterId', requiredChoice(v.semesterId)],
    ['concentrationId', requiredChoice(v.concentrationId)],
    ['schemeName', optionalText(v.schemeName, 200)],
    ['lspName', optionalText(v.lspName, 200)],
    ['lspLicenseRef', optionalText(v.lspLicenseRef, 200)],
    ['tukName', optionalText(v.tukName, 200)],
    ['endsOn', v.startsOn && v.endsOn ? dateNotBefore(v.startsOn, v.endsOn) : undefined],
  ]);
}
