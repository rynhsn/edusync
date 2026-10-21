import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { requestPasswordReset, resetPassword, verifyPasswordResetOtp } from '@/lib/platform-api';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Field, FormError, PasswordField, readConfirmedPassword } from '@/features/shared';
import { useTranslation, type MessageKey } from '@/i18n';

const TITLE_KEYS: Record<'email' | 'otp' | 'password' | 'done', MessageKey> = { email: 'auth.resetTitleEmail', otp: 'auth.resetTitleOtp', password: 'auth.resetTitlePassword', done: 'auth.resetTitleDone' };

export function PasswordResetPage() {
  const [step, setStep] = useState<'email' | 'otp' | 'password' | 'done'>('email'); const [email, setEmail] = useState(''); const [otp, setOtp] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const { t } = useTranslation();
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const values = new FormData(event.currentTarget); try {
      if (step === 'email') { const address = String(values.get('email')); setEmail(address); await requestPasswordReset({ email: address }); setStep('otp'); }
      else if (step === 'otp') { const code = String(values.get('otp')); const result = await verifyPasswordResetOtp({ email, otp: code }); if (!result.valid) throw new Error(t('auth.resetInvalidOtp')); setOtp(code); setStep('password'); }
      else if (step === 'password') { const password = readConfirmedPassword(values); const result = await resetPassword({ email, otp, password }); if (!result.reset) throw new Error(t('auth.resetFailedOtp')); setStep('done'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('auth.resetError')); } finally { setBusy(false); } };
  const stepTitle = t(TITLE_KEYS[step]);
  const stepDescription = step === 'otp' ? t('auth.resetDescOtp', { email }) : t(`auth.resetDesc${step === 'email' ? 'Email' : step === 'password' ? 'Password' : 'Done'}`);
  return <AuthLayout eyebrow={t('auth.resetEyebrow')} title={stepTitle} description={stepDescription}>
    {step === 'done' ? <div className="space-y-5"><Alert variant="success"><Check size={16} /><AlertTitle>{t('auth.resetTitleDone')}</AlertTitle><AlertDescription>{t('auth.resetDoneDescription')}</AlertDescription></Alert><Button asChild className="w-full"><Link to="/sign-in">{t('auth.returnToSignIn')}</Link></Button></div> : <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      {step === 'email' && <Field label={t('auth.accountEmail')} name="email" type="email" required autoComplete="email" placeholder="you@edusync.org" />}
      {step === 'otp' && <><Field label={t('auth.otpLabel')} name="otp" required minLength={6} maxLength={6} placeholder={t('auth.otpPlaceholder')} autoComplete="one-time-code" /><p className="-mt-3 text-xs text-muted-foreground">{t('auth.otpNote')}</p></>}
      {step === 'password' && <><PasswordField label={t('auth.newPassword')} name="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder={t('auth.passwordLengthHint')} /><PasswordField label={t('auth.confirmPassword')} name="confirmPassword" required minLength={12} maxLength={128} autoComplete="new-password" placeholder={t('auth.passwordRepeatHint')} /></>}
      {error && <FormError message={error} />}
      <Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? t('auth.pleaseWait') : step === 'email' ? t('auth.sendResetCode') : step === 'otp' ? t('auth.verifyCode') : t('auth.updatePassword')}</Button>
      {step !== 'email' && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setError(''); setStep(step === 'password' ? 'otp' : 'email'); }}>{t('common.back')}</Button>}
    </form>}
    {step !== 'done' && <p className="mt-6 text-center text-sm text-muted-foreground"><Link to="/sign-in" className="font-semibold text-primary hover:underline">{t('auth.returnToSignIn')}</Link></p>}
  </AuthLayout>;
}
