import { useState } from 'react';
import { BookOpen, LoaderCircle, Pencil, Plus } from 'lucide-react';
import type { ClassUpdateInput, SchoolClass } from '@edusync/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClass, updateClass } from '@/lib/school-api';
import { EmptyState, FormError, Loading } from '@/features/shared';
import { useTranslation } from '@/i18n';

type FormValues = { name: string; gradeLevel: string; capacity: string };

const emptyForm: FormValues = { name: '', gradeLevel: '7', capacity: '' };

function ClassForm({ mode, schoolClass, onDone, onCancel }: { mode: 'create' | 'edit'; schoolClass?: SchoolClass; onDone: (message: string) => Promise<void> | void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormValues>(() => schoolClass
    ? { name: schoolClass.name, gradeLevel: String(schoolClass.gradeLevel), capacity: schoolClass.capacity === null ? '' : String(schoolClass.capacity) }
    : emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<FormValues>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const gradeLevel = Number(form.gradeLevel);
    if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12) { setError(t('classes.errorGrade')); return; }
    const capacity = form.capacity.trim() === '' ? null : Number(form.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) { setError(t('classes.errorCapacity')); return; }
    setBusy(true);
    try {
      const name = form.name.trim();
      if (mode === 'create') {
        await createClass({ name, gradeLevel, capacity });
        await onDone(t('classes.created', { name }));
      } else {
        const patch: ClassUpdateInput = { name, gradeLevel, capacity };
        await updateClass(schoolClass!.id, patch);
        await onDone(t('classes.updated', { name }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('classes.saveFailed')); }
    finally { setBusy(false); }
  };

  return <form className="space-y-4" onSubmit={submit}>
    {error && <FormError message={error} />}
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="name">{t('classes.nameLabel')}</Label><Input id="name" name="name" required maxLength={50} placeholder="7A" value={form.name} onChange={(event) => set({ name: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gradeLevel">{t('classes.gradeLabel')}</Label><Input id="gradeLevel" name="gradeLevel" type="number" min={1} max={12} required value={form.gradeLevel} onChange={(event) => set({ gradeLevel: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="capacity">{t('classes.capacityLabel')}</Label><Input id="capacity" name="capacity" type="number" min={1} max={200} placeholder={t('common.optional')} value={form.capacity} onChange={(event) => set({ capacity: event.target.value })} /></div>
    </div>
    <p className="text-xs text-muted-foreground">{t('classes.capacityHint')}</p>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === 'create' ? t('classes.createSubmit') : t('common.saveChanges')}</Button></div>
  </form>;
}

export function ClassesPage({ classes, loading, canManage, onChanged }: { classes: SchoolClass[]; loading: boolean; canManage: boolean; onChanged: (message: string, tone?: 'success' | 'warning') => Promise<void> | void }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);

  if (loading && classes.length === 0) return <Loading label={t('classes.loading')} />;

  return <div className="space-y-5">
    {canManage && <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('classes.add')}</Button></div>}

    {classes.length === 0
      ? <Card><CardContent className="p-0"><EmptyState icon={<BookOpen size={22} />} title={t('classes.emptyTitle')} description={t('classes.emptyDescription')} action={canManage ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('classes.add')}</Button> : undefined} /></CardContent></Card>
      : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{classes.map((schoolClass) => {
        const { capacity } = schoolClass;
        const seats = capacity === null ? null : { fill: Math.min(100, Math.round((schoolClass.studentCount / capacity) * 100)), remaining: capacity - schoolClass.studentCount, full: schoolClass.studentCount >= capacity };
        return <Card key={schoolClass.id}><CardContent className="p-5 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-display text-lg font-extrabold tracking-tight">{schoolClass.name}</p><p className="text-xs text-muted-foreground">{t('classes.gradeLevel', { grade: schoolClass.gradeLevel })}</p></div>{canManage && <Button variant="ghost" size="icon" aria-label={t('common.editName', { name: schoolClass.name })} onClick={() => setEditing(schoolClass)}><Pencil size={15} /></Button>}</div>
          <div className="mt-4 flex items-baseline gap-1.5"><span className="font-display text-2xl font-extrabold">{schoolClass.studentCount}</span><span className="text-sm text-muted-foreground">{capacity === null ? t('classes.noLimit') : t('classes.ofSeats', { capacity })}</span></div>
          {seats === null
            ? <p className="mt-2 text-xs text-muted-foreground">{t('classes.noCapacity')}</p>
            : <><div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${seats.full ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${seats.fill}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{seats.full ? t('classes.full') : t('classes.seatsAvailable', { count: seats.remaining })}</p></>}
        </CardContent></Card>;
      })}</div>}

    {!canManage && <p className="text-xs text-muted-foreground">{t('classes.readOnlyNote')}</p>}

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>{t('classes.createTitle')}</DialogTitle><DialogDescription>{t('classes.createDescription')}</DialogDescription></DialogHeader>{creating && <ClassForm mode="create" onCancel={() => setCreating(false)} onDone={async (message) => { setCreating(false); await onChanged(message); }} />}</DialogContent></Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{t('classes.editTitle')}</DialogTitle><DialogDescription>{t('classes.editDescription')}</DialogDescription></DialogHeader>{editing && <ClassForm mode="edit" schoolClass={editing} onCancel={() => setEditing(null)} onDone={async (message) => { setEditing(null); await onChanged(message); }} />}</DialogContent></Dialog>
  </div>;
}
