'use client';

import { CheckCircle2, Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const RESEND_SECONDS = 60;
const MIN_PASSWORD = 12;

type Step = 'identifier' | 'channel' | 'code' | 'password' | 'done';
type Channel = 'email' | 'whatsapp';
type ErrorKey = 'unreachable' | 'tooMany' | 'invalidCode' | 'short' | 'mismatch' | 'cooldown';
interface ChannelOption {
  channel: Channel;
  hint: string;
}

/**
 * Lupa kata sandi dalam beberapa langkah: isian akun (email atau NIK), pilihan saluran (email atau
 * WhatsApp, dengan petunjuk yang disamarkan), kode 6 digit (diperiksa lebih dulu), lalu formulir kata sandi baru.
 * Dipakai sama oleh platform dan sekolah. Isian yang tidak cocok dengan akun mana pun mendapat layar netral.
 */
export function ForgotForm() {
  const t = useTranslations('forgot');
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [options, setOptions] = useState<ChannelOption[]>([]);
  const [channel, setChannel] = useState<Channel>('email');
  const [code, setCode] = useState('');
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const hint = options.find((o) => o.channel === channel)?.hint ?? '';

  /** Petakan status HTTP ke pesan; `fallback` dipakai untuk 400/403 (kode salah). */
  const errorFor = (status: number, fallback: ErrorKey = 'unreachable'): ErrorKey =>
    status === 429 ? 'tooMany' : status === 400 || status === 403 ? fallback : 'unreachable';

  async function onIdentifier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const given = String(new FormData(event.currentTarget).get('identifier')).trim();
    setIdentifier(given);
    setPending(true);
    setError(null);
    try {
      const res = await api.POST('/v1/auth/recovery/lookup', { body: { identifier: given } });
      if (!res.data) return setError(errorFor(res.response.status));
      setOptions(res.data.channels);
      setStep('channel');
    } catch {
      setError('unreachable');
    } finally {
      setPending(false);
    }
  }

  /** Kirim kode ke saluran itu; kembalikan true bila layar boleh pindah ke langkah kode. */
  async function sendCode(via: Channel) {
    setPending(true);
    setError(null);
    try {
      const res = await api.POST('/v1/auth/recovery/send', { body: { identifier, channel: via } });
      if (res.data) {
        setChannel(via);
        setWait(RESEND_SECONDS);
        return true;
      }
      const errorCode = (res.error as { error?: { code?: string } } | undefined)?.error?.code;
      if (res.response.status === 429 && errorCode === 'cooldown') {
        // Kode baru saja dikirim ke saluran ini: lanjut ke langkah kode dan beri tahu jedanya.
        setChannel(via);
        setWait(RESEND_SECONDS);
        setError('cooldown');
        return true;
      }
      setError(errorFor(res.response.status));
      return false;
    } catch {
      setError('unreachable');
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onPick(via: Channel) {
    if (await sendCode(via)) {
      setCode('');
      setStep('code');
    }
  }

  /** Memeriksa kode tanpa menghabiskannya; kata sandi baru baru diminta setelah kode benar. */
  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const given = String(new FormData(event.currentTarget).get('otp')).trim();
    setPending(true);
    setError(null);
    try {
      const res = await api.POST('/v1/auth/recovery/verify', { body: { identifier, channel, code: given } });
      if (!res.data) return setError(errorFor(res.response.status, 'invalidCode'));
      setCode(given);
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
      const res = await api.POST('/v1/auth/recovery/reset', {
        body: { identifier, channel, code, password },
      });
      if (!res.data) {
        if (res.response.status === 400) {
          // Kode kedaluwarsa atau habis percobaan di antara dua langkah: kembali ke langkah kode.
          setCode('');
          setStep('code');
          setError('invalidCode');
        } else {
          setError(errorFor(res.response.status));
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

  const subtitle =
    step === 'identifier'
      ? t('emailHint')
      : step === 'channel'
        ? options.length > 0
          ? t('channelHint')
          : t('neutral')
        : step === 'code'
          ? t(channel === 'email' ? 'codeHintEmail' : 'codeHintWhatsapp', { hint })
          : t('passwordStepHint');

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {step === 'channel' && options.length > 0 ? t('channelTitle') : t('title')}
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>
      </div>

      {step === 'identifier' && (
        <form key="identifier" onSubmit={onIdentifier} className="grid gap-4">
          {alert}
          <div className="grid content-start gap-2">
            <Label htmlFor="identifier">{t('identifier')}</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={identifier}
              required
              className="h-10"
            />
            <p className="text-muted-foreground text-xs">{t('nikNote')}</p>
          </div>
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? t('finding') : t('find')}
          </Button>
        </form>
      )}

      {step === 'channel' && (
        <div key="channel" className="grid gap-3">
          {alert}
          {options.map((option) => (
            <Button
              key={option.channel}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onPick(option.channel)}
              className="h-auto justify-start gap-3 px-3 py-3 text-left"
            >
              {option.channel === 'email' ? (
                <Mail className="size-5 shrink-0" aria-hidden />
              ) : (
                <MessageCircle className="size-5 shrink-0" aria-hidden />
              )}
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium">
                  {t(option.channel === 'email' ? 'viaEmail' : 'viaWhatsapp')}
                </span>
                <span className="text-muted-foreground truncate text-xs font-normal">
                  {t(option.channel === 'email' ? 'clueEmail' : 'clueWhatsapp', { hint: option.hint })}
                </span>
              </span>
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setStep('identifier');
            }}
          >
            {t('changeIdentifier')}
          </Button>
        </div>
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
            onClick={() => sendCode(channel)}
          >
            {wait > 0 ? t('resendIn', { s: wait }) : t('resend')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setStep('channel');
            }}
          >
            {t('changeChannel')}
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
