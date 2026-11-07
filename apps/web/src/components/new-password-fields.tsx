'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Label } from '@/components/ui/label';
import { checkPasswords } from '@/lib/password';
import { cn } from '@/lib/utils';

interface Props {
  /** Awalan id kolom, mis. "invite" menghasilkan invite-password dan invite-confirm. */
  idPrefix: string;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** Kelas tinggi kolom (h-10, h-11). */
  inputClassName?: string;
}

/** Kata sandi baru + ulangi kata sandi untuk formulir undangan; sama dengan formulir pendaftaran. */
export function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  inputClassName,
}: Props) {
  const ta = useTranslations('auth');
  const tre = useTranslations('register');
  const [touched, setTouched] = useState(false);
  const check = checkPasswords(password, confirm);
  // Kesalahan panjang baru muncul setelah kolom ditinggalkan, supaya tidak muncul saat masih mengetik.
  const showShort = check.tooShort && touched;

  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-password`}>{ta('password')}</Label>
        <PasswordInput
          id={`${idPrefix}-password`}
          name="password"
          required
          autoComplete="new-password"
          className={inputClassName}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showShort}
          aria-describedby={`${idPrefix}-password-hint`}
        />
        <p
          id={`${idPrefix}-password-hint`}
          aria-live="polite"
          className={cn('text-xs', showShort ? 'text-destructive' : 'text-muted-foreground')}
        >
          {showShort ? tre('weakPassword') : tre('passwordHint')}
        </p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-confirm`}>{tre('passwordConfirm')}</Label>
        <PasswordInput
          id={`${idPrefix}-confirm`}
          required
          autoComplete="new-password"
          className={inputClassName}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          aria-invalid={check.mismatch}
          aria-describedby={`${idPrefix}-confirm-hint`}
        />
        <p id={`${idPrefix}-confirm-hint`} aria-live="polite" className="text-destructive min-h-4 text-xs">
          {check.mismatch ? tre('passwordMismatch') : ''}
        </p>
      </div>
    </>
  );
}
