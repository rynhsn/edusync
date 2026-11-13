'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import {
  PORTAL_PATHS,
  type PortalReportDocument,
  type PortalResponseState,
  portalRequest,
} from '@/lib/portal-api';
import { localDateOf, RESPONSE_TEXT_MAX, responseTextIssue, responseWindowState } from '@/lib/report-v2';
import { ReportCardPreview } from '../../../report-cards/preview';
import { Textarea } from '../../../report-cards/textarea';
import { usePortalDetail, usePortalMe } from '../../queries';

/**
 * Formulir "Tanggapan orang tua/wali" di bawah rapor final: menulis, mengubah, dan melihat tanggapan sendiri beserta sisa
 * jendela waktunya. Hanya akun wali yang punya izin menulis tanggapan yang melihatnya.
 */
function ResponseForm({ studentId, semesterId }: { studentId: string; semesterId: string }) {
  const t = useTranslations('portal');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const me = usePortalMe();
  const isGuardian = me.data?.kind === 'guardian';
  const allowed = can('portal:respond') && isGuardian;
  const q = usePortalDetail<PortalResponseState>(
    studentId,
    'report-response',
    PORTAL_PATHS.reportResponse(studentId, semesterId),
    [semesterId],
  );
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const saved = q.data?.response?.text;

  // Isian mengikuti tanggapan tersimpan sampai pengguna mengetik.
  useEffect(() => {
    setText(saved ?? '');
    setTouched(false);
  }, [saved]);

  const save = useMutation({
    mutationFn: () =>
      portalRequest<unknown>('PUT', PORTAL_PATHS.reportResponse(studentId, semesterId), {
        schoolId: school.schoolId,
        body: { text: text.trim() },
      }),
    onSuccess: () => {
      toast.success(t('responseSaved'));
      queryClient.invalidateQueries({ queryKey: ['portal', school.schoolId, 'report-response', studentId] });
      queryClient.invalidateQueries({ queryKey: ['portal', school.schoolId, 'report-card', studentId] });
    },
    onError: (e) => {
      toast.error(te(errorKey(e)));
      // Jendela bisa menutup selagi halaman terbuka: muat ulang status supaya formulir menyesuaikan.
      queryClient.invalidateQueries({ queryKey: ['portal', school.schoolId, 'report-response', studentId] });
    },
  });

  if (!allowed) return null;

  const issue = responseTextIssue(text);
  const state = q.data ? responseWindowState(q.data) : null;
  const dateOf = (iso: string) => formatCalendarDate(locale, localDateOf(iso));
  const mine = q.data?.response ?? null;

  return (
    <section
      className="bg-card grid content-start gap-3 rounded-2xl border p-4"
      aria-labelledby={`resp-${semesterId}`}
    >
      <div>
        <h3 id={`resp-${semesterId}`} className="font-heading font-semibold">
          {t('responseTitle')}
        </h3>
        <p className="text-muted-foreground text-xs">{t('responseHint')}</p>
      </div>

      {q.isPending && <Skeleton className="h-24 w-full rounded-xl" aria-busy />}
      {q.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadErrorBody')}</AlertDescription>
        </Alert>
      )}

      {state?.kind === 'not_final' && (
        <p className="text-muted-foreground text-sm">{t('responseNotFinal')}</p>
      )}

      {state && state.kind !== 'not_final' && (
        <>
          {mine?.outdated && (
            <p>
              <ToneBadge tone="amber" dot={false}>
                {t('responseOutdated')}
              </ToneBadge>
            </p>
          )}
          {state.kind === 'open' ? (
            <form
              className="grid gap-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (!issue) save.mutate();
              }}
            >
              <Label htmlFor={`resp-text-${semesterId}`}>{t('responseLabel')}</Label>
              <Textarea
                id={`resp-text-${semesterId}`}
                rows={5}
                maxLength={RESPONSE_TEXT_MAX}
                value={text}
                aria-invalid={touched && !!issue}
                aria-describedby={`resp-hint-${semesterId}`}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p id={`resp-hint-${semesterId}`} className="text-muted-foreground">
                  {state.closesAt
                    ? t('responseEditableUntil', { date: dateOf(state.closesAt) })
                    : t('responseNoLimit')}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {text.length}/{RESPONSE_TEXT_MAX}
                </p>
              </div>
              {touched && issue && (
                <p role="alert" className="text-destructive text-xs">
                  {issue === 'required'
                    ? t('responseRequired')
                    : t('responseTooLong', { max: RESPONSE_TEXT_MAX })}
                </p>
              )}
              <div>
                <Button type="submit" className="h-11 md:h-8" disabled={save.isPending}>
                  {mine ? t('responseUpdate') : t('responseSend')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {t('responseClosed', { date: state.closesAt ? dateOf(state.closesAt) : '-' })}
              </p>
              {mine ? (
                <div className="rounded-xl border p-3">
                  <p className="text-sm whitespace-pre-wrap">{mine.text}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('responseNone')}</p>
              )}
            </>
          )}
          <p className="text-muted-foreground text-xs">{t('responsePrivacy')}</p>
        </>
      )}
    </section>
  );
}

/** Rapor final satu semester di portal: isi rapor (v1 atau v2, tanpa angka pada mode deskriptif) dan tanggapan wali. */
export function ReportDetail({ studentId, semesterId }: { studentId: string; semesterId: string }) {
  const t = useTranslations('portal');
  const q = usePortalDetail<PortalReportDocument>(
    studentId,
    'report-card',
    PORTAL_PATHS.reportCard(studentId, semesterId),
    [semesterId],
  );
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {q.isPending && <Skeleton className="h-48 w-full rounded-2xl" aria-busy />}
      {q.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('reportError')}</AlertDescription>
        </Alert>
      )}
      {q.data && (
        <>
          {/* Tanggapan ditampilkan lewat formulir di bawah, bukan di dalam isi rapor. */}
          <ReportCardPreview doc={q.data} display={{ showGuardianResponse: false }} />
          <ResponseForm studentId={studentId} semesterId={semesterId} />
        </>
      )}
    </div>
  );
}
