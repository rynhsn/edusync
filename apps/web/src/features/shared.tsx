import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import type { PlatformTenant } from '@edusync/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation, type Locale, type MessageKey } from '@/i18n';

export function Brand() { const { t } = useTranslation(); return <Link to="/" className="flex items-center gap-2.5" aria-label={t('common.brandHome')}><span className="grid size-9 grid-cols-2 gap-1 rounded-xl bg-primary p-2"><i className="rounded-sm bg-white" /><i className="rounded-sm bg-white/60" /><i className="rounded-sm bg-white/60" /><i className="rounded-sm bg-white" /></span><span className="font-display text-lg font-extrabold tracking-tight">edusync<span className="text-primary">.</span><span className="ml-2 text-xs font-medium text-muted-foreground">Platform</span></span></Link>; }

export function Field({ label, name, type = 'text', required, minLength, maxLength, placeholder, autoComplete }: { label: string; name: string; type?: string; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string; autoComplete?: string }) { return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} minLength={minLength} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} /></div>; }

/**
 * A password input with its own show/hide toggle.
 *
 * Both places that create a new password (accepting an invitation and resetting a forgotten one)
 * render the same bespoke markup, so it lives here rather than being copied twice. The toggle's
 * accessible name includes the label, because a form with a password and its confirmation would
 * otherwise expose two buttons both named "Show password".
 */
export function PasswordField({ label, name, required, minLength, maxLength, placeholder, autoComplete }: { label: string; name: string; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const action = t(visible ? 'common.hide' : 'common.show');
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><div className="relative"><Input id={name} name={name} type={visible ? 'text' : 'password'} required={required} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} className="pr-11" placeholder={placeholder} /><button type="button" aria-label={`${action} ${label.toLowerCase()}`} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>;
}

export const PASSWORD_MISMATCH_MESSAGE = 'The two passwords do not match.';

/**
 * Read the password and its confirmation from a submitted form.
 *
 * Throws before any request is sent when they differ, so a mistyped confirmation never spends an
 * attempt of the reset code's five-attempt budget or a single-use invitation. The server still
 * enforces the 12–128 character rule; this only covers agreement.
 */
export function readConfirmedPassword(values: FormData): string {
  const password = String(values.get('password') ?? '');
  if (password !== String(values.get('confirmPassword') ?? '')) throw new Error(PASSWORD_MISMATCH_MESSAGE);
  return password;
}

export function FormError({ message }: { message: string }) { return <Alert variant="destructive"><CircleAlert size={16} /><AlertDescription>{message}</AlertDescription></Alert>; }

export function Loading({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</div>; }

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center py-12 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">{icon}</span><h3 className="mt-4 font-display text-base font-bold">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>; }

export function TenantStatus({ status }: { status: PlatformTenant['status'] }) {
  const { t } = useTranslation();
  const map = { active: ['status.active', 'success'], provisioning: ['status.provisioning', 'warning'], provisioning_failed: ['status.provisioningFailed', 'danger'], suspended: ['status.suspended', 'secondary'] } as const satisfies Record<PlatformTenant['status'], readonly [MessageKey, string]>;
  const [labelKey, variant] = map[status];
  return <Badge variant={variant}>{t(labelKey)}</Badge>;
}

export function formatDate(value: string, locale?: Locale) { return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
