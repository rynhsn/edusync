import { useState } from 'react';
import { CalendarRange, CheckCircle2, LoaderCircle, Pencil, Plus } from 'lucide-react';
import type { AcademicYear } from '@edusync/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAcademicYear, updateAcademicYear } from '@/lib/school-api';
import { EmptyState, FormError, Loading, formatDate } from '@/features/shared';
import { useTranslation, type Locale, type MessageKey } from '@/i18n';

type FormValues = { name: string; startsOn: string; endsOn: string; isActive: boolean };

const emptyForm: FormValues = { name: '', startsOn: '', endsOn: '', isActive: false };

function AcademicYearForm({ mode, academicYear, onDone, onCancel }: { mode: 'create' | 'edit'; academicYear?: AcademicYear; onDone: (message: string) => Promise<void> | void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormValues>(() => academicYear
    ? { name: academicYear.name, startsOn: academicYear.startsOn, endsOn: academicYear.endsOn, isActive: academicYear.isActive }
    : emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<FormValues>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (form.startsOn >= form.endsOn) { setError(t('academicYears.errorDates')); return; }
    setBusy(true);
    try {
      const payload = { name: form.name.trim(), startsOn: form.startsOn, endsOn: form.endsOn, isActive: form.isActive };
      if (mode === 'create') {
        await createAcademicYear(payload);
        await onDone(t('academicYears.created', { name: payload.name }));
      } else {
        await updateAcademicYear(academicYear!.id, payload);
        await onDone(t('academicYears.updated', { name: payload.name }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('academicYears.saveFailed')); }
    finally { setBusy(false); }
  };

  return <form className="space-y-4" onSubmit={submit}>
    {error && <FormError message={error} />}
    <div className="space-y-1.5"><Label htmlFor="name">{t('academicYears.nameLabel')}</Label><Input id="name" name="name" required minLength={4} maxLength={20} placeholder="2026/2027" value={form.name} onChange={(event) => set({ name: event.target.value })} /></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="startsOn">{t('academicYears.startsOnLabel')}</Label><Input id="startsOn" name="startsOn" type="date" required value={form.startsOn} onChange={(event) => set({ startsOn: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="endsOn">{t('academicYears.endsOnLabel')}</Label><Input id="endsOn" name="endsOn" type="date" required value={form.endsOn} onChange={(event) => set({ endsOn: event.target.value })} /></div>
    </div>
    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} /><span><strong className="block font-semibold">{t('academicYears.setActiveLabel')}</strong><span className="text-xs text-muted-foreground">{t('academicYears.setActiveHint')}</span></span></label>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === 'create' ? t('academicYears.createSubmit') : t('common.saveChanges')}</Button></div>
  </form>;
}

export function AcademicYearsPage({ academicYears, loading, canManage, onChanged }: { academicYears: AcademicYear[]; loading: boolean; canManage: boolean; onChanged: (message: string, tone?: 'success' | 'warning') => Promise<void> | void }) {
  const { locale, t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState('');

  const activate = async (year: AcademicYear) => {
    setActivatingId(year.id); setActivateError('');
    try {
      await updateAcademicYear(year.id, { isActive: true });
      await onChanged(t('academicYears.activated', { name: year.name }));
    } catch (cause) { setActivateError(cause instanceof Error ? cause.message : t('academicYears.activateFailed')); }
    finally { setActivatingId(null); }
  };

  if (loading && academicYears.length === 0) return <Loading label={t('academicYears.loading')} />;

  return <div className="space-y-5">
    {canManage && <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('academicYears.add')}</Button></div>}
    {activateError && <FormError message={activateError} />}

    {academicYears.length === 0
      ? <Card><CardContent className="p-0"><EmptyState icon={<CalendarRange size={22} />} title={t('academicYears.emptyTitle')} description={t('academicYears.emptyDescription')} action={canManage ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('academicYears.add')}</Button> : undefined} /></CardContent></Card>
      : <Card><CardContent className="p-0 sm:p-0"><ul className="divide-y divide-border">{academicYears.map((year) => <li key={year.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${year.isActive ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}><CalendarRange size={18} /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{year.name}</p>{year.isActive && <Badge variant="success">{t('status.active')}</Badge>}</div><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(year.startsOn, locale)} – {formatDate(year.endsOn, locale)}</p></div>
        {canManage && <div className="flex items-center gap-1">{!year.isActive && <Button variant="secondary" size="sm" disabled={activatingId !== null} onClick={() => void activate(year)}>{activatingId === year.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}{t('academicYears.setActive')}</Button>}<Button variant="ghost" size="icon" aria-label={t('common.editName', { name: year.name })} onClick={() => setEditing(year)}><Pencil size={15} /></Button></div>}
      </li>)}</ul></CardContent></Card>}

    {!canManage && <p className="text-xs text-muted-foreground">{t('academicYears.readOnlyNote')}</p>}

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>{t('academicYears.createTitle')}</DialogTitle><DialogDescription>{t('academicYears.createDescription')}</DialogDescription></DialogHeader>{creating && <AcademicYearForm mode="create" onCancel={() => setCreating(false)} onDone={async (message) => { setCreating(false); await onChanged(message); }} />}</DialogContent></Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{t('academicYears.editTitle')}</DialogTitle><DialogDescription>{t('academicYears.editDescription')}</DialogDescription></DialogHeader>{editing && <AcademicYearForm mode="edit" academicYear={editing} onCancel={() => setEditing(null)} onDone={async (message) => { setEditing(null); await onChanged(message); }} />}</DialogContent></Dialog>
  </div>;
}