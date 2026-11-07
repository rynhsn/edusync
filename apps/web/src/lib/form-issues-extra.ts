/**
 * Aturan isian tambahan (email, alamat web, domain, urutan jam dan tanggal) untuk modul validasi per halaman.
 * Melengkapi lib/form-issues; murni, tanpa React.
 */
import type { FieldIssue } from '@/lib/form-validation';

// Pola yang sama dengan z.email() bawaan zod 4.
const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Email opsional (kosong lolos), maksimal `max` karakter. */
export function optionalEmail(value: string, max = 254): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  if (v.length > max) return { code: 'tooLong', max };
  return EMAIL.test(v) ? undefined : { code: 'email' };
}

/** Email wajib. */
export function requiredEmail(value: string, max = 254): FieldIssue | undefined {
  return value.trim() === '' ? { code: 'required' } : optionalEmail(value, max);
}

/** Alamat web http(s) opsional, seperti `z.url()` dengan protokol http/https. */
export function optionalUrl(value: string, max: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  if (v.length > max) return { code: 'tooLong', max };
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? undefined : { code: 'urlInvalid' };
  } catch {
    return { code: 'urlInvalid' };
  }
}

/** Nama domain/host: label huruf-angka-hubung dipisah titik, minimal dua label (mis. sekolah.sch.id). */
export function hostName(value: string, max = 253): FieldIssue | undefined {
  const v = value.trim().toLowerCase();
  if (v === '') return { code: 'required' };
  if (v.length > max) return { code: 'tooLong', max };
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(v) ? undefined : { code: 'hostInvalid' };
}

/** Jam mulai harus lebih awal dari jam selesai; salah satu kosong berarti lolos. Format HH:MM. */
export function timeAfter(start: string, end: string): FieldIssue | undefined {
  return start && end && start >= end ? { code: 'timeOrder' } : undefined;
}

/** Tanggal selesai tidak boleh sebelum tanggal mulai (TTTT-BB-HH); salah satu kosong berarti lolos. */
export function dateNotBefore(start: string, end: string): FieldIssue | undefined {
  return start && end && end < start ? { code: 'dateOrder' } : undefined;
}
