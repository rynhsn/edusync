import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { StudentStatus } from '@edusync/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation, type Locale, type MessageKey } from '@/i18n';

export function Brand() { const { t } = useTranslation(); return <Link to="/" className="flex items-center gap-2.5" aria-label={t('common.brandHome')}><span className="grid size-9 grid-cols-2 gap-1 rounded-xl bg-primary p-2"><i className="rounded-sm bg-white" /><i className="rounded-sm bg-white/60" /><i className="rounded-sm bg-white/60" /><i className="rounded-sm bg-white" /></span><span className="font-display text-lg font-extrabold tracking-tight">edusync<span className="text-primary">.</span><span className="ml-2 text-xs font-medium text-muted-foreground">{t('common.brandSuffix')}</span></span></Link>; }

export function Field({ label, name, type = 'text', required, minLength, maxLength, placeholder, autoComplete, defaultValue }: { label: string; name: string; type?: string; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string; autoComplete?: string; defaultValue?: string }) { return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} minLength={minLength} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} defaultValue={defaultValue} /></div>; }

export function FormError({ message }: { message: string }) { return <Alert variant="destructive"><CircleAlert size={16} /><AlertDescription>{message}</AlertDescription></Alert>; }

export function Loading({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</div>; }

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center py-12 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">{icon}</span><h3 className="mt-4 font-display text-base font-bold">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>; }

export function StudentStatusBadge({ status }: { status: StudentStatus }) { const { t } = useTranslation(); const map = { AKTIF: ['status.AKTIF', 'success'], LULUS: ['status.LULUS', 'default'], MUTASI: ['status.MUTASI', 'warning'], KELUAR: ['status.KELUAR', 'danger'] } as const satisfies Record<StudentStatus, readonly [MessageKey, string]>; const [key, variant] = map[status]; return <Badge variant={variant}>{t(key)}</Badge>; }

export function formatDate(value: string, locale?: Locale) { return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
