/**
 * Aturan isian kartu RFID, sama dengan zod di apps/api/src/routes/gate.ts (POST /v1/attendance/cards):
 * siswa wajib dipilih, kode kartu 4..64 karakter setelah dipangkas.
 */
import { compact, requiredChoice, requiredTextMin } from '../../../../lib/area-rules';
import type { FieldErrors } from '../../../../lib/form-validation';

export interface CardValues {
  studentId: string;
  code: string;
}
export type CardField = keyof CardValues;
export const CARD_ORDER: CardField[] = ['studentId', 'code'];

export function validateCard(v: CardValues): FieldErrors<CardField> {
  return compact<CardField>([
    ['studentId', requiredChoice(v.studentId)],
    ['code', requiredTextMin(v.code, 4, 64)],
  ]);
}
