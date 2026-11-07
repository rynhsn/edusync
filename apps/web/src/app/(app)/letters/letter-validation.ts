/**
 * Aturan isian formulir surat di sisi klien (murni, tanpa React). Mengikuti zod di apps/api/src/routes/letters.ts:
 * surat keluar/masuk (`letterCreateBody`, `letterUpdateBody`), penandatangan (`signerCreateBody`), templat
 * (`templateBody`). Penomoran memakai validateNumberPattern dari @edusync/contracts langsung di kartunya. Tambahan klien yang lebih ketat dari API: badan surat keluar wajib diisi
 * (API menerima draf tanpa isi), dan tanggal surat wajib ada.
 */
import {
  compactErrors,
  customIssue,
  optionalText,
  requiredChoice,
  requiredText,
} from '../../../lib/form-issues';
import type { FieldErrors, FieldIssue } from '../../../lib/form-validation';

const dateIssue = (value: string): FieldIssue | undefined => {
  if (value === '') return { code: 'required' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return { code: 'dateInvalid' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? undefined : { code: 'dateInvalid' };
};

// Surat keluar (penyusun)
export interface OutgoingValues {
  subject: string;
  party: string;
  letterDate: string;
  body: string;
}
export type OutgoingField = keyof OutgoingValues;
export const OUTGOING_ORDER: OutgoingField[] = ['subject', 'party', 'letterDate', 'body'];

export function validateOutgoing(v: OutgoingValues): FieldErrors<OutgoingField> {
  return compactErrors<OutgoingField>([
    ['subject', requiredText(v.subject, 200)],
    ['party', requiredText(v.party, 200)],
    ['letterDate', dateIssue(v.letterDate)],
    ['body', requiredText(v.body, 20_000)],
  ]);
}

// Surat masuk
export interface IncomingValues {
  number: string;
  letterDate: string;
  subject: string;
  party: string;
  body: string;
  note: string;
}
export type IncomingField = keyof IncomingValues;
export const INCOMING_ORDER: IncomingField[] = ['number', 'letterDate', 'subject', 'party', 'body', 'note'];

export function validateIncoming(v: IncomingValues): FieldErrors<IncomingField> {
  return compactErrors<IncomingField>([
    ['number', optionalText(v.number, 100)],
    ['letterDate', dateIssue(v.letterDate)],
    ['subject', requiredText(v.subject, 200)],
    ['party', requiredText(v.party, 200)],
    ['body', optionalText(v.body, 20_000)],
    ['note', optionalText(v.note, 2000)],
  ]);
}

// Penandatangan
export interface SignerValues {
  /** Hanya diperiksa saat membuat (`creating`). */
  memberId: string;
  name: string;
  title: string;
  nip: string;
}
export type SignerField = keyof SignerValues;
export const SIGNER_ORDER: SignerField[] = ['memberId', 'name', 'title', 'nip'];

export function validateSigner(v: SignerValues, creating: boolean): FieldErrors<SignerField> {
  return compactErrors<SignerField>([
    ['memberId', creating ? requiredChoice(v.memberId) : undefined],
    ['name', requiredText(v.name, 120)],
    ['title', requiredText(v.title, 120)],
    ['nip', optionalText(v.nip, 40)],
  ]);
}

// Pencabutan tanda tangan (alasan 3..500 karakter, sama dengan API)
export type RevokeField = 'reason';
export function validateRevoke(reason: string): FieldErrors<RevokeField> {
  const v = reason.trim();
  return compactErrors<RevokeField>([
    [
      'reason',
      v === ''
        ? { code: 'required' }
        : v.length < 3
          ? customIssue('letterForm.reasonShort')
          : v.length > 500
            ? { code: 'tooLong', max: 500 }
            : undefined,
    ],
  ]);
}

// Templat
export interface TemplateValues {
  name: string;
  body: string;
}
export type TemplateField = keyof TemplateValues;
export const TEMPLATE_ORDER: TemplateField[] = ['name', 'body'];

export function validateTemplate(v: TemplateValues): FieldErrors<TemplateField> {
  return compactErrors<TemplateField>([
    ['name', requiredText(v.name, 120)],
    ['body', requiredText(v.body, 20_000)],
  ]);
}
