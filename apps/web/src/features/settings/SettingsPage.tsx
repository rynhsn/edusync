import { useState, type FormEvent } from 'react';
import { Check, KeyRound, LoaderCircle, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePlatformPassword, updatePlatformProfile } from '@/lib/platform-api';
import type { SessionUser } from '@/features/types';
import { FormError, PASSWORD_MISMATCH_MESSAGE, PasswordField } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function SettingsPage({
  user,
  onProfileUpdated,
  onPasswordChanged,
}: {
  user: SessionUser | null;
  onProfileUpdated: (nextName: string, message: string) => void;
  onPasswordChanged: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(user?.name ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const roleLabel = user?.role === 'platform_admin'
    ? t('common.platformAdmin')
    : user?.role === 'platform_user'
      ? t('common.platformUser')
      : t('common.readOnly');

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    try {
      const updated = await updatePlatformProfile({ name });
      setName(updated.name);
      onProfileUpdated(updated.name, t('settings.profileSaved'));
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : t('settings.profileError'));
    } finally {
      setProfileBusy(false);
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPasswordBusy(true);
    setPasswordError('');
    const form = new FormData(formElement);
    try {
      const currentPassword = String(form.get('currentPassword') ?? '');
      const newPassword = String(form.get('newPassword') ?? '');
      const confirmPassword = String(form.get('confirmPassword') ?? '');
      if (newPassword !== confirmPassword) {
        throw new Error(PASSWORD_MISMATCH_MESSAGE);
      }
      await changePlatformPassword({ currentPassword, newPassword });
      formElement.reset();
      onPasswordChanged(t('settings.passwordSaved'));
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : t('settings.passwordError'));
    } finally {
      setPasswordBusy(false);
    }
  };

  return <div className="grid gap-6 xl:grid-cols-2">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground"><UserRound size={18} /></span>
          <div>
            <CardTitle>{t('settings.profileTitle')}</CardTitle>
            <CardDescription>{t('settings.profileDescription')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void submitProfile(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">{t('common.fullName')}</Label>
            <Input
              id="settings-name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">{t('auth.emailAddress')}</Label>
            <Input id="settings-email" value={user?.email ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-role">{t('settings.roleLabel')}</Label>
            <Input id="settings-role" value={roleLabel} disabled readOnly />
          </div>
          {profileError && <FormError message={profileError} />}
          <div className="flex justify-end">
            <Button type="submit" disabled={profileBusy}>
              {profileBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
              {profileBusy ? t('settings.savingProfile') : t('settings.saveProfile')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground"><KeyRound size={18} /></span>
          <div>
            <CardTitle>{t('settings.passwordTitle')}</CardTitle>
            <CardDescription>{t('settings.passwordDescription')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void submitPassword(event)}>
          <PasswordField
            label={t('settings.currentPassword')}
            name="currentPassword"
            required
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
          />
          <PasswordField
            label={t('settings.newPassword')}
            name="newPassword"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder={t('auth.passwordLengthHint')}
          />
          <PasswordField
            label={t('settings.confirmPassword')}
            name="confirmPassword"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder={t('auth.passwordRepeatHint')}
          />
          {passwordError && <FormError message={passwordError} />}
          <div className="flex justify-end">
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {passwordBusy ? t('settings.savingPassword') : t('settings.savePassword')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>;
}
