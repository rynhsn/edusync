'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { EntryForm } from '../entry-form';
import { formatRange, GeoPattern, QUALITY_STYLE, shiftIso, todayIso } from '../shared';

export function EntriesPanel({
  halaqahId,
  canWrite,
}: {
  halaqahId: string;
  yearId: string;
  canWrite: boolean;
}) {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [removing, setRemoving] = useState<string | null>(null);
  const today = todayIso();
  const from = shiftIso(today, -13);

  const members = useQuery({
    queryKey: ['tahfidz-members', school.schoolId, halaqahId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah/{id}/members', { params: { ...header, path: { id: halaqahId } } }),
      ),
  });
  const entries = useQuery({
    queryKey: ['tahfidz-entries', school.schoolId, 'halaqah', halaqahId, from, today],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/entries', {
          params: { ...header, query: { halaqahId, from, to: today } },
        }),
      ),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/tahfidz/entries/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('entryDeleted'));
      for (const k of ['tahfidz-entries', 'tahfidz-progress', 'tahfidz-summary', 'tahfidz-halaqah'])
        queryClient.invalidateQueries({ queryKey: [k, school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const students = (members.data ?? []).map((m) => ({ id: m.studentId, name: m.name }));
  const rows = [...(entries.data?.items ?? [])].sort((a, b) =>
    a.date === b.date ? 0 : a.date < b.date ? 1 : -1,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,32rem)_1fr]">
      {canWrite && (
        <Card className="h-fit gap-4 p-5">
          <h2 className="font-heading font-semibold">{t('quickEntry')}</h2>
          {members.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : students.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('addMembersFirst')}</p>
          ) : (
            <EntryForm idPrefix="halaqah-entry" students={students} />
          )}
        </Card>
      )}

      <div className="grid content-start gap-3">
        <h2 className="font-heading font-semibold">{t('recentEntries')}</h2>
        {entries.isPending && <Skeleton className="h-48 w-full rounded-2xl" />}
        {entries.data && rows.length === 0 && (
          <Card className="relative overflow-hidden px-6 py-12 text-center">
            <GeoPattern className="text-chart-5 opacity-[0.07]" />
            <div className="relative mx-auto grid max-w-xs justify-items-center gap-2">
              <BookOpenCheck className="text-chart-5 size-8" />
              <p className="font-medium">{t('noEntriesTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('noEntriesBody')}</p>
            </div>
          </Card>
        )}
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex-row items-center gap-3 p-3">
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full',
                    r.kind === 'ziyadah' ? 'bg-chart-5/15 text-chart-5' : 'bg-chart-2/20 text-foreground',
                  )}
                  title={t(`kindName.${r.kind}`)}
                >
                  {r.kind === 'ziyadah' ? <Sparkles className="size-4" /> : <RotateCcw className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <Link href={`/tahfidz/siswa/${r.studentId}`} className="font-medium hover:underline">
                      {r.studentName}
                    </Link>{' '}
                    <span className="text-muted-foreground">· {formatRange(r)}</span>
                  </p>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{formatCalendarDate(locale, r.date)}</span>
                    <span className="flex items-center gap-1">
                      <span className={cn('size-2 rounded-full', QUALITY_STYLE[r.quality].dot)} />
                      {t(`qualityName.${r.quality}`)}
                    </span>
                    {r.note && <span className="truncate">“{r.note}”</span>}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('deleteEntry')} ${r.studentName}`}
                    title={t('deleteEntry')}
                    onClick={() => setRemoving(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        title={t('deleteEntryTitle')}
        description={t('deleteEntryBody')}
        confirmLabel={t('deleteEntry')}
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing);
        }}
      />
    </div>
  );
}
