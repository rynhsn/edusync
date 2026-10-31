'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { UserAvatar } from '@/components/ui-kit';
import { authClient } from '@/lib/auth-client';
import { checkPasswords, MIN_PASSWORD } from '@/lib/password';

export function ProfileView() {
  const t = useTranslations('account.profile');
  const ta = useTranslations('account');
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
    toast.success(t('passwordSaved'));
  }

  return (
    <PageBody>
      <PageHeader icon={UserCog} tone="slate" title={ta('nav.profile')} description={t('subtitle')} />
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
                  <p className="text-muted-foreground min-w-0 truncate text-sm">{user.email}</p>
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
                  {savingName ? ta('working') : t('saveName')}
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
                  {savingPw ? ta('working') : t('savePassword')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </PageBody>
  );
}
