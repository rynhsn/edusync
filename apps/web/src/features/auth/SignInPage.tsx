import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, authErrorMessage } from '@/lib/platform-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Field, FormError } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = new FormData(event.currentTarget);
      const result = await authClient.signIn.email({
        email: String(data.get('email')),
        password: String(data.get('password')),
      });
      if (result.error) throw new Error(result.error.message ?? t('auth.signInError'));
      navigate('/', { replace: true });
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return <AuthLayout eyebrow={t('auth.signInEyebrow')} title={t('auth.signInTitle')} description={t('auth.signInDescription')}><form onSubmit={submit} className="space-y-5"><Field label={t('auth.emailAddress')} name="email" type="email" required autoComplete="username" placeholder={t('auth.placeholderEmailAddress')} /><div className="space-y-1.5"><div className="flex justify-between"><Label htmlFor="password">{t('auth.password')}</Label><Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">{t('auth.forgotPassword')}</Link></div><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" className="pr-11" placeholder={t('auth.passwordPlaceholder')} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>{error && <FormError message={error} />}<Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? t('auth.signingIn') : t('auth.signIn')}</Button></form>
    <div className="mt-6 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-primary" />{t('auth.restrictedNotice')} <Link to="/sign-up" className="shrink-0 rounded px-1 font-medium text-primary hover:underline">{t('auth.createAccount')}</Link></div></AuthLayout>;
}
