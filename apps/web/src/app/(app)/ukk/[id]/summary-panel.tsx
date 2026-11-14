'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { EventDialog } from '../event-dialog';
import { type UkkEvent, ukkKey } from '../lib';
import { markerDate } from '../shared';

/** Ringkasan kegiatan: identitas, penanda lapor Dinas/e-Rapor (manual), ubah, dan hapus. */
export function SummaryPanel({ event }: { event: UkkEvent }) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { school, can } = useSchool();
  const manage = can('ukk:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reporting = useMutation({
    mutationFn: async (body: { reportedToDinasAt: string | null; pushedToEraporAt: string | null }) =>
      unwrap(
        await api.PUT('/v1/ukk/events/{id}/reporting', {
          params: { ...header, path: { id: event.id } },
          body,
        }),
      ),
    onSuccess: () => {
      setError(null);
      toast.success(t('reporting.saved'));
      queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/ukk/events/{id}', { params: { ...header, path: { id: event.id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
      router.push('/ukk');
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const rows: [string, string | null][] = [
    [t('form.pattern'), t(`patterns.${event.pattern}`)],
    [t('form.scheme'), event.schemeName],
    [t('form.tuk'), event.tukName],
    [t('form.kkni'), event.kkniLevel === null ? null : `KKNI ${event.kkniLevel}`],
    [t('form.lsp'), event.lspName],
    [t('form.lspRef'), event.lspLicenseRef],
    [t('form.partner'), event.partnerName],
    [t('form.semester'), event.semesterName],
    [t('form.concentration'), event.concentrationName],
    [
      t('form.period'),
      event.startsOn
        ? [event.startsOn, event.endsOn]
            .filter((d): d is string => !!d)
            .map((d) => formatCalendarDate(locale, d))
            .join(' - ')
        : null,
    ],
  ];

  const marker = (field: 'reportedToDinasAt' | 'pushedToEraporAt', label: string) => {
    const at = event[field];
    return (
      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id={`uk-${field}`}
          className="mt-1"
          checked={!!at}
          disabled={!manage || reporting.isPending}
          onCheckedChange={(v) =>
            reporting.mutate({
              reportedToDinasAt:
                field === 'reportedToDinasAt'
                  ? v === true
                    ? new Date().toISOString()
                    : null
                  : event.reportedToDinasAt,
              pushedToEraporAt:
                field === 'pushedToEraporAt'
                  ? v === true
                    ? new Date().toISOString()
                    : null
                  : event.pushedToEraporAt,
            })
          }
        />
        <div className="grid gap-0.5">
          <Label htmlFor={`uk-${field}`}>{label}</Label>
          <p className="text-muted-foreground text-xs">
            {at ? t('reporting.markedOn', { date: markerDate(locale, at) }) : t('reporting.notMarked')}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <section className="bg-card grid gap-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('summary.title')}</h2>
          {manage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10 md:h-8" onClick={() => setOpen(true)}>
                <Pencil className="size-4" aria-hidden /> {t('editEvent')}
              </Button>
              <ConfirmDialog
                destructive
                trigger={
                  <Button variant="outline" className="text-destructive h-10 md:h-8">
                    <Trash2 className="size-4" aria-hidden /> {t('deleteEvent')}
                  </Button>
                }
                title={t('deleteTitle')}
                description={t('deleteBody', { title: event.title })}
                confirmLabel={t('deleteEvent')}
                pending={remove.isPending}
                onConfirm={() => remove.mutateAsync()}
              />
            </div>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-medium break-words">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-card grid gap-3 rounded-xl border p-4">
        <h2 className="font-heading text-lg font-semibold">{t('reporting.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('reporting.hint')}</p>
        {marker('reportedToDinasAt', t('reporting.dinas'))}
        {marker('pushedToEraporAt', t('reporting.erapor'))}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </section>

      <EventDialog open={open} onOpenChange={setOpen} event={event} defaultYearId={event.academicYearId} />
    </div>
  );
}
