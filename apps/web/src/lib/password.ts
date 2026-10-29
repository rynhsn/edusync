/** Panjang minimum kata sandi. Sama dengan aturan di API (Better Auth). */
export const MIN_PASSWORD = 12;

export interface PasswordCheck {
  /** Sudah mengetik tetapi kurang dari minimum. */
  tooShort: boolean;
  /** Sudah mengisi ulangan tetapi berbeda dari kata sandi. */
  mismatch: boolean;
  /** Boleh dikirim: cukup panjang dan ulangannya sama. */
  ok: boolean;
}

export function checkPasswords(password: string, confirm: string): PasswordCheck {
  return {
    tooShort: password.length > 0 && password.length < MIN_PASSWORD,
    mismatch: confirm.length > 0 && confirm !== password,
    ok: password.length >= MIN_PASSWORD && confirm === password,
  };
}
