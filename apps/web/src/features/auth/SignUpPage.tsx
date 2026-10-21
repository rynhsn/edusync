import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authErrorMessage, registerPlatformUser } from '@/lib/platform-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Field, FormError, PasswordField, readConfirmedPassword } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function SignUpPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      // The confirmation is checked before anything is sent, so a typo never reaches the API.
      const password = readConfirmedPassword(data);
      await registerPlatformUser({
        name: String(data.get('name') ?? '').trim(),
        email: String(data.get('email') ?? '').trim(),
        password,
      });
      navigate('/sign-in', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('auth.signUpError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={t('auth.signUpEyebrow')}
      title={t('auth.signUpTitle')}
      description={t('auth.signUpDescription')}
    >
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <Field label={t('common.fullName')} name="name" required minLength={2} maxLength={100} autoComplete="name" />
        <Field
          label={t('auth.emailAddress')}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('auth.placeholderEmailAddress')}
        />
        <PasswordField
          label={t('auth.createPassword')}
          name="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          placeholder={t('auth.passwordLengthHint')}
        />
        <PasswordField
          label={t('auth.confirmPassword')}
          name="confirmPassword"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          placeholder={t('auth.passwordRepeatHint')}
        />
        <p className="-mt-3 text-xs text-muted-foreground">{t('auth.signUpPolicyNote')}</p>
        {error && <FormError message={error} />}
        <Button className="w-full" type="submit" disabled={busy}>
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {busy ? t('auth.signUpSubmitting') : t('auth.signUpSubmit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('auth.signUpAvailable')}{' '}
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          {t('auth.continueToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
