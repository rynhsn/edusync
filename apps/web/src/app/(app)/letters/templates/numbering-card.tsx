'use client';

import {
  DEFAULT_AGENDA_PATTERN,
  DEFAULT_NUMBER_PATTERN,
  MAX_SCHOOL_CODE_LENGTH,
  NUMBER_PATTERN_VARIABLES,
  normalizeSchoolCode,
  renderNumberPattern,
  validateNumberPattern,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Inbox, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useHeader } from '../shared';

interface Draft {
  schoolCode: string;
  numberPattern: string;
  agendaPattern: string;
}

/** Contoh nomor dari pola dengan urutan 12 pada bulan berjalan; null bila pola tidak sah. */
function previewOf(pattern: string, code: string): string | null {
  if (!validateNumberPattern(pattern).ok) return null;
  const now = new Date();
  return renderNumberPattern(pattern, { seq: 12, code, month: now.getMonth() + 1, year: now.getFullYear() });
}

/** Kartu "Format nomor": kode sekolah, pola nomor surat keluar, dan pola nomor agenda dengan pratinjau langsung. */
export function NumberingCard() {
  const t = useTranslations('letters.numbering');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('letter:manage');
  const header = useHeader();
  const queryClient = useQueryClient();
  const queryKey = ['letters', school.schoolId, 'numbering'];

  const current = useQuery({
    queryKey,
    queryFn: async () => unwrap(await api.GET('/v1/letters/numbering', { params: header })),
  });
  const [draft, setDraft] = useState<Draft>({ schoolCode: '', numberPattern: '', agendaPattern: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current.data) {
      setDraft({
        schoolCode: current.data.schoolCode ?? '',
        numberPattern: current.data.numberPattern,
        agendaPattern: current.data.agendaPattern,
      });
    }
  }, [current.data]);

  const derived = current.data?.derivedCode ?? '';
  const codeInput = draft.schoolCode.trim();
  const normalizedCode = codeInput === '' ? null : normalizeSchoolCode(codeInput);
  const codeValid = codeInput === '' || normalizedCode !== null;
  const effectiveCode = normalizedCode ?? derived;
  const numberCheck = validateNumberPattern(draft.numberPattern);
  const agendaCheck = validateNumberPattern(draft.agendaPattern);
  const valid = codeValid && numberCheck.ok && agendaCheck.ok;
  const dirty =
    current.data !== undefined &&
    (codeInput.toUpperCase() !== (current.data.schoolCode ?? '') ||
      draft.numberPattern.trim() !== current.data.numberPattern ||
      draft.agendaPattern.trim() !== current.data.agendaPattern);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/letters/numbering', {
          params: header,
          body: {
            schoolCode: normalizedCode,
            numberPattern: draft.numberPattern.trim(),
            agendaPattern: draft.agendaPattern.trim(),
          },
        }),
      ),
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(queryKey, data);
      toast.success(t('saved'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const reasonText = (r: typeof numberCheck) => (r.ok ? null : t(`reason.${r.reason}`));

  const rows: {
    field: 'numberPattern' | 'agendaPattern';
    label: string;
    icon: typeof Send;
    check: typeof numberCheck;
    fallback: string;
  }[] = [
    {
      field: 'numberPattern',
      label: t('outgoing'),
      icon: Send,
      check: numberCheck,
      fallback: DEFAULT_NUMBER_PATTERN,
    },
    {
      field: 'agendaPattern',
      label: t('agenda'),
      icon: Inbox,
      check: agendaCheck,
      fallback: DEFAULT_AGENDA_PATTERN,
    },
  ];

  return (
    <Card className="lt-fade-up gap-4 px-4 sm:px-5" aria-labelledby="letter-numbering">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--lt-ink-soft)] text-[var(--lt-ink)]">
          <Hash className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="letter-numbering" className="font-heading text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('hint')}</p>
        </div>
      </div>

      {current.isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" aria-busy />
      ) : (
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="letter-code">{t('code')}</Label>
            <Input
              id="letter-code"
              disabled={!manage}
              maxLength={MAX_SCHOOL_CODE_LENGTH}
              value={draft.schoolCode}
              placeholder={derived}
              aria-invalid={!codeValid}
              onChange={(e) => setDraft({ ...draft, schoolCode: e.target.value })}
            />
            <p className={cn('text-xs', codeValid ? 'text-muted-foreground' : 'text-destructive')}>
              {codeValid ? t('codeHint', { code: derived }) : t('codeInvalid')}
            </p>
          </div>

          {rows.map((r) => {
            const preview = previewOf(draft[r.field], effectiveCode);
            const Icon = r.icon;
            return (
              <div key={r.field} className="grid gap-2">
                <Label htmlFor={`letter-${r.field}`} className="flex items-center gap-2">
                  <Icon className="size-4 text-[var(--lt-ink)]" aria-hidden /> {r.label}
                </Label>
                <Input
                  id={`letter-${r.field}`}
                  className="font-mono"
                  disabled={!manage}
                  maxLength={100}
                  value={draft[r.field]}
                  aria-invalid={!r.check.ok}
                  onChange={(e) => setDraft({ ...draft, [r.field]: e.target.value })}
                />
                {manage && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {NUMBER_PATTERN_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        title={t(`variables.${v}`)}
                        onClick={() => setDraft({ ...draft, [r.field]: `${draft[r.field]}{${v}}` })}
                        className="hover:bg-muted rounded-md border px-2 py-0.5 font-mono text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {`{${v}}`}
                      </button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setDraft({ ...draft, [r.field]: r.fallback })}
                    >
                      {t('useDefault')}
                    </Button>
                  </div>
                )}
                {r.check.ok ? (
                  <p className="text-sm" aria-live="polite">
                    <span className="text-muted-foreground">{t('example')}: </span>
                    <span className="rounded-md bg-[var(--lt-ink-soft)] px-2 py-0.5 font-mono font-semibold text-[var(--lt-ink)]">
                      {preview}
                    </span>
                  </p>
                ) : (
                  <p className="text-destructive text-sm" role="alert">
                    {reasonText(r.check)}
                  </p>
                )}
                {r.check.ok && !draft[r.field].includes('{year}') && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t('noYearWarning')}</p>
                )}
              </div>
            );
          })}

          <dl className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
            {NUMBER_PATTERN_VARIABLES.map((v) => (
              <div key={v} className="flex gap-2">
                <dt className="text-foreground font-mono">{`{${v}}`}</dt>
                <dd>{t(`variables.${v}`)}</dd>
              </div>
            ))}
          </dl>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {manage && (
            <div className="flex justify-end">
              <Button type="submit" disabled={!valid || !dirty || save.isPending}>
                {t('save')}
              </Button>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
