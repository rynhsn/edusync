'use client';

import {
  DEFAULT_PARTICIPANT_NO_FORMAT,
  hasClassToken,
  PARTICIPANT_NO_FORMAT_MAX,
  PARTICIPANT_NO_TOKENS,
  participantFormatError,
  renderParticipantNo,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

export interface NumberingType {
  id: string;
  shortName: string;
  participantNoFormat: string | null;
  participantNoSeqScope: 'class' | 'school';
  participantNoSeqStart: number;
}

interface Props {
  type: NumberingType;
  semesterId: string;
  yearStart: string;
  /** Kelas yang sedang dipilih di panel cetak (pratinjau dan cakupan reset). */
  klass?: { id: string; name: string } | undefined;
}

const TOKEN_KEY = {
  '{jenis}': 'tokenJenis',
  '{yy}': 'tokenYy',
  '{yyyy}': 'tokenYyyy',
  '{kelas}': 'tokenKelas',
  '{urut}': 'tokenUrut',
  '{urut:N}': 'tokenUrutN',
} as const;

/** Format, lingkup urutan, dan angka mulai nomor peserta satu jenis ujian, plus pengaturan ulang nomor yang sudah ada. */
export function ParticipantNumbering({ type, semesterId, yearStart, klass }: Props) {
  const t = useTranslations('cards.numbering');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [format, setFormat] = useState(type.participantNoFormat ?? '');
  const [scope, setScope] = useState<'class' | 'school'>(type.participantNoSeqScope);
  const [start, setStart] = useState(String(type.participantNoSeqStart));
  const [resetScope, setResetScope] = useState<'all' | 'class' | null>(null);

  const summary = useQuery({
    queryKey: ['participant-summary', school.schoolId, semesterId, type.id],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exams/participant-numbers/summary', {
          params: { ...header, query: { semesterId, examTypeId: type.id } },
        }),
      ),
  });
  const existing = summary.data?.count ?? 0;

  const trimmed = format.trim();
  const effective = trimmed || DEFAULT_PARTICIPANT_NO_FORMAT;
  const usesClass = hasClassToken(effective);
  // Urutan per kelas hanya masuk akal bila nomor memuat kelas; selain itu urutan se-sekolah supaya nomor unik.
  const seqScope = usesClass ? scope : 'school';
  const startNum = Number(start);
  const startOk = Number.isInteger(startNum) && startNum >= 1 && startNum <= 999_999;
  const formatBad = trimmed.length > 0 && participantFormatError(trimmed) !== null;
  const valid = !formatBad && startOk;
  const example = formatBad
    ? ''
    : renderParticipantNo(effective, {
        typeShort: type.shortName,
        academicYearStart: yearStart,
        className: klass?.name ?? '7A',
        seq: startOk ? startNum : 1,
      });
  const dirty =
    trimmed !== (type.participantNoFormat ?? '') ||
    (usesClass && scope !== type.participantNoSeqScope) ||
    startNum !== type.participantNoSeqStart;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['exam-types', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['card-data', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['participant-summary', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/exams/participant-numbers/format', {
          params: header,
          body: { examTypeId: type.id, format: trimmed || null, seqScope, seqStart: startNum },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const reset = useMutation({
    mutationFn: async (only: 'all' | 'class') =>
      unwrap(
        await api.POST('/v1/exams/participant-numbers/reset', {
          params: header,
          body: {
            semesterId,
            examTypeId: type.id,
            ...(only === 'class' && klass ? { classId: klass.id } : {}),
          },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('resetDone', { n: r.assigned }));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section className="grid gap-4 rounded-xl border p-4" aria-labelledby="numbering-title">
      <div>
        <h3 id="numbering-title" className="font-heading flex items-center gap-2 text-sm font-semibold">
          <Hash className="size-4" aria-hidden /> {t('title', { type: type.shortName })}
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">{t('desc')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
        <div className="grid content-start gap-2">
          <Label htmlFor="numbering-format">{t('format')}</Label>
          <Input
            id="numbering-format"
            className={`${TOUCH_INPUT} font-mono`}
            value={format}
            maxLength={PARTICIPANT_NO_FORMAT_MAX}
            placeholder={DEFAULT_PARTICIPANT_NO_FORMAT}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={formatBad}
            aria-describedby="numbering-format-hint"
            onChange={(e) => setFormat(e.target.value)}
          />
          <p
            id="numbering-format-hint"
            className={formatBad ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
            role={formatBad ? 'alert' : undefined}
          >
            {formatBad ? te('errors.invalid_format') : t('formatHint', { max: PARTICIPANT_NO_FORMAT_MAX })}
          </p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="numbering-scope">{t('scope')}</Label>
          <SelectField
            id="numbering-scope"
            value={seqScope}
            disabled={!usesClass}
            onChange={(e) => setScope(e.target.value as 'class' | 'school')}
          >
            <option value="class">{t('scopeClass')}</option>
            <option value="school">{t('scopeSchool')}</option>
          </SelectField>
          {!usesClass && <p className="text-muted-foreground text-xs">{t('scopeNeedsClass')}</p>}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="numbering-start">{t('start')}</Label>
          <Input
            id="numbering-start"
            className={TOUCH_INPUT}
            type="number"
            inputMode="numeric"
            min={1}
            max={999999}
            value={start}
            aria-invalid={!startOk}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
      </div>

      <p className="text-sm" aria-live="polite">
        {t('example')}{' '}
        <span className="bg-muted rounded px-2 py-0.5 font-mono font-medium">{example || '-'}</span>
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t('tokens')}</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {PARTICIPANT_NO_TOKENS.map((tok) => (
            <div key={tok} className="contents">
              <dt className="font-mono text-xs sm:text-sm">{tok}</dt>
              <dd className="text-muted-foreground">{t(TOKEN_KEY[tok])}</dd>
            </div>
          ))}
        </dl>
      </details>

      {existing > 0 && (
        <Alert>
          <AlertDescription>{t('existing', { n: existing })}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save.mutate()} disabled={!valid || !dirty || save.isPending}>
          {t('save')}
        </Button>
        <Button variant="outline" onClick={() => setResetScope('all')} disabled={reset.isPending}>
          <RotateCcw className="size-4" aria-hidden /> {t('reset')}
        </Button>
        {klass && (
          <Button variant="outline" onClick={() => setResetScope('class')} disabled={reset.isPending}>
            <RotateCcw className="size-4" aria-hidden /> {t('resetClass', { class: klass.name })}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={resetScope !== null}
        onOpenChange={(o) => {
          if (!o) setResetScope(null);
        }}
        title={t(resetScope === 'class' ? 'resetClassTitle' : 'resetTitle', {
          type: type.shortName,
          class: klass?.name ?? '',
        })}
        description={t(existing > 0 && dirty ? 'resetBodyDirty' : 'resetBody')}
        confirmLabel={t('reset')}
        destructive
        pending={reset.isPending}
        onConfirm={() => reset.mutateAsync(resetScope ?? 'all')}
      />
    </section>
  );
}
