'use client';

import {
  DEFAULT_PKL_CERTIFICATE_PATTERN,
  renderNumberPattern,
  validateNumberPattern,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { pklKey } from '../shared';

/**
 * Bobot penilai sekolah:industri dan pola nomor sertifikat (tahap 5.3). Hanya jenjang kejuruan. Bobot kosong = rata-rata penilai yang
 * mengisi (rumus lama); pola kosong = pola bawaan. Disimpan lewat satu endpoint (`/v1/vocational/settings/pkl`).
 */
export function WeightsCard() {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('pkl:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = pklKey(school.schoolId, 'vocational-setting');
  const show = school.educationProfile?.vocational !== false;

  const current = useQuery({
    queryKey: key,
    enabled: show,
    queryFn: async () => unwrap(await api.GET('/v1/vocational/settings/pkl', { params: header })),
  });
  const [custom, setCustom] = useState(false);
  const [schoolWeight, setSchoolWeight] = useState(50);
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current.data) return;
    setCustom(current.data.schoolWeight !== null);
    setSchoolWeight(current.data.schoolWeight ?? 50);
    setPattern(current.data.certificatePattern ?? '');
  }, [current.data]);

  const save = useMutation({
    mutationFn: async (body: {
      schoolWeight: number | null;
      industryWeight: number | null;
      certificatePattern: string | null;
    }) => unwrap(await api.PUT('/v1/vocational/settings/pkl', { params: header, body })),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });
      // Rapor draf menghitung ulang nilai PKL dengan bobot baru.
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (!show) return null;
  const data = current.data;
  const patternText = pattern.trim();
  const patternOk = patternText === '' || validateNumberPattern(patternText).ok;
  const now = new Date();
  const sample = renderNumberPattern(
    patternText || (data?.defaultCertificatePattern ?? DEFAULT_PKL_CERTIFICATE_PATTERN),
    {
      seq: 1,
      code: 'SMK',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
  );
  const weightsChanged =
    data !== undefined &&
    (custom !== (data.schoolWeight !== null) || (custom && schoolWeight !== data.schoolWeight));
  const patternDirty = data !== undefined && patternText !== (data.certificatePattern ?? '');
  const saveBody = (overrides: { weights?: boolean; pattern?: boolean }) => ({
    schoolWeight: overrides.weights === false ? (data?.schoolWeight ?? null) : custom ? schoolWeight : null,
    industryWeight:
      overrides.weights === false ? (data?.industryWeight ?? null) : custom ? 100 - schoolWeight : null,
    certificatePattern:
      overrides.pattern === false ? (data?.certificatePattern ?? null) : patternText || null,
  });

  return (
    <>
      <section className="grid gap-3" aria-labelledby="pkl-weights">
        <h2 id="pkl-weights" className="font-heading flex items-center gap-2 text-lg font-semibold">
          <Scale className="size-5 text-teal-600 dark:text-teal-300" aria-hidden /> {t('weights.title')}
        </h2>
        <div className="bg-card grid gap-4 rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">{t('weights.hint')}</p>
          {current.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" aria-busy />
          ) : current.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{te(errorKey(current.error))}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id="pkl-w-custom"
                  checked={custom}
                  disabled={!manage}
                  onCheckedChange={(v) => setCustom(v === true)}
                />
                <Label htmlFor="pkl-w-custom">{t('weights.custom')}</Label>
              </div>
              {custom ? (
                <div className="grid gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={schoolWeight}
                    disabled={!manage}
                    aria-label={t('weights.school')}
                    className="h-11 w-full accent-teal-600"
                    onChange={(e) => setSchoolWeight(Number(e.target.value))}
                  />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <p className="rounded-lg bg-teal-50 p-3 dark:bg-teal-500/10">
                      <span className="text-muted-foreground block text-xs">{t('weights.school')}</span>
                      <span className="font-heading text-2xl font-semibold tabular-nums">{schoolWeight}</span>
                    </p>
                    <p className="rounded-lg bg-orange-50 p-3 dark:bg-orange-500/10">
                      <span className="text-muted-foreground block text-xs">{t('weights.industry')}</span>
                      <span className="font-heading text-2xl font-semibold tabular-nums">
                        {100 - schoolWeight}
                      </span>
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {t('weights.total', { total: 100 })}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('weights.averageActive')}</p>
              )}
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {manage && (
                <div className="flex flex-wrap justify-end gap-2">
                  {data?.schoolWeight !== null && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 md:h-8"
                      disabled={save.isPending}
                      onClick={() => {
                        setCustom(false);
                        save.mutate(
                          { ...saveBody({ pattern: false }), schoolWeight: null, industryWeight: null },
                          { onSuccess: () => toast.success(t('weights.saved')) },
                        );
                      }}
                    >
                      {t('weights.reset')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="h-10 md:h-8"
                    disabled={!weightsChanged || save.isPending}
                    onClick={() =>
                      save.mutate(saveBody({ pattern: false }), {
                        onSuccess: () => toast.success(t('weights.saved')),
                      })
                    }
                  >
                    {t('weights.save')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="pkl-certno">
        <h2 id="pkl-certno" className="font-heading flex items-center gap-2 text-lg font-semibold">
          <Hash className="size-5 text-orange-600 dark:text-orange-300" aria-hidden /> {t('certNo.title')}
        </h2>
        <div className="bg-card grid gap-4 rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">{t('certNo.hint')}</p>
          {current.isSuccess && (
            <>
              <div className="grid content-start gap-2">
                <Label htmlFor="pkl-pattern">{t('certNo.pattern')}</Label>
                <Input
                  id="pkl-pattern"
                  className={TOUCH_INPUT}
                  maxLength={120}
                  autoComplete="off"
                  disabled={!manage}
                  aria-invalid={!patternOk}
                  placeholder={data?.defaultCertificatePattern}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t('certNo.default', { pattern: data?.defaultCertificatePattern ?? '' })}
                </p>
                {patternOk ? (
                  <p className="text-xs tabular-nums">{t('certNo.preview', { sample })}</p>
                ) : (
                  <p role="alert" className="text-destructive text-xs">
                    {te('errors.invalid_pattern')}
                  </p>
                )}
              </div>
              {manage && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="h-10 md:h-8"
                    disabled={!patternDirty || !patternOk || save.isPending}
                    onClick={() =>
                      save.mutate(saveBody({ weights: false }), {
                        onSuccess: () => toast.success(t('certNo.saved')),
                      })
                    }
                  >
                    {t('certNo.save')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
