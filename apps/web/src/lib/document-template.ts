import {
  DEFAULT_SIGNATURE_SLOTS,
  DOCUMENT_SECTIONS,
  type DocumentTemplateConfig,
  type DocumentTemplateKind,
  MAX_SIGNATURE_SLOTS,
  type SignatureSlot,
  validateDocumentTemplate,
} from '@edusync/contracts';

/**
 * Logika murni editor templat dokumen (tanpa React): isian formulir <-> config API, penyisipan variabel, dan
 * pemeriksaan sebelum simpan. Aturan variabel dan bagian ada di packages/contracts/src/document-template.ts.
 */

export type TextKey = 'title' | 'subtitle' | 'intro' | 'body';

export interface DocumentDraft {
  title: string;
  subtitle: string;
  intro: string;
  body: string;
  /** Semua bagian jenis ini: true = tampil. */
  sections: Record<string, boolean>;
  /** false = tanda tangan bawaan. */
  customSignatures: boolean;
  slots: SignatureSlot[];
}

/** Teks yang dapat diatur per jenis dokumen (SKL tidak punya subjudul). */
export const TEXT_FIELDS: Record<DocumentTemplateKind, TextKey[]> = {
  skl: ['title', 'intro', 'body'],
  pkl_certificate: ['title', 'subtitle', 'intro', 'body'],
};

export function toDraft(kind: DocumentTemplateKind, c: DocumentTemplateConfig): DocumentDraft {
  return {
    title: c.title ?? '',
    subtitle: c.subtitle ?? '',
    intro: c.intro ?? '',
    body: c.body ?? '',
    sections: Object.fromEntries(DOCUMENT_SECTIONS[kind].map((k) => [k, c.sections[k] !== false])),
    customSignatures: c.signatures !== null,
    slots: (c.signatures ?? DEFAULT_SIGNATURE_SLOTS[kind]).map((s) => ({ ...s })),
  };
}

/** Isian kosong = bawaan (null); hanya bagian yang dimatikan disimpan. */
export function toConfig(kind: DocumentTemplateKind, d: DocumentDraft): DocumentTemplateConfig {
  const fields = TEXT_FIELDS[kind];
  const text = (k: TextKey) => (fields.includes(k) && d[k].trim() !== '' ? d[k].trim() : null);
  return {
    title: text('title'),
    subtitle: text('subtitle'),
    intro: text('intro'),
    body: text('body'),
    sections: Object.fromEntries(
      DOCUMENT_SECTIONS[kind].flatMap((k) => (d.sections[k] === false ? [[k, false] as const] : [])),
    ),
    signatures: d.customSignatures
      ? d.slots.slice(0, MAX_SIGNATURE_SLOTS).map((s) => ({
          label: s.label.trim(),
          name: s.name.trim(),
          note: s.note.trim(),
          placeDate: s.placeDate,
        }))
      : null,
  };
}

/** Kunci isian yang dapat diisi variabel: teks utama atau `slot:<indeks>:<label|name|note>`. */
export type FieldKey = TextKey | `slot:${number}:${'label' | 'name' | 'note'}`;

export function getField(d: DocumentDraft, key: FieldKey): string {
  if (!key.startsWith('slot:')) return d[key as TextKey];
  const [, i, f] = key.split(':');
  return d.slots[Number(i)]?.[f as 'label' | 'name' | 'note'] ?? '';
}

export function setField(d: DocumentDraft, key: FieldKey, value: string): DocumentDraft {
  if (!key.startsWith('slot:')) return { ...d, [key]: value };
  const [, i, f] = key.split(':');
  return {
    ...d,
    slots: d.slots.map((s, n) => (n === Number(i) ? { ...s, [f as 'label' | 'name' | 'note']: value } : s)),
  };
}

/** Variabel yang akan ditolak API (tak dikenal), untuk ditampilkan sebelum simpan. */
export function draftIssues(kind: DocumentTemplateKind, d: DocumentDraft) {
  return validateDocumentTemplate(kind, toConfig(kind, d));
}

export function addSlot(d: DocumentDraft): DocumentDraft {
  if (d.slots.length >= MAX_SIGNATURE_SLOTS) return d;
  return { ...d, slots: [...d.slots, { label: '', name: '', note: '', placeDate: false }] };
}

export function removeSlot(d: DocumentDraft, index: number): DocumentDraft {
  return { ...d, slots: d.slots.filter((_, i) => i !== index) };
}
