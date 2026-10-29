'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { errorKey } from '@/lib/errors';
import { checkPasswords } from '@/lib/password';

export function InviteView({ token }: { token: string }) {
  const t = useTranslations('invite');
  const tr = useTranslations('roles');
  const tre = useTranslations('register');
  const ta = useTranslations('auth');
  const te = useTranslations();
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = checkPasswords(password, confirm);

  const invitation = useQuery({
    queryKey: ['invitation', token],
    retry: false,
    queryFn: async () =>
      unwrap(await api.GET('/v1/invitations/by-token/{token}', { params: { path: { token } } })),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });

  async function accept() {
    await unwrap(await api.POST('/v1/invitations/by-token/{token}/accept', { params: { path: { token } } }));
    queryClient.clear();
    router.replace('/dashboard');
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError && !e.code ? e.message : te(errorKey(e)));
    } finally {
      setPending(false);
    }
  }

  const roleName = (key: string) => (tr.has(key as never) ? tr(key as never) : key);

  if (invitation.isPending || me.isPending) return <Skeleton className="h-56 w-full max-w-md" />;

  if (invitation.error instanceof ApiError && invitation.error.status === 410) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-xl">{t('invalidTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{t('invalidBody')}</CardContent>
      </Card>
    );
  }

  if (invitation.isError || me.isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p>{t('loadError')}</p>
        <Button
          onClick={() => {
            invitation.refetch();
            me.refetch();
          }}
        >
          {tc('retry')}
        </Button>
      </div>
    );
  }

  const inv = invitation.data;
  const user = me.data;
  const wrongAccount = !!user && user.user.email.toLowerCase() !== inv.email;

  async function signInThenAccept(form: FormData) {
    const res = await authClient.signIn.email({ email: inv.email, password: String(form.get('password')) });
    if (res.error) throw new ApiError(ta('invalid'), res.error.status ?? 401);
    await accept();
  }

  async function signUpThenAccept(form: FormData) {
    const res = await authClient.signUp.email({
      name: String(form.get('name')).trim(),
      email: inv.email,
      password,
    });
    if (res.error) {
      throw new ApiError(
        res.error.code?.includes('EXISTS') ? t('emailTaken') : tre('weakPassword'),
        res.error.status ?? 400,
      );
    }
    await accept();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{t('title')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('body', { school: inv.schoolName, roles: inv.roles.map(roleName).join(', ') })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {wrongAccount && user && (
          <>
            <p className="font-medium">{t('wrongTitle')}</p>
            <p className="text-muted-foreground text-sm">{t('wrongBody', { email: inv.email })}</p>
            <Button
              variant="outline"
              onClick={async () => {
                await authClient.signOut();
                queryClient.clear();
                router.refresh();
                me.refetch();
              }}
            >
              {tc('signOut')}
            </Button>
          </>
        )}

        {!wrongAccount && user && (
          <Button disabled={pending} onClick={() => run(accept)}>
            {pending ? t('accepting') : t('accept')}
          </Button>
        )}

        {!user && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (inv.accountExists) return void run(() => signInThenAccept(form));
              if (!check.ok) return;
              void run(() => signUpThenAccept(form));
            }}
          >
            <p className="font-medium">{inv.accountExists ? t('signInTitle') : t('createTitle')}</p>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">{ta('email')}</Label>
              <Input id="invite-email" value={inv.email} readOnly className="h-10" autoComplete="username" />
            </div>
            {!inv.accountExists && (
              <div className="grid gap-2">
                <Label htmlFor="invite-name">{t('name')}</Label>
                <Input id="invite-name" name="name" required autoComplete="name" className="h-10" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="invite-password">{ta('password')}</Label>
              <PasswordInput
                id="invite-password"
                name="password"
                required
                autoComplete={inv.accountExists ? 'current-password' : 'new-password'}
                className="h-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...(!inv.accountExists ? { 'aria-invalid': check.tooShort } : {})}
              />
              {!inv.accountExists && (
                <p className={check.tooShort ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                  {tre('passwordHint')}
                </p>
              )}
            </div>
            {!inv.accountExists && (
              <div className="grid gap-2">
                <Label htmlFor="invite-confirm">{tre('passwordConfirm')}</Label>
                <PasswordInput
                  id="invite-confirm"
                  required
                  autoComplete="new-password"
                  className="h-10"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={check.mismatch}
                />
                {check.mismatch && <p className="text-destructive text-xs">{tre('passwordMismatch')}</p>}
              </div>
            )}
            <Button type="submit" disabled={pending || (!inv.accountExists && !check.ok)} className="h-10">
              {pending ? t('accepting') : inv.accountExists ? t('signInAndAccept') : t('createAndAccept')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
