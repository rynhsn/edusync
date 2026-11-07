/**
 * Aturan isian formulir PKL (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/pkl.ts.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import {
  compactErrors,
  intInRange,
  optionalText,
  requiredChoice,
  requiredText,
} from '../../../lib/form-issues';
import { dateNotBefore, optionalEmail } from '../../../lib/form-issues-extra';

// Mitra -----------------------------------------------------------------------------------------------------------------

export interface PartnerValues {
  name: string;
  field: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
}
export type PartnerField = keyof PartnerValues;
export const PARTNER_ORDER: PartnerField[] = ['name', 'field', 'contactName', 'phone', 'email', 'address'];

export function validatePartner(v: PartnerValues): FieldErrors<PartnerField> {
  return compactErrors<PartnerField>([
    ['name', requiredText(v.name, 160)],
    ['field', optionalText(v.field, 120)],
    ['contactName', optionalText(v.contactName, 120)],
    ['phone', optionalText(v.phone, 30)],
    ['email', optionalEmail(v.email, 254)],
    ['address', optionalText(v.address, 300)],
  ]);
}

// Periode ---------------------------------------------------------------------------------------------------------------

export interface PeriodValues {
  name: string;
  academicYearId: string;
  startsOn: string;
  endsOn: string;
}
export type PeriodField = keyof PeriodValues;
export const PERIOD_ORDER: PeriodField[] = ['name', 'academicYearId', 'startsOn', 'endsOn'];

export function validatePeriod(v: PeriodValues): FieldErrors<PeriodField> {
  return compactErrors<PeriodField>([
    ['name', requiredText(v.name, 120)],
    ['academicYearId', requiredChoice(v.academicYearId)],
    ['startsOn', requiredText(v.startsOn, 10)],
    ['endsOn', requiredText(v.endsOn, 10) ?? dateNotBefore(v.startsOn, v.endsOn)],
  ]);
}

// Aspek penilaian -------------------------------------------------------------------------------------------------------

export interface AspectValues {
  name: string;
  weight: string;
}
export type AspectField = keyof AspectValues;
export const ASPECT_ORDER: AspectField[] = ['name', 'weight'];

export function validateAspect(v: AspectValues): FieldErrors<AspectField> {
  return compactErrors<AspectField>([
    ['name', requiredText(v.name, 120)],
    ['weight', intInRange(v.weight, 1, 100, { required: true })],
  ]);
}

// Ambang predikat -------------------------------------------------------------------------------------------------------

export type ThresholdKey = 'A' | 'B' | 'C';
export const THRESHOLD_ORDER: ThresholdKey[] = ['A', 'B', 'C'];

/** Tiap ambang bilangan bulat 1-100. Urutan A > B > C diperiksa terpisah (pesan sendiri di kartu). */
export function validateThresholds(v: Record<ThresholdKey, string>): FieldErrors<ThresholdKey> {
  return compactErrors<ThresholdKey>(
    THRESHOLD_ORDER.map(
      (k) => [k, intInRange(v[k], 1, 100, { required: true })] as [ThresholdKey, FieldIssue | undefined],
    ),
  );
}

/** A harus lebih besar dari B, dan B lebih besar dari C. */
export function thresholdsOrdered(v: Record<ThresholdKey, string>): boolean {
  return Number(v.A) > Number(v.B) && Number(v.B) > Number(v.C);
}

// Sertifikat ------------------------------------------------------------------------------------------------------------

export interface CertificateValues {
  place: string;
  date: string;
  principal: string;
}
export type CertificateField = keyof CertificateValues;
export const CERTIFICATE_ORDER: CertificateField[] = ['place', 'date', 'principal'];

export function validateCertificate(v: CertificateValues): FieldErrors<CertificateField> {
  return compactErrors<CertificateField>([
    ['place', optionalText(v.place, 80)],
    ['date', requiredText(v.date, 10)],
    ['principal', optionalText(v.principal, 120)],
  ]);
}

// Kunjungan dan jurnal --------------------------------------------------------------------------------------------------

export interface VisitValues {
  date: string;
  notes: string;
}
export type VisitField = keyof VisitValues;
export const VISIT_ORDER: VisitField[] = ['date', 'notes'];

export function validateVisit(v: VisitValues): FieldErrors<VisitField> {
  return compactErrors<VisitField>([
    ['date', requiredText(v.date, 10)],
    ['notes', requiredText(v.notes, 2000)],
  ]);
}

export interface JournalValues {
  date: string;
  activity: string;
}
export type JournalField = keyof JournalValues;
export const JOURNAL_ORDER: JournalField[] = ['date', 'activity'];

export function validateJournal(v: JournalValues): FieldErrors<JournalField> {
  return compactErrors<JournalField>([
    ['date', requiredText(v.date, 10)],
    ['activity', requiredText(v.activity, 2000)],
  ]);
}

// Penempatan ------------------------------------------------------------------------------------------------------------

export interface PlaceValues {
  periodId: string;
  partnerId: string;
  picked: number;
  indName: string;
  indPhone: string;
}
export type PlaceField = 'periodId' | 'partnerId' | 'indName' | 'indPhone' | 'picked';
export const PLACE_ORDER: PlaceField[] = ['periodId', 'partnerId', 'indName', 'indPhone', 'picked'];

export function validatePlace(v: PlaceValues): FieldErrors<PlaceField> {
  return compactErrors<PlaceField>([
    ['periodId', requiredChoice(v.periodId)],
    ['partnerId', requiredChoice(v.partnerId)],
    ['indName', optionalText(v.indName, 120)],
    ['indPhone', optionalText(v.indPhone, 30)],
    ['picked', v.picked === 0 ? { code: 'choose' } : undefined],
  ]);
}

export interface PlacementEditValues {
  partnerId: string;
  indName: string;
  indPhone: string;
}
export type PlacementEditField = 'partnerId' | 'indName' | 'indPhone';
export const PLACEMENT_EDIT_ORDER: PlacementEditField[] = ['partnerId', 'indName', 'indPhone'];

export function validatePlacementEdit(v: PlacementEditValues): FieldErrors<PlacementEditField> {
  return compactErrors<PlacementEditField>([
    ['partnerId', requiredChoice(v.partnerId)],
    ['indName', optionalText(v.indName, 120)],
    ['indPhone', optionalText(v.indPhone, 30)],
  ]);
}
