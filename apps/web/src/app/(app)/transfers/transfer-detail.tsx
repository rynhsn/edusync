'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { normalizeReason } from '@/lib/transfer';

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px] font-medium uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** Detail satu mutasi, termasuk keterangan nilai saat pindah (rapor sementara) bila ada. */
export function TransferDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('transfers');
  const tm = useTranslations('masterData');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const show = (iso: string | null) => (iso ? formatCalendarDate(locale, iso) : tm('none'));
  const q = useQuery({
    queryKey: ['student-transfers', school.schoolId, 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/student-transfers/{id}', {
          params: { header: schoolHeader(school.schoolId), path: { id: id as string } },
        }),
      ),
  });
  const d = q.data;
  const doc = d?.departureDocument ?? null;
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {t('detailTitle')}
            {d ? ` · ${d.studentName}` : ''}
          </DialogTitle>
          <DialogDescription>
            {d
              ? d.direction === 'in'
                ? t('directionIn')
                : d.kind === 'dropped'
                  ? t('kindDropped')
                  : t('directionOut')
              : ' '}
          </DialogDescription>
        </DialogHeader>
        {q.isPending && id && <Skeleton className="h-40 w-full rounded-xl" />}
        {q.isError && (
          <Alert variant="destructive">
            <AlertDescription>{tm('loadError')}</AlertDescription>
          </Alert>
        )}
        {d && (
          <div className="grid gap-5">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Item label={t('effectiveOn')}>{show(d.effectiveOn)}</Item>
              <Item label={t('reason')}>{t(`reasons.${normalizeReason(d.reason)}`)}</Item>
              <Item label={d.direction === 'out' ? t('schoolOut') : t('schoolIn')}>
                {d.counterpartSchoolName ?? tm('none')}
              </Item>
              <Item label={t('npsn')}>{d.counterpartNpsn ?? tm('none')}</Item>
              <Item label={t('letterNumber')}>{d.letterNumber ?? tm('none')}</Item>
              <Item label={t('letterDate')}>{show(d.letterDate)}</Item>
              <Item label={d.direction === 'out' ? t('classOut') : t('classPlaced')}>
                {d.className ?? tm('none')}
              </Item>
              {d.reasonNote && <Item label={t('reasonNote')}>{d.reasonNote}</Item>}
              {d.exceptionReason && <Item label={t('exceptionLabel')}>{d.exceptionReason}</Item>}
            </dl>

            {d.direction === 'out' && (
              <section className="grid gap-2 border-t pt-4" aria-labelledby="transfer-doc-title">
                <h3 id="transfer-doc-title" className="font-heading text-sm font-semibold">
                  {t('docTitle')}
                </h3>
                {!doc ? (
                  <p className="text-muted-foreground text-sm">{t('docNone')}</p>
                ) : (
                  <>
                    <p className="text-muted-foreground text-xs">{t('docBody')}</p>
                    <p className="text-sm">
                      {t('docSemester', { semester: doc.semester.name, year: doc.semester.academicYear })}
                      {' · '}
                      {doc.student.className}
                    </p>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">{t('docSubject')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('docScore')}</th>
                            <th className="px-3 py-2 text-center font-semibold">{t('docPredicate')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {doc.subjects.map((s) => (
                            <tr key={s.subjectId} className="border-t">
                              <td className="px-3 py-2">{s.name}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{s.final ?? '-'}</td>
                              <td className="px-3 py-2 text-center">{s.predicate ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-sm font-medium">{t('docAttendance')}</p>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Item label={t('docSick')}>{doc.attendance.sick}</Item>
                      <Item label={t('docExcused')}>{doc.attendance.excused}</Item>
                      <Item label={t('docAbsent')}>{doc.attendance.absent}</Item>
                      <Item label={t('docLate')}>{doc.attendance.late}</Item>
                    </dl>
                    {doc.homeroomNote && <Item label={t('docNote')}>{doc.homeroomNote}</Item>}
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
