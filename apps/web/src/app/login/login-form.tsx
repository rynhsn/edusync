'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<'invalid' | 'unreachable' | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      if (error) {
        setError(error.status === 401 || error.status === 400 ? 'invalid' : 'unreachable');
        return;
      }
      // Buang data akun lama agar shell memuat ulang untuk pengguna yang baru masuk.
      queryClient.clear();
      router.replace('/');
    } catch {
      setError('unreachable');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">{t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required className="h-10" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{t('password')}</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        {t('noAccount')}{' '}
        <Link href="/register" className="text-primary font-medium underline-offset-4 hover:underline">
          {t('createAccount')}
        </Link>
      </p>
    </div>
  );
}
