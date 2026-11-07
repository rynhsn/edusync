/**
 * Aturan isian penilaian, sama dengan zod di apps/api/src/routes/grading.ts:
 * - penilaian: komponen wajib dipilih, judul wajib (maks. 120), tanggal wajib, nilai maksimal bilangan bulat 1..1000;
 * - komponen nilai: nama wajib (maks. 60), bobot bulat 1..100, urutan bulat 0..1000 (kosong = 0);
 * - KKM dan batas predikat: bulat 1..100 dan A > B > C (server: `predicateA > predicateB > predicateC > 0`).
 * Perbedaan dari isian lama: nilai maksimal desimal dan KKM 0 tidak lagi lolos di klien karena memang ditolak API.
 */
import {
  areaIssue,
  compact,
  optionalInt,
  parseNumberText,
  requiredChoice,
  requiredDate,
  requiredInt,
  requiredText,
} from '../../../lib/area-rules';
import type { FieldErrors } from '../../../lib/form-validation';

export interface AssessmentValues {
  componentId: string;
  title: string;
  date: string;
  maxScore: string;
}
export type AssessmentField = keyof AssessmentValues;
export const ASSESSMENT_ORDER: AssessmentField[] = ['componentId', 'title', 'date', 'maxScore'];

export function validateAssessment(v: AssessmentValues): FieldErrors<AssessmentField> {
  return compact<AssessmentField>([
    ['componentId', requiredChoice(v.componentId)],
    ['title', requiredText(v.title, 120)],
    ['date', requiredDate(v.date)],
    ['maxScore', requiredInt(v.maxScore, 1, 1000)],
  ]);
}

export interface ComponentValues {
  name: string;
  weight: string;
  sort: string;
}
export type ComponentField = keyof ComponentValues;
export const COMPONENT_ORDER: ComponentField[] = ['name', 'weight', 'sort'];

export function validateComponent(v: ComponentValues): FieldErrors<ComponentField> {
  return compact<ComponentField>([
    ['name', requiredText(v.name, 60)],
    ['weight', requiredInt(v.weight, 1, 100)],
    ['sort', optionalInt(v.sort, 0, 1000)],
  ]);
}

export interface ThresholdValues {
  kkm: string;
  predicateA: string;
  predicateB: string;
  predicateC: string;
}
export type ThresholdField = keyof ThresholdValues;
export const THRESHOLD_ORDER: ThresholdField[] = ['kkm', 'predicateA', 'predicateB', 'predicateC'];

export function validateThresholds(v: ThresholdValues): FieldErrors<ThresholdField> {
  const base = {
    kkm: requiredInt(v.kkm, 1, 100),
    predicateA: requiredInt(v.predicateA, 1, 100),
    predicateB: requiredInt(v.predicateB, 1, 100),
    predicateC: requiredInt(v.predicateC, 1, 100),
  };
  const a = parseNumberText(v.predicateA);
  const b = parseNumberText(v.predicateB);
  const c = parseNumberText(v.predicateC);
  const order = areaIssue('predicateOrder');
  return compact<ThresholdField>([
    ['kkm', base.kkm],
    ['predicateA', base.predicateA ?? (!base.predicateB && a <= b ? order : undefined)],
    ['predicateB', base.predicateB ?? (!base.predicateC && b <= c ? order : undefined)],
    ['predicateC', base.predicateC],
  ]);
}
