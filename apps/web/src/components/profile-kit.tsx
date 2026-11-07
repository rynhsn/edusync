'use client';

import { isValidUsername, normalizeUsername, USERNAME_MAX } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Laptop, LogOut, Mail, Smartphone, Trash2, UserCog } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CurrentPasswordInput } from '@/components/current-password-input';
import { PageBody, PageHeader } from '@/components/page-header';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge, UserAvatar } from '@/components/ui-kit';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { describeDevice } from '@/lib/device';
import { resizeToSquare } from '@/lib/image';
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
        <ul className="grid content-start gap-2">
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

/** Ganti email dua langkah: alamat baru, lalu kode 6 digit yang dikirim ke alamat baru itu. */
function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  onChanged: () => void;
}) {
  const t = useTranslations('profile');
  const tcm = useTranslations('common');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('email');
      setNewEmail('');
      setCode('');
      setError(null);
    }
  }, [open]);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (email === currentEmail.toLowerCase()) return setError(t('emailSame'));
    setPending(true);
    setError(null);
    const res = await authClient.emailOtp.requestEmailChange({ newEmail: email });
    setPending(false);
    if (res.error) return setError(t('emailError'));
    setNewEmail(email);
    setStep('code');
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await authClient.emailOtp.changeEmail({ newEmail, otp: code.trim() });
    setPending(false);
    if (res.error) return setError(res.error.status === 400 ? t('emailBadCode') : t('emailError'));
    toast.success(t('emailChanged'));
    onChanged();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('changeEmail')}</DialogTitle>
          <DialogDescription>
            {step === 'email' ? t('emailNote') : t('codeSent', { email: newEmail })}
          </DialogDescription>
        </DialogHeader>
        {step === 'email' ? (
          <form key="email" onSubmit={sendCode} className="grid gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="new-email">{t('newEmail')}</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="off"
                maxLength={254}
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {tcm('cancel')}
              </Button>
              <Button type="submit" disabled={pending || !newEmail.trim()}>
                {pending ? t('sendingCode') : t('sendCode')}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form key="code" onSubmit={confirm} className="grid gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="email-code">{t('code')}</Label>
              <Input
                id="email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="text-center font-mono tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep('email')}>
                {t('changeEmail')}
              </Button>
              <Button type="submit" disabled={pending || code.length !== 6}>
                {pending ? t('working') : t('confirmEmail')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
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
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>(
    'idle',
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone ?? '');
      setUsername(user.username ?? '');
    }
  }, [user]);

  // Ketersediaan nama pengguna diperiksa ke server setelah berhenti mengetik sebentar.
  useEffect(() => {
    const value = normalizeUsername(username);
    if (!user || value === '' || value === (user.username ?? '')) return setUsernameState('idle');
    if (!isValidUsername(value)) return setUsernameState('invalid');
    setUsernameState('checking');
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await api.GET('/v1/account/username-check', { params: { query: { username: value } } });
      if (!stale) setUsernameState(res.data ? (res.data.available ? 'ok' : 'taken') : 'idle');
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [username, user]);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const check = checkPasswords(pw.next, pw.confirm);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setSavingName(true);
    const nextUsername = normalizeUsername(username);
    const res = await authClient.updateUser({
      name: name.trim(),
      phone: phone.trim(),
      ...(nextUsername !== (user?.username ?? '') ? { username: nextUsername } : {}),
    });
    setSavingName(false);
    if (res.error) {
      const code = res.error.code;
      return setNameError(
        code === 'INVALID_PHONE'
          ? t('phoneInvalid')
          : code === 'USERNAME_TAKEN'
            ? t('usernameTaken')
            : code === 'INVALID_USERNAME'
              ? t('usernameInvalid')
              : te('unknown'),
      );
    }
    queryClient.invalidateQueries({ queryKey: ['me'] });
    toast.success(t('nameSaved'));
  }

  /** Ganti atau hapus foto: gambar dipotong persegi dan dikecilkan di peramban sebelum dikirim. */
  async function savePhoto(file: File | null) {
    setSavingPhoto(true);
    try {
      const image = file ? await resizeToSquare(file) : '';
      const res = await authClient.updateUser({ image });
      if (res.error) throw new Error(res.error.message);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(file ? t('photoSaved') : t('photoRemoved'));
    } catch {
      toast.error(t('photoInvalid'));
    } finally {
      setSavingPhoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
                <div className="flex items-center gap-4">
                  <UserAvatar name={user.name} image={user.image} size="lg" className="size-16 text-xl" />
                  <div className="grid content-start gap-1.5">
                    <p className="text-sm font-medium">{t('photo')}</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label={t('changePhoto')}
                        tabIndex={-1}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void savePhoto(file);
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingPhoto}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Camera className="size-3.5" aria-hidden /> {t('changePhoto')}
                      </Button>
                      {user.image && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={savingPhoto}
                          onClick={() => void savePhoto(null)}
                        >
                          <Trash2 className="size-3.5" aria-hidden /> {t('removePhoto')}
                        </Button>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">{t('photoHint')}</p>
                  </div>
                </div>
                <div className="grid content-start gap-2">
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
                <div className="grid content-start gap-2">
                  <Label htmlFor="profile-phone">{t('phone')}</Label>
                  <Input
                    id="profile-phone"
                    inputMode="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{t('phoneHint')}</p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="profile-username">{t('username')}</Label>
                  <Input
                    id="profile-username"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={USERNAME_MAX}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={usernameState === 'invalid' || usernameState === 'taken'}
                  />
                  {usernameState === 'idle' && (
                    <p className="text-muted-foreground text-xs">{t('usernameHint')}</p>
                  )}
                  {usernameState === 'checking' && (
                    <p className="text-muted-foreground text-xs">{t('usernameChecking')}</p>
                  )}
                  {usernameState === 'ok' && (
                    <p className="text-xs text-emerald-600">{t('usernameAvailable')}</p>
                  )}
                  {usernameState === 'taken' && (
                    <p className="text-destructive text-xs">{t('usernameTaken')}</p>
                  )}
                  {usernameState === 'invalid' && (
                    <p className="text-destructive text-xs">{t('usernameInvalid')}</p>
                  )}
                </div>
                <div className="grid content-start gap-2">
                  <Label>{t('email')}</Label>
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="min-w-0 truncate text-sm">{user.email}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                      <Mail className="size-3.5" aria-hidden /> {t('changeEmail')}
                    </Button>
                  </div>
                </div>
                {nameError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{nameError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="justify-self-start"
                  disabled={
                    savingName ||
                    name.trim().length < 2 ||
                    usernameState === 'invalid' ||
                    usernameState === 'taken' ||
                    (name.trim() === user.name &&
                      phone.trim() === (user.phone ?? '') &&
                      normalizeUsername(username) === (user.username ?? ''))
                  }
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
                <div className="grid content-start gap-2">
                  <Label htmlFor="pw-verify-old">{t('currentPassword')}</Label>
                  <CurrentPasswordInput
                    id="pw-verify-old"
                    value={pw.current}
                    onValueChange={(current) => setPw((prev) => ({ ...prev, current }))}
                  />
                </div>
                <div className="grid content-start gap-2">
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
                <div className="grid content-start gap-2">
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
          <ChangeEmailDialog
            open={emailOpen}
            onOpenChange={setEmailOpen}
            currentEmail={user.email}
            onChanged={() => {
              void session.refetch();
              queryClient.invalidateQueries({ queryKey: ['me'] });
            }}
          />
        </div>
      )}
    </PageBody>
  );
}
