'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, KeyRound, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NewPasswordFields } from '@/components/new-password-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { checkPasswords } from '@/lib/password';

/** Atur kata sandi baru lewat tautan reset buatan admin sekolah. Tautan sekali pakai; semua sesi lama dikeluarkan. */
export function ResetView({ token }: { token: string }) {
  const t = useTranslations('passwordHelp');
  const te = useTranslations();
  const tc = useTranslations('common');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const check = checkPasswords(password, confirm);

  const link = useQuery({
    queryKey: ['reset-link', token],
    retry: false,
    queryFn: async () =>
      unwrap(await api.GET('/v1/public/reset-links/{token}', { params: { path: { token } } })),
  });

  if (link.isPending) return <Skeleton className="h-80 w-full max-w-md rounded-3xl" />;

  const gone = link.error instanceof ApiError && (link.error.status === 410 || link.error.status === 404);
  if (gone) {
    return (
      <div className="bg-card grid w-full max-w-md justify-items-center gap-2 rounded-3xl border p-8 text-center">
        <ShieldX className="text-muted-foreground size-9" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('invalidBody')}</p>
      </div>
    );
  }
  if (link.isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p>{t('loadErrorPublic')}</p>
        <Button onClick={() => link.refetch()}>{tc('retry')}</Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-card grid w-full max-w-md justify-items-center gap-3 rounded-3xl border p-8 text-center">
        <CircleCheck className="text-primary size-10" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">{t('resetDoneTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('resetDoneBody')}</p>
        <Button render={<Link href="/login" />} className="mt-2">
          {t('goLogin')}
        </Button>
      </div>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      unwrap(
        await api.POST('/v1/public/reset-links/{token}', {
          params: { path: { token } },
          body: { password },
        }),
      );
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) void link.refetch();
      setError(te(errorKey(e)));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-card w-full max-w-md overflow-hidden rounded-3xl border shadow-xs">
      <div className="from-primary/12 via-accent to-chart-2/15 bg-gradient-to-br px-6 py-6">
        <span className="bg-card text-primary mb-3 grid size-11 place-items-center rounded-2xl shadow-xs">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('resetTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('resetBody', { name: link.data.accountName, school: link.data.schoolName })}
        </p>
      </div>
      <form
        className="grid gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!check.ok) return;
          void submit();
        }}
      >
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <NewPasswordFields
          idPrefix="rs"
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          inputClassName="h-11"
        />
        <Button type="submit" disabled={pending || !check.ok} className="h-11 text-base">
          {pending ? t('resetting') : t('resetSubmit')}
        </Button>
      </form>
    </div>
  );
}
