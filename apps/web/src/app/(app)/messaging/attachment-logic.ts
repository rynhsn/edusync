import { ATTACHMENT_MAX_BYTES, type AttachmentMime, detectAttachmentMime } from '@edusync/contracts';

/** Logika murni pemilih lampiran pesan langsung (dipisah agar bisa diuji tanpa React). */

export type AttachmentIssue = 'empty' | 'tooLarge' | 'badType';

/** Periksa isi berkas: ukuran 1..2 MB dan jenis PDF/JPEG/PNG dari magic bytes (bukan dari nama atau `file.type`). */
export function inspectAttachment(bytes: Uint8Array): { mime: AttachmentMime } | { issue: AttachmentIssue } {
  if (bytes.length === 0) return { issue: 'empty' };
  if (bytes.length > ATTACHMENT_MAX_BYTES) return { issue: 'tooLarge' };
  const mime = detectAttachmentMime(bytes);
  return mime ? { mime } : { issue: 'badType' };
}

/** "320 KB" atau "1,5 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
