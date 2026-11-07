/**
 * Aturan isian formulir ekstrakurikuler (murni, mudah diuji). Mengikuti zod di
 * apps/api/src/routes/extracurricular.ts dan extracurricular-categories.ts.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compactErrors, optionalText, requiredChoice, requiredText } from '../../../lib/form-issues';
import { timeAfter } from '../../../lib/form-issues-extra';

// ---------------------------------------------------------------------------------------------------------------------
// Ekstrakurikuler

export interface ExtracurricularValues {
  name: string;
  description: string;
  coachType: 'none' | 'teacher' | 'external';
  coachTeacherId: string;
  externalCoach: string;
  startsAt: string;
  endsAt: string;
  location: string;
}
export type ExtracurricularField =
  | 'name'
  | 'description'
  | 'coachTeacherId'
  | 'externalCoach'
  | 'endsAt'
  | 'location';

/** Urutan isian di layar (nama, deskripsi, pembina, jam, lokasi). */
export const EXTRACURRICULAR_ORDER: ExtracurricularField[] = [
  'name',
  'description',
  'coachTeacherId',
  'externalCoach',
  'endsAt',
  'location',
];

export function validateExtracurricular(v: ExtracurricularValues): FieldErrors<ExtracurricularField> {
  return compactErrors<ExtracurricularField>([
    ['name', requiredText(v.name, 100)],
    ['description', optionalText(v.description, 500)],
    ['coachTeacherId', v.coachType === 'teacher' ? requiredChoice(v.coachTeacherId) : undefined],
    ['externalCoach', v.coachType === 'external' ? requiredText(v.externalCoach, 100) : undefined],
    ['endsAt', timeAfter(v.startsAt, v.endsAt)],
    ['location', optionalText(v.location, 100)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Kategori

export interface CategoryValues {
  label: string;
}
export type CategoryField = keyof CategoryValues;
export const CATEGORY_ORDER: CategoryField[] = ['label'];

/** Urutan (`sort`) dihitung otomatis oleh formulir, jadi hanya nama yang diperiksa. */
export function validateCategory(v: CategoryValues): FieldErrors<CategoryField> {
  return compactErrors<CategoryField>([['label', requiredText(v.label, 50)]]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pertemuan

export interface SessionValues {
  date: string;
  topic: string;
}
export type SessionField = keyof SessionValues;
export const SESSION_ORDER: SessionField[] = ['date', 'topic'];

export function validateSession(v: SessionValues): FieldErrors<SessionField> {
  return compactErrors<SessionField>([
    ['date', requiredText(v.date, 10)],
    ['topic', optionalText(v.topic, 200)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tambah anggota: pilih kelas lalu minimal satu siswa

export interface AddMembersValues {
  classId: string;
  picked: number;
}
export type AddMembersField = 'classId' | 'picked';
export const ADD_MEMBERS_ORDER: AddMembersField[] = ['classId', 'picked'];

export function validateAddMembers(v: AddMembersValues): FieldErrors<AddMembersField> {
  const pick: FieldIssue | undefined = v.classId !== '' && v.picked === 0 ? { code: 'choose' } : undefined;
  return compactErrors<AddMembersField>([
    ['classId', requiredChoice(v.classId)],
    ['picked', pick],
  ]);
}
