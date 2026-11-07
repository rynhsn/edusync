/**
 * Aturan isian formulir tahfidz (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/tahfidz.ts.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import {
  compactErrors,
  customIssue,
  optionalText,
  requiredChoice,
  requiredText,
} from '../../../lib/form-issues';

// Halaqah ---------------------------------------------------------------------------------------------------------------

export interface HalaqahValues {
  name: string;
  scheduleNote: string;
}
export type HalaqahField = keyof HalaqahValues;
export const HALAQAH_ORDER: HalaqahField[] = ['name', 'scheduleNote'];

export function validateHalaqah(v: HalaqahValues): FieldErrors<HalaqahField> {
  return compactErrors<HalaqahField>([
    ['name', requiredText(v.name, 100)],
    ['scheduleNote', optionalText(v.scheduleNote, 200)],
  ]);
}

// Butir ibadah ----------------------------------------------------------------------------------------------------------

export interface IbadahItemValues {
  name: string;
}
export type IbadahItemField = keyof IbadahItemValues;
export const IBADAH_ITEM_ORDER: IbadahItemField[] = ['name'];

export function validateIbadahItem(v: IbadahItemValues): FieldErrors<IbadahItemField> {
  return compactErrors<IbadahItemField>([['name', requiredText(v.name, 100)]]);
}

// Tambah anggota halaqah ------------------------------------------------------------------------------------------------

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

// Setoran ---------------------------------------------------------------------------------------------------------------

export interface EntryValues {
  studentId: string;
  date: string;
  /** Hasil validRange() dari @edusync/contracts untuk rentang surat dan ayat. */
  rangeValid: boolean;
  note: string;
}
export type EntryField = 'studentId' | 'date' | 'ayahTo' | 'note';
export const ENTRY_ORDER: EntryField[] = ['studentId', 'date', 'ayahTo', 'note'];

export function validateEntry(v: EntryValues): FieldErrors<EntryField> {
  return compactErrors<EntryField>([
    ['studentId', requiredChoice(v.studentId)],
    ['date', requiredText(v.date, 10)],
    ['ayahTo', v.rangeValid ? undefined : customIssue('tahfidz.rangeInvalid')],
    ['note', optionalText(v.note, 300)],
  ]);
}
