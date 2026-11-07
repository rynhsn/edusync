/**
 * Pembantu aturan isian yang dipakai bersama oleh modul validasi per halaman (ujian, surat). Murni, tanpa React.
 * Bentuk hasilnya sama dengan lib/form-validation: FieldIssue atau undefined bila isian benar.
 */
import type { FieldErrors, FieldIssue } from './form-validation';

/** Galat dengan pesan sendiri: `key` adalah kunci lengkap di berkas pesan (mis. `examForm.pickClasses`). */
export const customIssue = (key: string, values?: Record<string, string | number>): FieldIssue => ({
  code: 'custom',
  key,
  values,
});

/** Teks wajib: tidak kosong setelah dipangkas dan tidak lebih dari `max` (sama dengan `.trim().min(1).max(n)` di zod). */
export function requiredText(value: string, max: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return { code: 'required' };
  return v.length > max ? { code: 'tooLong', max } : undefined;
}

/** Teks opsional: hanya dibatasi panjangnya. */
export function optionalText(value: string, max: number): FieldIssue | undefined {
  return value.trim().length > max ? { code: 'tooLong', max } : undefined;
}

/** Pilihan wajib (isian <select>): kosong berarti belum memilih. */
export function requiredChoice(value: string): FieldIssue | undefined {
  return value === '' ? { code: 'choose' } : undefined;
}

/**
 * Bilangan bulat dalam rentang [min, max] dari isian teks. Kosong: `required` bila wajib, selain itu lolos.
 * Menolak pecahan, huruf, dan notasi ilmiah ("1e3"), seperti `z.number().int()` pada angka yang dikirim.
 */
export function intInRange(
  value: string,
  min: number,
  max: number,
  options: { required: boolean },
): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return options.required ? { code: 'required' } : undefined;
  if (!/^-?\d+$/.test(v)) return { code: 'intInvalid' };
  const n = Number(v);
  return n < min || n > max ? { code: 'range', min, max } : undefined;
}

/**
 * Angka (boleh desimal, koma atau titik) dalam rentang [min, max]. Kosong lolos; pemanggil yang menentukan
 * apakah kosong berarti "belum dinilai". Mengembalikan angkanya bila valid lewat `parseDecimal`.
 */
export function parseDecimal(value: string): number | undefined {
  const v = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function decimalInRange(value: string, min: number, max: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  const n = parseDecimal(v);
  if (n === undefined) return customIssue('formIssues.notNumber');
  return n < min || n > max ? { code: 'range', min, max } : undefined;
}

/** Jam HH:MM 24 jam (sama dengan regex di API). Kosong lolos. */
export function timeOfDay(value: string): FieldIssue | undefined {
  if (value === '') return undefined;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? undefined : customIssue('formIssues.badTime');
}

/** Buang kunci tanpa galat, supaya `Object.keys(errors).length` berarti jumlah isian yang salah. */
export function compactErrors<K extends string>(entries: [K, FieldIssue | undefined][]): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const [key, issue] of entries) if (issue) out[key] = issue;
  return out;
}
