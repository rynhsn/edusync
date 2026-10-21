import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, authErrorMessage } from '@/lib/platform-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Field, FormError } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function SignInPage() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [showPassword, setShowPassword] = useState(false); const navigate = useNavigate(); const { t } = useTranslation();
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { const result = await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) }); if (result.error) throw new Error(result.error.message ?? t('auth.signInError')); navigate('/', { replace: true }); } catch (cause) { setError(authErrorMessage(cause)); } finally { setBusy(false); } };
  return <AuthLayout eyebrow={t('auth.signInEyebrow')} title={t('auth.signInTitle')} description={t('auth.signInDescription')}><form onSubmit={(event) => void submit(event)} className="space-y-5"><Field label={t('auth.emailAddress')} name="email" type="email" required autoComplete="username" placeholder="you@edusync.org" /><div className="space-y-1.5"><div className="flex justify-between"><Label htmlFor="password">{t('auth.password')}</Label><Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">{t('auth.forgotPassword')}</Link></div><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" className="pr-11" placeholder={t('auth.passwordPlaceholder')} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>{error && <FormError message={error} />}<Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? t('auth.signingIn') : t('auth.signIn')}</Button></form><div className="mt-6 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-primary" />{t('auth.restrictedNotice')}</div></AuthLayout>;
}
