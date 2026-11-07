'use client';

import { CircleCheck, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { type HelpField, validateHelp } from '@/lib/password-help';
import { useSite } from '@/lib/site';

const ORDER: readonly HelpField[] = ['name', 'info', 'phone', 'identifier'];

/** Lapor lupa kata sandi ke admin sekolah. Hanya di alamat sekolah; jawaban server selalu sama (tidak membocorkan akun). */
export function HelpView() {
  const t = useTranslations('passwordHelp');
  const tf = useTranslations('formValidation');
  const te = useTranslations();
  const site = useSite();
  const [values, setValues] = useState({ name: '', info: '', phone: '', identifier: '' });
  const [trap, setTrap] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const v = useFormValidation<HelpField>({ errors: validateHelp(values), order: ORDER, idPrefix: 'ph' });
  const set = (key: HelpField) => (value: string) => setValues((cur) => ({ ...cur, [key]: value }));

  if (!site.ready) return <Skeleton className="h-96 w-full max-w-md rounded-3xl" />;

  if (site.kind !== 'school') {
    return (
      <div className="bg-card grid w-full max-w-md justify-items-center gap-2 rounded-3xl border p-8 text-center">
        <KeyRound className="text-primary size-8" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">{t('mainHostTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('mainHostBody')}</p>
      </div>
    );
  }
  const slug = site.slug;

  if (sent) {
    return (
      <div className="bg-card grid w-full max-w-md justify-items-center gap-3 rounded-3xl border p-8 text-center">
        <CircleCheck className="text-primary size-10" aria-hidden />
        <h1 className="font-heading text-xl font-semibold">{t('successTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('successBody')}</p>
        <Button render={<Link href="/login" />} variant="outline" className="mt-2">
          {t('backToLogin')}
        </Button>
      </div>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      unwrap(
        await api.POST('/v1/public/password-help', {
          body: {
            slug,
            claimedName: values.name.trim(),
            claimedInfo: values.info.trim() || undefined,
            contactPhone: values.phone.trim(),
            identifier: values.identifier.trim() || undefined,
            website: trap || undefined,
          },
        }),
      );
      setSent(true);
    } catch (e) {
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
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('helpTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('helpBody')}</p>
      </div>

      <form
        noValidate
        className="grid gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!v.attempt()) return;
          void submit();
        }}
      >
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid content-start gap-2">
          <Label htmlFor={v.idOf('name')}>{t('fullName')}</Label>
          <Input
            {...v.fieldProps('name')}
            autoComplete="name"
            className="h-11"
            value={values.name}
            onChange={(e) => set('name')(e.target.value)}
          />
          <FieldError id={v.idOf('name')} issue={v.issue('name')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={v.idOf('info')}>{t('info')}</Label>
          <Textarea
            {...v.fieldProps('info')}
            rows={3}
            value={values.info}
            onChange={(e) => set('info')(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('infoHint')}</p>
          <FieldError id={v.idOf('info')} issue={v.issue('info')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={v.idOf('phone')}>{t('phone')}</Label>
          <Input
            {...v.fieldProps('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="081234567890"
            className="h-11"
            value={values.phone}
            onChange={(e) => set('phone')(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('phoneHint')}</p>
          <FieldError id={v.idOf('phone')} issue={v.issue('phone')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={v.idOf('identifier')}>{t('identifierLabel')}</Label>
          <Input
            {...v.fieldProps('identifier')}
            autoComplete="off"
            className="h-11"
            value={values.identifier}
            onChange={(e) => set('identifier')(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('identifierHint')}</p>
          <FieldError id={v.idOf('identifier')} issue={v.issue('identifier')} />
        </div>
        {/* Jebakan bot: tidak terlihat dan tidak bisa difokuskan oleh manusia. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
          />
        </div>
        {v.summary && <p className="text-destructive text-sm">{tf('summary')}</p>}
        <Button type="submit" disabled={pending} className="h-11 text-base">
          {pending ? t('sending') : t('submit')}
        </Button>
      </form>
    </div>
  );
}
