'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { PREDICATE_STYLE, pklKey } from '../shared';

type Key = 'A' | 'B' | 'C';
const KEYS: Key[] = ['A', 'B', 'C'];

/** Ambang predikat PKL: tiga batas minimal (A, B, C) dengan pratinjau pita nilai 0-100 yang langsung bergerak. */
export function ThresholdsCard() {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('pkl:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const queryKey = pklKey(school.schoolId, 'thresholds');

  const current = useQuery({
    queryKey,
    queryFn: async () => unwrap(await api.GET('/v1/pkl/settings-thresholds', { params: header })),
  });
  const [draft, setDraft] = useState<Record<Key, string>>({ A: '', B: '', C: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current.data) {
      setDraft({
        A: String(current.data.predicateA),
        B: String(current.data.predicateB),
        C: String(current.data.predicateC),
      });
    }
  }, [current.data]);

  const nums = { A: Number(draft.A), B: Number(draft.B), C: Number(draft.C) };
  const whole = KEYS.every(
    (k) => draft[k] !== '' && Number.isInteger(nums[k]) && nums[k] >= 1 && nums[k] <= 100,
  );
  const valid = whole && nums.A > nums.B && nums.B > nums.C;
  const dirty =
    current.data !== undefined &&
    (nums.A !== current.data.predicateA ||
      nums.B !== current.data.predicateB ||
      nums.C !== current.data.predicateC);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/pkl/settings-thresholds', {
          params: header,
          body: { predicateA: nums.A, predicateB: nums.B, predicateC: nums.C },
        }),
      ),
    onSuccess: () => {
      setError(null);
      toast.success(t('thresholds.saved'));
      // Predikat di papan, lembar nilai, dan rekap ikut berubah.
      queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  // Pita: D [0, C), C [C, B), B [B, A), A [A, 100].
  const bands: { k: 'A' | 'B' | 'C' | 'D'; from: number; to: number }[] = valid
    ? [
        { k: 'D', from: 0, to: nums.C },
        { k: 'C', from: nums.C, to: nums.B },
        { k: 'B', from: nums.B, to: nums.A },
        { k: 'A', from: nums.A, to: 100 },
      ]
    : [];

  return (
    <section className="grid gap-3" aria-labelledby="pkl-thresholds">
      <h2 id="pkl-thresholds" className="font-heading flex items-center gap-2 text-lg font-semibold">
        <Gauge className="size-5 text-teal-600 dark:text-teal-300" aria-hidden /> {t('thresholds.title')}
      </h2>
      <div className="bg-card grid gap-5 rounded-xl border p-4">
        <p className="text-muted-foreground text-sm">{t('thresholds.hint')}</p>
        {current.isPending ? (
          <Skeleton className="h-24 w-full rounded-xl" aria-busy />
        ) : (
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {KEYS.map((k) => (
                <div key={k} className="grid gap-2">
                  <Label htmlFor={`pkl-th-${k}`} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-6 place-items-center rounded-md text-xs font-bold',
                        PREDICATE_STYLE[k],
                      )}
                    >
                      {k}
                    </span>
                    {t('thresholds.min', { predicate: k })}
                  </Label>
                  <Input
                    id={`pkl-th-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    disabled={!manage}
                    value={draft[k]}
                    aria-invalid={!valid && draft[k] !== ''}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div aria-hidden={!valid}>
              {valid ? (
                <>
                  <div className="flex h-8 overflow-hidden rounded-lg">
                    {bands.map((b) => (
                      <div
                        key={b.k}
                        className={cn(
                          'grid min-w-0 place-items-center text-xs font-bold transition-[width] duration-300 motion-reduce:transition-none',
                          PREDICATE_STYLE[b.k],
                        )}
                        style={{ width: `${Math.max(b.to - b.from, 0)}%` }}
                      >
                        {b.to - b.from >= 6 ? b.k : ''}
                      </div>
                    ))}
                  </div>
                  <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                    {[...bands].reverse().map((b) => (
                      <li key={b.k}>
                        <span className="text-foreground font-semibold">{b.k}</span>{' '}
                        {b.k === 'D'
                          ? t('thresholds.below', { value: nums.C })
                          : `${b.from}${b.k === 'A' ? '-100' : `-${b.to - 1}`}`}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t('thresholds.invalid')}</AlertDescription>
                </Alert>
              )}
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {manage && (
              <div className="flex justify-end">
                <Button type="submit" disabled={!valid || !dirty || save.isPending}>
                  {t('thresholds.save')}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
