/**
 * Blok penyusun aturan isian untuk formulir bagian akademik, absensi, penilaian, dan SPMB (murni, tanpa React). Aturan
 * tiap formulir ada di berkas `*-validation.ts` di foldernya dan mengikuti zod di API. Hasilnya `FieldIssue` yang
 * diterjemahkan FieldError: kode bersama dari `formValidation`, atau kode `custom` dengan kunci pesan `areaForms.*`.
 */
import { type FieldErrors, type FieldIssue, normalizePhone } from './form-validation';

/** Pola yang sama dengan z.email() bawaan zod 4 (salinan dari form-validation.ts, yang tidak mengekspornya). */
const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/**
 * Atribut a11y isian tanpa `onBlur`, untuk pemilih (tanggal, jam, dropdown): pemilih kehilangan fokus saat popover
 * terbuka, sehingga blur akan memunculkan "wajib diisi" padahal pengguna baru mau memilih. Galatnya tampil setelah
 * nilai diubah (panggil `touch` di onChange) atau setelah percobaan kirim.
 */
export function withoutBlur<T extends { onBlur: () => void }>(props: T): Omit<T, 'onBlur'> {
  const { onBlur: _onBlur, ...rest } = props;
  return rest;
}

/** Galat dengan pesan lengkap dari berkas pesan (`areaForms.<nama>`). */
export const areaIssue = (name: string, values?: Record<string, string | number>): FieldIssue => ({
  code: 'custom',
  key: `areaForms.${name}`,
  ...(values ? { values } : {}),
});

/** Buang kunci yang tidak bergalat supaya `Object.keys(errors).length` berarti jumlah isian yang salah. */
export function compact<K extends string>(entries: [K, FieldIssue | undefined][]): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const [key, issue] of entries) if (issue) out[key] = issue;
  return out;
}

/** Teks wajib: tidak kosong setelah dipangkas, paling panjang `max`. */
export function requiredText(value: string, max: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return { code: 'required' };
  if (v.length > max) return { code: 'tooLong', max };
  return undefined;
}

/** Teks wajib dengan panjang minimal (mis. nama perangkat: 2 sampai 80). */
export function requiredTextMin(value: string, min: number, max: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return { code: 'required' };
  if (v.length < min) return areaIssue('minLength', { min });
  if (v.length > max) return { code: 'tooLong', max };
  return undefined;
}

/** Teks opsional: boleh kosong, paling panjang `max`. */
export function optionalText(value: string, max: number): FieldIssue | undefined {
  return value.trim().length > max ? { code: 'tooLong', max } : undefined;
}

/** Pilihan wajib (dropdown): tidak boleh kosong. */
export function requiredChoice(value: string): FieldIssue | undefined {
  return value === '' ? { code: 'choose' } : undefined;
}

/** Telepon opsional: paling banyak 30 karakter dan bisa dinormalkan (aturan yang sama dengan API). */
export function optionalPhone(value: string): FieldIssue | undefined {
  if (value.length > 30) return { code: 'tooLong', max: 30 };
  return normalizePhone(value) === undefined ? { code: 'phone' } : undefined;
}

/** Email opsional: kosong atau format sah, paling panjang 254. */
export function optionalEmail(value: string): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  if (v.length > 254) return { code: 'tooLong', max: 254 };
  return EMAIL.test(v) ? undefined : { code: 'email' };
}

/** Tanggal TTTT-BB-HH yang benar-benar ada di kalender. */
export function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Tanggal wajib: dipilih dan sah. */
export function requiredDate(value: string): FieldIssue | undefined {
  if (value === '') return { code: 'required' };
  return isRealDate(value) ? undefined : { code: 'dateInvalid' };
}

/**
 * Angka dari teks (koma desimal diterima sebagai titik). NaN bila kosong atau bukan angka; bilangan pecahan tetap
 * dikembalikan apa adanya supaya pemanggil bisa menolaknya sebagai bukan bulat.
 */
export function parseNumberText(value: string): number {
  const s = value.trim().replace(',', '.');
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Bilangan bulat wajib dalam rentang [min, max]. */
export function requiredInt(value: string, min: number, max: number): FieldIssue | undefined {
  if (value.trim() === '') return { code: 'required' };
  const n = parseNumberText(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { code: 'intInvalid' };
  return n < min || n > max ? { code: 'range', min, max } : undefined;
}

/** Bilangan bulat opsional: kosong boleh, bila diisi harus dalam rentang. */
export function optionalInt(value: string, min: number, max: number): FieldIssue | undefined {
  return value.trim() === '' ? undefined : requiredInt(value, min, max);
}

/** Jam HH:MM 24 jam, seperti regex di API (`/^([01]\d|2[0-3]):[0-5]\d$/`). */
export function isHm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
