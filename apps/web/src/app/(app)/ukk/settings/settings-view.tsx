'use client';

import {
  DEFAULT_UKK_CERTIFICATE_PATTERN,
  renderNumberPattern,
  validateNumberPattern,
  validUkkBands,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, Ruler, Save, Scale, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { type BandDraft, bandsToDraft, draftToBands, newBandDraft, UKK_PATTERN_LIST, ukkKey } from '../lib';

type Pattern = (typeof UKK_PATTERN_LIST)[number];
type Drafts = Record<Pattern, BandDraft[] | null>;
const NO_DRAFTS: Drafts = { lsp: null, industry: null, independent: null };

/** Pengaturan UKK kejuruan (tahap 5.5): skala per pola, bobot praktik/teori, tampil di rapor, dan pola nomor. */
export function SettingsView() {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('ukk:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ukkKey(school.schoolId, 'setting');

  const current = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/vocational/settings/ukk', { params: header })),
  });
  const data = current.data;

  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  const [weightsOn, setWeightsOn] = useState(false);
  const [practice, setPractice] = useState(70);
  const [inReport, setInReport] = useState(false);
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setDrafts({
      lsp: data.bands.lsp ? bandsToDraft(data.bands.lsp) : null,
      industry: data.bands.industry ? bandsToDraft(data.bands.industry) : null,
      independent: data.bands.independent ? bandsToDraft(data.bands.independent) : null,
    });
    setWeightsOn(data.practiceWeight !== null);
    setPractice(data.practiceWeight ?? 70);
    setInReport(data.inReport);
    setPattern(data.certificatePattern ?? '');
    setError(null);
  }, [data]);

  const patternText = pattern.trim();
  const patternOk = patternText === '' || validateNumberPattern(patternText).ok;
  const parsed = UKK_PATTERN_LIST.map(
    (p) => [p, drafts[p] === null ? null : draftToBands(drafts[p])] as const,
  );
  const bandsOk = parsed.every(([, b]) => b === null || validUkkBands(b));
  const canSave = bandsOk && patternOk && parsed.every(([p, b]) => drafts[p] === null || b !== null);

  // Bentuk badan sama dengan yang disimpan server, supaya perbandingan "berubah" jujur.
  const body = {
    bands: Object.fromEntries(parsed) as Record<Pattern, ReturnType<typeof draftToBands>>,
    practiceWeight: weightsOn ? practice : null,
    theoryWeight: weightsOn ? 100 - practice : null,
    inReport,
    certificatePattern: patternText || null,
  };
  const saved = data && {
    bands: data.bands,
    practiceWeight: data.practiceWeight,
    theoryWeight: data.theoryWeight,
    inReport: data.inReport,
    certificatePattern: data.certificatePattern,
  };
  const dirty =
    !!saved &&
    JSON.stringify({ ...body, bands: UKK_PATTERN_LIST.map((p) => body.bands[p]) }) !==
      JSON.stringify({ ...saved, bands: UKK_PATTERN_LIST.map((p) => saved.bands[p]) });

  const save = useMutation({
    mutationFn: async () => unwrap(await api.PUT('/v1/vocational/settings/ukk', { params: header, body })),
    onSuccess: () => {
      setError(null);
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
      // Rapor draf memakai skala dan sakelar baru.
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const sample = renderNumberPattern(
    patternText || (data?.defaultCertificatePattern ?? DEFAULT_UKK_CERTIFICATE_PATTERN),
    {
      seq: 1,
      code: 'SMK',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    },
  );

  const setRow = (p: Pattern, i: number, patch: Partial<BandDraft>) =>
    setDrafts((d) => ({ ...d, [p]: (d[p] ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  return (
    <PageBody>
      <PageHeader
        title={t('settingsTitle')}
        description={manage ? t('settings.subtitle') : `${t('settings.subtitle')} ${t('readOnly')}`}
        actions={<BackLink href="/ukk" />}
      />

      {current.isPending ? (
        <Skeleton className="h-64 rounded-xl" aria-busy />
      ) : current.isError || !data ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(current.error))}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="grid gap-3" aria-labelledby="ukk-bands">
            <h2 id="ukk-bands" className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Ruler className="size-5 text-violet-600 dark:text-violet-300" aria-hidden />{' '}
              {t('settings.bandsTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('settings.bandsHint')}</p>
            {UKK_PATTERN_LIST.map((p) => {
              const draft = drafts[p];
              const src = data.bandSources[p];
              const rows = draft ?? bandsToDraft(data.defaultBands[p]);
              const checked = draft ? draftToBands(draft) : null;
              const invalid = draft !== null && (checked === null || !validUkkBands(checked));
              return (
                <div key={p} className="bg-card grid gap-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading font-semibold">{t(`patterns.${p}`)}</h3>
                    <ToneBadge tone={draft ? 'amber' : 'slate'} dot={false}>
                      {draft ? t('settings.custom') : t('settings.default')}
                    </ToneBadge>
                  </div>
                  {!draft && (
                    <p className="text-muted-foreground text-xs break-words">
                      {t('settings.source', { source: src.source })}
                    </p>
                  )}
                  {!draft && !src.verified && (
                    <Alert
                      role="note"
                      className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                    >
                      <TriangleAlert className="size-4 text-amber-600" aria-hidden />
                      <AlertDescription>{t('settings.unverified')}</AlertDescription>
                    </Alert>
                  )}

                  {draft ? (
                    <ul className="grid gap-3">
                      {draft.map((r, i) => (
                        <li
                          key={r.uid}
                          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_6rem_auto_auto] sm:items-end"
                        >
                          <div className="grid gap-1.5">
                            <Label htmlFor={`b-${p}-${i}-label`} className="text-xs">
                              {t('settings.bandLabel')}
                            </Label>
                            <Input
                              id={`b-${p}-${i}-label`}
                              className={TOUCH_INPUT}
                              maxLength={60}
                              disabled={!manage}
                              value={r.label}
                              onChange={(e) => setRow(p, i, { label: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:contents">
                            <div className="grid gap-1.5">
                              <Label htmlFor={`b-${p}-${i}-code`} className="text-xs">
                                {t('settings.bandCode')}
                              </Label>
                              <Input
                                id={`b-${p}-${i}-code`}
                                className={TOUCH_INPUT}
                                maxLength={20}
                                disabled={!manage}
                                value={r.code}
                                onChange={(e) => setRow(p, i, { code: e.target.value })}
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label htmlFor={`b-${p}-${i}-min`} className="text-xs">
                                {t('settings.bandMin')}
                              </Label>
                              <Input
                                id={`b-${p}-${i}-min`}
                                className={`${TOUCH_INPUT} text-right tabular-nums`}
                                inputMode="decimal"
                                disabled={!manage}
                                value={r.min}
                                onChange={(e) => setRow(p, i, { min: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="flex min-h-11 items-center gap-2">
                            <Checkbox
                              id={`b-${p}-${i}-comp`}
                              checked={r.competent}
                              disabled={!manage}
                              onCheckedChange={(v) => setRow(p, i, { competent: v === true })}
                            />
                            <Label htmlFor={`b-${p}-${i}-comp`} className="text-sm">
                              {t('settings.bandCompetent')}
                            </Label>
                          </div>
                          {manage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11 md:size-8"
                              aria-label={t('settings.removeBand', { label: r.label || String(i + 1) })}
                              disabled={draft.length <= 1}
                              onClick={() =>
                                setDrafts((d) => ({ ...d, [p]: (d[p] ?? []).filter((_, j) => j !== i) }))
                              }
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="grid gap-1.5 text-sm">
                      {rows.map((r) => (
                        <li
                          key={r.code}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                        >
                          <span className="min-w-0 font-medium break-words">{r.label}</span>
                          <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                            {t('settings.fromScore', { min: r.min })}
                            {r.competent && (
                              <ToneBadge tone="emerald" dot={false}>
                                {t('settings.bandCompetent')}
                              </ToneBadge>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {invalid && (
                    <p role="alert" className="text-destructive text-xs">
                      {te('errors.invalid_bands')}
                    </p>
                  )}
                  {manage && (
                    <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
                      {draft ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 md:h-8"
                            disabled={draft.length >= 8}
                            onClick={() =>
                              setDrafts((d) => ({
                                ...d,
                                [p]: [...(d[p] ?? []), newBandDraft()],
                              }))
                            }
                          >
                            <Plus className="size-4" aria-hidden /> {t('settings.addBand')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11 md:h-8"
                            onClick={() => setDrafts((d) => ({ ...d, [p]: null }))}
                          >
                            <Undo2 className="size-4" aria-hidden /> {t('settings.resetBands')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 md:h-8"
                          onClick={() =>
                            setDrafts((d) => ({ ...d, [p]: bandsToDraft(data.defaultBands[p]) }))
                          }
                        >
                          {t('settings.customize')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="grid gap-3" aria-labelledby="ukk-weights">
            <h2 id="ukk-weights" className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Scale className="size-5 text-teal-600 dark:text-teal-300" aria-hidden />{' '}
              {t('settings.weightsTitle')}
            </h2>
            <div className="bg-card grid gap-4 rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">{t('settings.weightsHint')}</p>
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id="ukk-w-custom"
                  checked={weightsOn}
                  disabled={!manage}
                  onCheckedChange={(v) => setWeightsOn(v === true)}
                />
                <Label htmlFor="ukk-w-custom">{t('settings.weightsCustom')}</Label>
              </div>
              {weightsOn ? (
                <div className="grid gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={practice}
                    disabled={!manage}
                    aria-label={t('settings.practice')}
                    className="h-11 w-full accent-violet-600"
                    onChange={(e) => setPractice(Number(e.target.value))}
                  />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <p className="rounded-lg bg-violet-50 p-3 dark:bg-violet-500/10">
                      <span className="text-muted-foreground block text-xs">{t('settings.practice')}</span>
                      <span className="font-heading text-2xl font-semibold tabular-nums">{practice}</span>
                    </p>
                    <p className="rounded-lg bg-teal-50 p-3 dark:bg-teal-500/10">
                      <span className="text-muted-foreground block text-xs">{t('settings.theory')}</span>
                      <span className="font-heading text-2xl font-semibold tabular-nums">
                        {100 - practice}
                      </span>
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {t('settings.weightsTotal', { total: 100 })}
                  </p>
                  {manage && (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 max-sm:w-full md:h-8"
                        onClick={() => setWeightsOn(false)}
                      >
                        <Undo2 className="size-4" aria-hidden /> {t('settings.weightsReset')}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('settings.weightsDirect')}</p>
              )}
            </div>
          </section>

          <section className="grid gap-3" aria-labelledby="ukk-report">
            <h2 id="ukk-report" className="font-heading text-lg font-semibold">
              {t('settings.reportTitle')}
            </h2>
            <div className="bg-card flex items-start gap-3 rounded-xl border p-4">
              <Checkbox
                id="ukk-in-report"
                className="mt-1"
                checked={inReport}
                disabled={!manage}
                onCheckedChange={(v) => setInReport(v === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="ukk-in-report">{t('settings.inReport')}</Label>
                <p className="text-muted-foreground text-xs">{t('settings.inReportHint')}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-3" aria-labelledby="ukk-certno">
            <h2 id="ukk-certno" className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Hash className="size-5 text-orange-600 dark:text-orange-300" aria-hidden />{' '}
              {t('settings.certTitle')}
            </h2>
            <div className="bg-card grid gap-2 rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">{t('settings.certHint')}</p>
              <Label htmlFor="ukk-pattern">{t('settings.certPattern')}</Label>
              <Input
                id="ukk-pattern"
                className={TOUCH_INPUT}
                maxLength={120}
                autoComplete="off"
                disabled={!manage}
                aria-invalid={!patternOk}
                placeholder={data.defaultCertificatePattern}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t('settings.certDefault', { pattern: data.defaultCertificatePattern })}
              </p>
              {patternOk ? (
                <p className="text-xs tabular-nums">{t('settings.certPreview', { sample })}</p>
              ) : (
                <p role="alert" className="text-destructive text-xs">
                  {te('errors.invalid_pattern')}
                </p>
              )}
            </div>
          </section>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {manage && (
            <div className="bg-background/90 sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-lg backdrop-blur">
              <span className="text-muted-foreground text-sm" aria-live="polite">
                {dirty ? t('settings.dirty') : t('settings.clean')}
              </span>
              <Button
                type="button"
                className="h-11 max-sm:w-full md:h-8"
                disabled={!dirty || !canSave || save.isPending}
                onClick={() => save.mutate()}
              >
                <Save className="size-4" aria-hidden /> {t('settings.save')}
              </Button>
            </div>
          )}
        </>
      )}
    </PageBody>
  );
}
