'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Footprints, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { Textarea } from '../report-cards/textarea';
import { todayIso } from './lib';
import { type PklPlacement, pklKey } from './shared';

/** Kunjungan monitoring guru ke tempat PKL: daftar dan tambah. */
export function VisitsPanel({ placement }: { placement: PklPlacement }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const writable = placement.canWrite && placement.status !== 'cancelled';

  const [date, setDate] = useState(todayIso());
  const [teacherId, setTeacherId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visits = useQuery({
    queryKey: pklKey(school.schoolId, 'visits', placement.id),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/pkl/placements/{id}/visits', {
          params: { ...header, path: { id: placement.id } },
        }),
      ),
  });
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId],
    enabled: writable && can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/pkl/visits/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const list = visits.data ?? [];

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">{t('visitsTitle')}</h2>
        {writable && (
          <FormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" aria-hidden /> {t('addVisit')}
              </Button>
            }
            title={t('addVisit')}
            description={t('visitDescription')}
            submitLabel={t('save')}
            error={error}
            disabled={!date || !notes.trim()}
            onOpenChange={(o) => {
              if (o) {
                setDate(todayIso());
                setTeacherId('');
                setNotes('');
                setError(null);
              }
            }}
            onSubmit={async () => {
              try {
                unwrap(
                  await api.POST('/v1/pkl/placements/{id}/visits', {
                    params: { ...header, path: { id: placement.id } },
                    body: { date, notes: notes.trim(), teacherId: teacherId || null },
                  }),
                );
                toast.success(t('visitSaved'));
                refresh();
              } catch (e) {
                setError(te(errorKey(e)));
                throw e;
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="vs-date">{t('date')}</Label>
              <DatePicker id="vs-date" value={date} onChange={setDate} />
            </div>
            {can('teacher:read') && (
              <div className="grid gap-2">
                <Label htmlFor="vs-teacher">{t('visitTeacher')}</Label>
                <SelectField id="vs-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">{t('visitTeacherMe')}</option>
                  {(teachers.data ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="vs-notes">{t('visitNotes')}</Label>
              <Textarea
                id="vs-notes"
                rows={4}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormDialog>
        )}
      </div>

      {visits.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {t('visitsEmpty')}
        </div>
      ) : (
        <ol className="relative grid gap-3 border-l-2 border-orange-200 pl-5 dark:border-orange-500/30">
          {list.map((v) => (
            <li key={v.id} className="bg-card relative rounded-xl border p-3.5">
              <span
                aria-hidden
                className="absolute top-4 -left-[1.72rem] flex size-5 items-center justify-center rounded-full bg-orange-500 text-white"
              >
                <Footprints className="size-3" />
              </span>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatCalendarDate(locale, v.date)}</p>
                  <p className="text-muted-foreground text-xs">{v.teacherName ?? t('visitUnknownTeacher')}</p>
                  <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">{v.notes}</p>
                </div>
                {writable && (
                  <ConfirmDialog
                    destructive
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={t('deleteVisit')}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    }
                    title={t('confirm.visitTitle')}
                    description={formatCalendarDate(locale, v.date)}
                    confirmLabel={t('deleteVisit')}
                    pending={remove.isPending}
                    onConfirm={() => remove.mutateAsync(v.id)}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
