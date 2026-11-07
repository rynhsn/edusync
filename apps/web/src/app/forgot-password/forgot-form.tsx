'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

const RESEND_SECONDS = 60;
const MIN_PASSWORD = 12;

type Step = 'email' | 'code' | 'password' | 'done';
type ErrorKey = 'unreachable' | 'tooMany' | 'invalidCode' | 'short' | 'mismatch';

/**
 * Lupa kata sandi dalam tiga langkah: email, kode 6 digit dari email (diperiksa lebih dulu), lalu baru formulir
 * kata sandi baru. Dipakai sama oleh platform dan sekolah.
 */
export function ForgotForm() {
  const t = useTranslations('forgot');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function sendCode(to: string) {
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: to, type: 'forget-password' });
      if (error) {
        setError(error.status === 429 ? 'tooMany' : 'unreachable');
        return false;
      }
      setWait(RESEND_SECONDS);
      return true;
    } catch {
      setError('unreachable');
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const to = String(new FormData(event.currentTarget).get('email')).trim();
    setEmail(to);
    if (await sendCode(to)) {
      setOtp('');
      setStep('code');
    }
  }

  /** Memeriksa kode tanpa menghabiskannya; kata sandi baru baru diminta setelah kode benar. */
  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('otp')).trim();
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.checkVerificationOtp({
        email,
        type: 'forget-password',
        otp: code,
      });
      if (error) {
        setError(
          error.status === 429
            ? 'tooMany'
            : error.status === 400 || error.status === 403
              ? 'invalidCode'
              : 'unreachable',
        );
        return;
      }
      setOtp(code);
      setStep('password');
    } catch {
      setError('unreachable');
    } finally {
      setPending(false);
    }
  }

  async function onReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password.length < MIN_PASSWORD) return setError('short');
    if (password !== String(form.get('confirm'))) return setError('mismatch');
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (error) {
        if (error.status === 400 || error.status === 403) {
          // Kode kedaluwarsa atau habis percobaan di antara dua langkah: kembali ke langkah kode.
          setOtp('');
          setStep('code');
          setError('invalidCode');
        } else {
          setError(error.status === 429 ? 'tooMany' : 'unreachable');
        }
        return;
      }
      setStep('done');
    } catch {
      setError('unreachable');
    } finally {
      setPending(false);
    }
  }

  const alert = error && (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  );

  if (step === 'done') {
    return (
      <div className="w-full max-w-sm">
        <div className="grid gap-4 text-center">
          <CheckCircle2 className="text-primary mx-auto size-10" aria-hidden />
          <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('doneTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('doneBody')}</p>
          <Button nativeButton={false} render={<Link href="/login" />} className="h-10">
            {t('toLogin')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {step === 'email'
            ? t('emailHint')
            : step === 'code'
              ? t('codeHint', { email })
              : t('passwordStepHint')}
        </p>
      </div>

      {step === 'email' && (
        <form key="email" onSubmit={onEmail} className="grid gap-4">
          {alert}
          <div className="grid content-start gap-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required className="h-10" />
          </div>
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? t('sending') : t('sendCode')}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form key="code" onSubmit={onCode} className="grid gap-4">
          {alert}
          <div className="grid content-start gap-2">
            <Label htmlFor="otp">{t('code')}</Label>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="h-10 text-center font-mono tracking-[0.5em]"
            />
          </div>
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? t('verifying') : t('verify')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || wait > 0}
            onClick={() => sendCode(email)}
          >
            {wait > 0 ? t('resendIn', { s: wait }) : t('resend')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setStep('email');
            }}
          >
            {t('changeEmail')}
          </Button>
        </form>
      )}

      {step === 'password' && (
        <form key="password" onSubmit={onReset} className="grid gap-4">
          {alert}
          <div className="grid content-start gap-2">
            <Label htmlFor="password">{t('newPassword')}</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              autoFocus
              className="h-10"
            />
            <p className="text-muted-foreground text-xs">{t('passwordHint', { min: MIN_PASSWORD })}</p>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="confirm">{t('confirmPassword')}</Label>
            <PasswordInput
              id="confirm"
              name="confirm"
              autoComplete="new-password"
              required
              className="h-10"
            />
          </div>
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? t('saving') : t('reset')}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          {t('back')}
        </Link>
      </p>
    </div>
  );
}
