'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { guardianResponseRows, localDateOf, RESPONSE_TEXT_MAX, responseWindowState } from '@/lib/report-v2';
import { validateResponseText } from './report-card-validation';
import { Textarea } from './textarea';

interface Target {
  studentId: string;
  name: string;
}

/**
 * Tanggapan orang tua/wali atas rapor final satu murid: daftar wali beserta tanggapannya, dan penyalinan tanggapan dari
 * rapor kertas oleh staf atas nama wali. Tanggapan yang ditulis wali sendiri lewat portal tidak ditimpa.
 */
export function ResponsesDialog({
  semesterId,
  target,
  onClose,
}: {
  semesterId: string;
  target: Target | null;
  onClose: () => void;
}) {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const studentId = target?.studentId ?? '';
  const [copyFor, setCopyFor] = useState<{ id: string; name: string; text: string } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation<'text'>({
    errors: validateResponseText(text),
    order: ['text'],
    idPrefix: 'rc-resp',
  });

  const key = ['report-card-responses', school.schoolId, semesterId, studentId];
  const data = useQuery({
    queryKey: key,
    enabled: !!target,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/report-cards/responses', {
          params: { ...header, query: { semesterId, studentId } },
        }),
      ),
  });

  useEffect(() => {
    if (!target) setCopyFor(null);
  }, [target]);

  const save = useMutation({
    mutationFn: async (guardianId: string) =>
      unwrap(
        await api.PUT('/v1/report-cards/responses', {
          params: header,
          body: { semesterId, studentId, guardianId, text: text.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success(t('responseSaved'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId, semesterId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const rows = data.data ? guardianResponseRows(data.data.guardians, data.data.responses) : [];
  const state = data.data ? responseWindowState(data.data) : null;
  const dateOf = (iso: string) => formatCalendarDate(locale, localDateOf(iso));

  return (
    <>
      <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('responsesTitle')}</DialogTitle>
            <DialogDescription>{target?.name}</DialogDescription>
          </DialogHeader>
          {data.isPending && <Skeleton className="h-32 w-full" />}
          {data.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(data.error))}</AlertDescription>
            </Alert>
          )}
          {state && (
            <p className="text-muted-foreground text-sm">
              {state.kind === 'not_final'
                ? t('responsesNotFinal')
                : state.kind === 'closed'
                  ? t('responsesClosed', { date: state.closesAt ? dateOf(state.closesAt) : '-' })
                  : state.closesAt
                    ? t('responsesOpenUntil', { date: dateOf(state.closesAt) })
                    : t('responsesOpenNoLimit')}
            </p>
          )}
          {data.data && rows.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('responsesNoGuardians')}</p>
          )}
          <ul className="grid gap-3">
            {rows.map(({ guardian, response, staffCanCopy }) => (
              <li key={guardian.id} className="grid min-w-0 gap-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {guardian.name}
                    <span className="text-muted-foreground text-sm"> · {guardian.relation}</span>
                  </p>
                  {response && (
                    <div className="flex flex-wrap gap-1.5">
                      <ToneBadge
                        tone={response.recordedByKind === 'guardian' ? 'emerald' : 'sky'}
                        dot={false}
                      >
                        {t(response.recordedByKind === 'guardian' ? 'responseByGuardian' : 'responseByStaff')}
                      </ToneBadge>
                      {response.outdated && (
                        <ToneBadge tone="amber" dot={false}>
                          {t('responseOutdated')}
                        </ToneBadge>
                      )}
                    </div>
                  )}
                </div>
                {response ? (
                  <p className="text-sm whitespace-pre-wrap">{response.text}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('responseNone')}</p>
                )}
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 md:h-8"
                    disabled={!staffCanCopy || state?.kind !== 'open'}
                    onClick={() => {
                      setError(null);
                      validation.reset();
                      setText(response?.text ?? '');
                      setCopyFor({ id: guardian.id, name: guardian.name, text: response?.text ?? '' });
                    }}
                  >
                    {t('responseCopy')}
                  </Button>
                  {!staffCanCopy && (
                    <p className="text-muted-foreground mt-1 text-xs">{t('responseGuardianOwn')}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={!!copyFor}
        title={t('responseCopyTitle')}
        description={copyFor ? t('responseCopyFor', { name: copyFor.name }) : undefined}
        submitLabel={t('save')}
        error={error}
        validation={validation}
        disabled={save.isPending}
        onOpenChange={(o) => {
          if (!o) setCopyFor(null);
        }}
        onSubmit={() => save.mutateAsync(copyFor?.id ?? '')}
      >
        <div className="grid content-start gap-2">
          <Label htmlFor={validation.idOf('text')}>{t('guardianResponse')}</Label>
          <Textarea
            {...validation.fieldProps('text')}
            rows={6}
            maxLength={RESPONSE_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <FieldError id={validation.idOf('text')} issue={validation.issue('text')} />
          <p className="text-muted-foreground text-xs">{t('responseCopyHint')}</p>
          <p className="text-muted-foreground text-right text-xs tabular-nums">
            {text.length}/{RESPONSE_TEXT_MAX}
          </p>
        </div>
      </FormDialog>
    </>
  );
}
