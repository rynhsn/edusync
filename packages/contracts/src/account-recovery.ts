/**
 * Identitas masuk (email, nama pengguna, NIK) dan pemulihan kata sandi. Fungsi murni yang dipakai bersama
 * oleh API dan web.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const OTP_LENGTH = 6;
/** Kode pemulihan berlaku 10 menit. */
export const OTP_TTL_SECONDS = 600;
/** Salah memasukkan kode lebih dari ini membuat kode hangus. */
export const OTP_MAX_ATTEMPTS = 5;
/** Jeda minimum antara dua pengiriman kode ke saluran yang sama. */
export const OTP_RESEND_SECONDS = 60;

export type RecoveryChannel = 'email' | 'whatsapp';

export type IdentifierKind = 'email' | 'nik' | 'username' | 'invalid';

export interface ClassifiedIdentifier {
  kind: IdentifierKind;
  /** Nilai yang sudah dirapikan (email dan nama pengguna huruf kecil, NIK 16 digit). */
  value: string;
}

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
const NIK_PATTERN = /^\d{16}$/;

/** Nama pengguna disimpan huruf kecil tanpa spasi di tepi. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 3-30 karakter [a-z0-9._-], dan bukan 16 digit (itu NIK) atau email (tanpa @ otomatis). */
export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(username) &&
    !NIK_PATTERN.test(username)
  );
}

/**
 * Menentukan jenis isian "email, nama pengguna, atau NIK":
 * mengandung "@" = email; tepat 16 digit = NIK; selainnya nama pengguna bila bentuknya sah.
 */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return { kind: 'email', value: trimmed.toLowerCase() };
  if (NIK_PATTERN.test(trimmed)) return { kind: 'nik', value: trimmed };
  const username = normalizeUsername(trimmed);
  if (isValidUsername(username)) return { kind: 'username', value: username };
  return { kind: 'invalid', value: trimmed };
}

/** ri***@gmail.com: dua huruf pertama, ***, lalu domain. Bagian lokal pendek menampilkan lebih sedikit huruf. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = Math.min(2, Math.max(local.length - 1, 0));
  return `${local.slice(0, visible)}***@${domain}`;
}

/**
 * Petunjuk nomor WhatsApp: 4 angka pertama, ****, 3 angka terakhir (6281234567890 -> 6281****890).
 * Nomor di bawah 10 angka menampilkan lebih sedikit angka agar sedikitnya 3 angka tetap tersembunyi.
 */
export function maskPhoneClue(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
  const shown = Math.max(digits.length - 3, 0);
  const head = Math.ceil(shown / 2);
  const tail = shown - head;
  return `${digits.slice(0, head)}****${tail > 0 ? digits.slice(-tail) : ''}`;
}
