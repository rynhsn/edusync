'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyArt } from '@/app/(app)/portal/ui-bits';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { errorKey } from '@/lib/errors';
import { checkPasswords } from '@/lib/password';
import {
  type AcceptedPortalInvite,
  PORTAL_PATHS,
  type PublicPortalInvite,
  portalRequest,
} from '@/lib/portal-api';
import { goToSchool, useSite } from '@/lib/site';

/** Terima undangan portal: buat akun dengan kata sandi, masuk, lalu menuju portal sekolah. Tanpa kerangka sekolah. */
export function PortalInviteView({ token }: { token: string }) {
  const t = useTranslations('portalInvite');
  const tre = useTranslations('register');
  const ta = useTranslations('auth');
  const te = useTranslations();
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const site = useSite();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = checkPasswords(password, confirm);

  const invite = useQuery({
    queryKey: ['portal-invite', token],
    retry: false,
    queryFn: () => portalRequest<PublicPortalInvite>('GET', PORTAL_PATHS.publicInvite(token)),
  });

  if (invite.isPending) return <Skeleton className="h-72 w-full max-w-md rounded-3xl" />;

  const gone =
    invite.error instanceof ApiError && (invite.error.status === 410 || invite.error.status === 404);
  if (gone) {
    return (
      <div className="bg-card grid w-full max-w-md justify-items-center gap-2 rounded-3xl border p-8 text-center">
        <EmptyArt />
        <h1 className="font-heading text-xl font-semibold">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('invalidBody')}</p>
      </div>
    );
  }
  if (invite.isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p>{t('loadError')}</p>
        <Button onClick={() => invite.refetch()}>{tc('retry')}</Button>
      </div>
    );
  }

  const inv = invite.data;
  const fixedEmail = inv.email;
  const emailValue = fixedEmail ?? email;
  const nameValue = name || inv.targetName;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const accepted = await portalRequest<AcceptedPortalInvite>('POST', PORTAL_PATHS.acceptInvite(token), {
        body: { name: nameValue.trim(), email: emailValue.trim(), password },
      });
      const signedIn = await authClient.signIn.email({
        email: accepted?.email ?? emailValue.trim(),
        password,
      });
      if (signedIn.error) throw new ApiError(ta('invalid'), signedIn.error.status ?? 401);
      queryClient.clear();
      const slug = accepted?.schoolSlug ?? inv.schoolSlug;
      if (site.ready && site.kind === 'school' && site.slug === slug) router.replace('/portal');
      else if (site.ready) await goToSchool(site, slug, '/portal');
      else router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError && !e.code ? e.message : te(errorKey(e)));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-card w-full max-w-md overflow-hidden rounded-3xl border shadow-xs">
      <div className="from-primary/12 via-accent to-chart-2/15 bg-gradient-to-br px-6 py-6">
        <span className="bg-card text-primary mb-3 grid size-11 place-items-center rounded-2xl shadow-xs">
          <HeartHandshake className="size-6" aria-hidden />
        </span>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t(inv.kind === 'guardian' ? 'bodyGuardian' : 'bodyStudent', {
            school: inv.schoolName,
            name: inv.targetName,
          })}
        </p>
      </div>

      <form
        className="grid gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!inv.accountExists && !check.ok) return;
          void submit();
        }}
      >
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="font-medium">{inv.accountExists ? t('existingTitle') : t('createTitle')}</p>
        {!inv.accountExists && (
          <div className="grid gap-2">
            <Label htmlFor="pi-name">{t('name')}</Label>
            <Input
              id="pi-name"
              required
              autoComplete="name"
              className="h-11"
              value={nameValue}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="pi-email">{ta('email')}</Label>
          <Input
            id="pi-email"
            type="email"
            required
            readOnly={!!fixedEmail}
            autoComplete="username"
            className="h-11"
            value={emailValue}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!fixedEmail && <p className="text-muted-foreground text-xs">{t('emailHint')}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pi-password">{ta('password')}</Label>
          <PasswordInput
            id="pi-password"
            required
            autoComplete={inv.accountExists ? 'current-password' : 'new-password'}
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!inv.accountExists && check.tooShort}
          />
          {!inv.accountExists && (
            <p className={check.tooShort ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              {tre('passwordHint')}
            </p>
          )}
        </div>
        {!inv.accountExists && (
          <div className="grid gap-2">
            <Label htmlFor="pi-confirm">{tre('passwordConfirm')}</Label>
            <PasswordInput
              id="pi-confirm"
              required
              autoComplete="new-password"
              className="h-11"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={check.mismatch}
            />
            {check.mismatch && <p className="text-destructive text-xs">{tre('passwordMismatch')}</p>}
          </div>
        )}
        <Button
          type="submit"
          disabled={pending || (!inv.accountExists && !check.ok) || password.length < 12}
          className="h-11 text-base"
        >
          {pending ? t('creating') : inv.accountExists ? t('acceptAndEnter') : t('createAndEnter')}
        </Button>
      </form>
    </div>
  );
}
