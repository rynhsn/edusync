'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NewPasswordFields } from '@/components/new-password-fields';
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
import { inviteScreen } from '@/lib/platform-staff';

export function PlatformInviteView({ token }: { token: string }) {
  const t = useTranslations('platformInvite');
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
    queryKey: ['platform-invitation', token],
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/platform/staff/invitations/by-token/{token}', { params: { path: { token } } }),
      ),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });

  async function accept() {
    await unwrap(
      await api.POST('/v1/platform/staff/invitations/by-token/{token}/accept', {
        params: { path: { token } },
      }),
    );
    queryClient.clear();
    router.replace('/platform');
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError && !e.code ? e.message : te(errorKey(e)));
      // Undangan bisa berubah sejak halaman dibuka (dicabut, kedaluwarsa, dipakai); muat ulang statusnya.
      if (e instanceof ApiError && e.status === 410) void invitation.refetch();
    } finally {
      setPending(false);
    }
  }

  if (invitation.isPending || me.isPending) return <Skeleton className="h-56 w-full max-w-md" />;

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
  const sessionEmail = me.data?.user.email;
  const screen = inviteScreen(inv, sessionEmail);

  if (screen === 'invalid') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-xl">{t('invalidTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p className="text-muted-foreground">{t('invalidBody')}</p>
          {sessionEmail && (
            <Button variant="outline" nativeButton={false} render={<Link href="/platform" />}>
              {t('openConsole')}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const email = inv.email as string;
  const role = inv.role === 'admin' ? t('roleAdmin') : t('roleReadOnly');

  async function signInThenAccept(form: FormData) {
    const res = await authClient.signIn.email({ email, password: String(form.get('password')) });
    if (res.error) throw new ApiError(ta('invalid'), res.error.status ?? 401);
    await accept();
  }

  async function signUpThenAccept(form: FormData) {
    const res = await authClient.signUp.email({ name: String(form.get('name')).trim(), email, password });
    if (res.error) {
      throw new ApiError(
        res.error.code?.includes('EXISTS') ? t('emailTaken') : tre('weakPassword'),
        res.error.status ?? 400,
      );
    }
    await accept();
  }

  const signup = screen === 'signup';

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{t('title')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {inv.invitedByName ? t('body', { inviter: inv.invitedByName, role }) : t('bodyNoName', { role })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {screen === 'mismatch' && (
          <>
            <p className="font-medium">{t('wrongTitle')}</p>
            <p className="text-muted-foreground text-sm">
              {t('wrongBody', { email: inv.emailMasked ?? '' })}
            </p>
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

        {screen === 'accept' && (
          <Button disabled={pending} onClick={() => run(accept)}>
            {pending ? t('accepting') : t('accept')}
          </Button>
        )}

        {(screen === 'signin' || signup) && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (!signup) return void run(() => signInThenAccept(form));
              if (!check.ok) return;
              void run(() => signUpThenAccept(form));
            }}
          >
            <p className="font-medium">{signup ? t('createTitle') : t('signInTitle')}</p>
            <div className="grid content-start gap-2">
              <Label htmlFor="staff-invite-email">{ta('email')}</Label>
              <Input
                id="staff-invite-email"
                value={email}
                readOnly
                className="h-10"
                autoComplete="username"
              />
            </div>
            {signup && (
              <div className="grid content-start gap-2">
                <Label htmlFor="staff-invite-name">{t('name')}</Label>
                <Input id="staff-invite-name" name="name" required autoComplete="name" className="h-10" />
              </div>
            )}
            {signup ? (
              <NewPasswordFields
                idPrefix="staff-invite"
                password={password}
                confirm={confirm}
                onPasswordChange={setPassword}
                onConfirmChange={setConfirm}
                inputClassName="h-10"
              />
            ) : (
              <div className="grid content-start gap-2">
                <Label htmlFor="staff-invite-password">{ta('password')}</Label>
                <PasswordInput
                  id="staff-invite-password"
                  name="password"
                  required
                  autoComplete="current-password"
                  className="h-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" disabled={pending || (signup && !check.ok)} className="h-10">
              {pending ? t('accepting') : signup ? t('createAndAccept') : t('signInAndAccept')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
