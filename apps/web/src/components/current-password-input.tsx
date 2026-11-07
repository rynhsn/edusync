'use client';

import { useEffect, useRef, useState } from 'react';
import { PasswordInput } from '@/components/password-input';

type Props = Omit<
  React.ComponentProps<typeof PasswordInput>,
  'value' | 'onChange' | 'autoComplete' | 'readOnly' | 'name'
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Saat-saat setelah dipasang ketika isian yang masuk sendiri (isi otomatis) masih dibuang. */
const CLEAR_AT_MS = [0, 100, 400, 1000, 2500];

/**
 * Kolom "kata sandi saat ini" untuk formulir ganti kata sandi. Pemilik akun sedang masuk, jadi kolom ini TIDAK
 * boleh terisi sendiri oleh peramban atau pengelola kata sandi (`autoComplete="off"` diabaikan Chrome untuk kolom
 * kata sandi). Beberapa lapis dipakai bersama:
 * - `name` dan `id` yang tidak baku (jangan dinamai `password`/`current-password`);
 * - `autoComplete="new-password"` (cara paling andal agar Chrome tidak menawarkan sandi tersimpan);
 * - `readOnly` sampai kolom pertama kali difokuskan (peramban tidak mengisi kolom baca-saja);
 * - atribut abai 1Password (`data-1p-ignore`), LastPass (`data-lpignore`), Bitwarden (`data-bwignore`), dan
 *   `data-form-type="other"`;
 * - nilai dikosongkan lagi beberapa kali setelah dipasang bila ada isi yang masuk sebelum pengguna mengetik.
 * Label yang tampil dan tombol lihat/sembunyikan tetap ada (dari PasswordInput).
 */
export function CurrentPasswordInput({ value, onValueChange, onFocus, onKeyDown, onPaste, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const [locked, setLocked] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dijalankan sekali saat dipasang; onValueChange hanya dipanggil bila perlu.
  useEffect(() => {
    const timers = CLEAR_AT_MS.map((ms) =>
      setTimeout(() => {
        const input = ref.current;
        if (touched.current || !input || input.value === '') return;
        input.value = '';
        onValueChange('');
      }, ms),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return (
    <PasswordInput
      {...props}
      ref={ref}
      name="verifikasi-sandi-lama"
      autoComplete="new-password"
      readOnly={locked}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onFocus={(event) => {
        // Langsung di DOM juga, supaya papan ketik ponsel tidak menganggap kolom ini baca-saja.
        event.currentTarget.readOnly = false;
        setLocked(false);
        onFocus?.(event);
      }}
      onKeyDown={(event) => {
        touched.current = true;
        onKeyDown?.(event);
      }}
      onPaste={(event) => {
        touched.current = true;
        onPaste?.(event);
      }}
      data-1p-ignore
      data-lpignore="true"
      data-bwignore
      data-form-type="other"
    />
  );
}
