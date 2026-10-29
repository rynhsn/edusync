import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { acceptAdminActivation, lookupAdminActivation } from '@/lib/school-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { FormError, Loading, PasswordField, readConfirmedPassword } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function ActivateAdminPage() {
  const { token = '' } = useParams();
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'activated'>('loading');
  const [activation, setActivation] = useState<{ email?: string; name?: string; schoolName?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    lookupAdminActivation({ token })
      .then((result) => {
        if (!active) return;
        setActivation(result);
        setStatus(result.valid ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (active) setStatus('invalid');
      });
    return () => { active = false; };
  }, [token]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await acceptAdminActivation({ token, password: readConfirmedPassword(data) });
      setStatus('activated');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('auth.activateError'));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <AuthLayout eyebrow={t('auth.activateEyebrow')} title={t('auth.activateCheckingTitle')} description={t('auth.activateCheckingDescription')}>
        <Loading label={t('auth.validatingActivation')} />
      </AuthLayout>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout eyebrow={t('auth.activateEyebrow')} title={t('auth.activateUnavailableTitle')} description={t('auth.activateUnavailableDescription')}>
        <Alert variant="destructive">
          <CircleAlert size={16} />
          <AlertTitle>{t('auth.activateCannotUse')}</AlertTitle>
          <AlertDescription>{t('auth.activateAskAdmin')}</AlertDescription>
        </Alert>
        <Button asChild className="mt-5 w-full"><Link to="/sign-in">{t('auth.goToSignIn')}</Link></Button>
      </AuthLayout>
    );
  }

  if (status === 'activated') {
    return (
      <AuthLayout eyebrow={t('auth.activateEyebrow')} title={t('auth.activateAllSetTitle')} description={t('auth.activateAllSetDescription')}>
        <Alert variant="success">
          <Check size={16} />
          <AlertTitle>{t('auth.activateAcceptedTitle')}</AlertTitle>
          <AlertDescription>{t('auth.activateAcceptedDescription', { email: activation.email ?? '' })}</AlertDescription>
        </Alert>
        <Button className="mt-5 w-full" onClick={() => navigate('/sign-in', { replace: true })}>{t('auth.continueToSignIn')}</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow={t('auth.activateEyebrow')}
      title={activation.name ? t('auth.activateWelcomeNamed', { name: activation.name }) : t('auth.activateWelcome')}
      description={t('auth.activateCreateDescription', { school: activation.schoolName ?? '' })}
    >
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        {activation.schoolName && (
          <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{t('auth.schoolLabel')}</span>
            <span className="ml-2 font-medium">{activation.schoolName}</span>
          </div>
        )}
        {activation.email && (
          <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{t('auth.account')}</span>
            <span className="ml-2 font-medium">{activation.email}</span>
          </div>
        )}
        <PasswordField label={t('auth.createPassword')} name="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder={t('auth.passwordLengthHint')} />
        <PasswordField label={t('auth.confirmPassword')} name="confirmPassword" required minLength={12} maxLength={128} autoComplete="new-password" placeholder={t('auth.passwordRepeatHint')} />
        <p className="-mt-3 text-xs text-muted-foreground">{t('auth.activatePolicyNote')}</p>
        {error && <FormError message={error} />}
        <Button className="w-full" type="submit" disabled={busy}>
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {busy ? t('auth.activatingAccount') : t('auth.activateAccount')}
        </Button>
      </form>
    </AuthLayout>
  );
}
