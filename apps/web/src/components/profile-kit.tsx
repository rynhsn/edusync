'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Laptop, LogOut, Smartphone, UserCog } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge, UserAvatar } from '@/components/ui-kit';
import { authClient } from '@/lib/auth-client';
import { describeDevice } from '@/lib/device';
import { checkPasswords, MIN_PASSWORD } from '@/lib/password';

const SESSIONS_KEY = ['auth-sessions'];

/** Kartu perangkat yang sedang masuk dengan akun ini; yang tidak dikenali bisa dikeluarkan. */
function SessionsCard({ currentToken }: { currentToken: string | undefined }) {
  const t = useTranslations('profile');
  const te = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const res = await authClient.listSessions();
      if (res.error) throw new Error(res.error.message);
      return res.data ?? [];
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const res = await authClient.revokeSession({ token });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success(t('revoked'));
      refresh();
    },
    onError: () => toast.error(te('unknown')),
  });
  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions();
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success(t('revokedOthers'));
      refresh();
    },
    onError: () => toast.error(te('unknown')),
  });

  const sessions = [...(list.data ?? [])].sort((a, b) => {
    // Perangkat ini paling atas, sisanya yang terbaru dulu.
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const others = sessions.filter((s) => s.token !== currentToken);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-lg">
          <Laptop className="size-5" aria-hidden /> {t('sessionsTitle')}
        </CardTitle>
        <CardDescription>{t('sessionsNote')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {list.isPending && <Skeleton className="h-16 w-full rounded-xl" />}
        {list.isError && <p className="text-destructive text-sm">{t('sessionsError')}</p>}
        <ul className="grid gap-2">
          {sessions.map((s) => {
            const device = describeDevice(s.userAgent);
            const mobile = device?.os === 'Android' || device?.os === 'iOS';
            const Icon = mobile ? Smartphone : Laptop;
            const current = s.token === currentToken;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border p-3">
                <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {device ? [device.browser, device.os].filter(Boolean).join(' · ') : t('unknownDevice')}
                    {current && (
                      <ToneBadge tone="emerald" dot={false}>
                        {t('current')}
                      </ToneBadge>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {t('signedInAt', { date: new Date(s.createdAt).toLocaleString(locale) })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                  </p>
                </div>
                {!current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.token)}
                  >
                    <LogOut className="size-3.5" aria-hidden /> {t('revoke')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {list.data && others.length === 0 && <p className="text-muted-foreground text-sm">{t('noOthers')}</p>}
        {others.length > 0 && (
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            {t('revokeOthers')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Halaman profil akun yang sama untuk portal akun, panel sekolah, dan konsol platform: nama, kata sandi, dan perangkat. */
export function ProfilePage() {
  const t = useTranslations('profile');
  const te = useTranslations('errors');
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const user = session.data?.user;

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const check = checkPasswords(pw.next, pw.confirm);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setSavingName(true);
    const res = await authClient.updateUser({ name: name.trim() });
    setSavingName(false);
    if (res.error) return setNameError(te('unknown'));
    queryClient.invalidateQueries({ queryKey: ['me'] });
    toast.success(t('nameSaved'));
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwError(null);
    setSavingPw(true);
    const res = await authClient.changePassword({
      currentPassword: pw.current,
      newPassword: pw.next,
      revokeOtherSessions: true,
    });
    setSavingPw(false);
    if (res.error) {
      const code = res.error.code ?? '';
      return setPwError(code.includes('INVALID_PASSWORD') ? t('wrongCurrent') : te('unknown'));
    }
    setPw({ current: '', next: '', confirm: '' });
    queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    toast.success(t('passwordSaved'));
  }

  return (
    <PageBody>
      <PageHeader icon={UserCog} tone="slate" title={t('title')} description={t('subtitle')} />
      {session.isPending && <Skeleton className="h-48 w-full rounded-2xl" />}
      {user && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">{t('profileTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveName} className="grid gap-4">
                <div className="flex items-center gap-3">
                  <UserAvatar name={user.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.email}</p>
                    <p className="text-muted-foreground text-xs">{t('emailNote')}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-name">{t('name')}</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </div>
                {nameError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{nameError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="justify-self-start"
                  disabled={savingName || name.trim().length < 2 || name.trim() === user.name}
                >
                  {savingName ? t('working') : t('saveName')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-lg">
                <KeyRound className="size-5" aria-hidden /> {t('passwordTitle')}
              </CardTitle>
              <CardDescription>{t('passwordNote', { min: MIN_PASSWORD })}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePassword} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="pw-current">{t('currentPassword')}</Label>
                  <PasswordInput
                    id="pw-current"
                    autoComplete="current-password"
                    value={pw.current}
                    onChange={(e) => setPw({ ...pw, current: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pw-next">{t('newPassword')}</Label>
                  <PasswordInput
                    id="pw-next"
                    autoComplete="new-password"
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    aria-invalid={check.tooShort}
                  />
                  {check.tooShort && (
                    <p className="text-destructive text-xs">{t('tooShort', { min: MIN_PASSWORD })}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pw-confirm">{t('confirmPassword')}</Label>
                  <PasswordInput
                    id="pw-confirm"
                    autoComplete="new-password"
                    value={pw.confirm}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                    aria-invalid={check.mismatch}
                  />
                  {check.mismatch && <p className="text-destructive text-xs">{t('mismatch')}</p>}
                </div>
                {pwError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{pwError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="justify-self-start"
                  disabled={savingPw || !check.ok || pw.current.length === 0}
                >
                  {savingPw ? t('working') : t('savePassword')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <SessionsCard currentToken={session.data?.session.token} />
        </div>
      )}
    </PageBody>
  );
}
