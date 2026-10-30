'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { StudentIllustration, useApply } from '../shared';

type Status = 'submitted' | 'verified' | 'accepted' | 'rejected' | 'enrolled' | 'withdrawn';

interface StatusResult {
  regNumber: string;
  fullName: string;
  status: Status;
  decisionNote: string | null;
  updatedAt: string;
}

/** Tahap linimasa menurut urutan proses; ditolak dan mundur ditampilkan terpisah dengan nada sopan. */
const STAGES = ['submitted', 'verified', 'accepted', 'enrolled'] as const;

function Timeline({ status }: { status: Status }) {
  const t = useTranslations('apply.status');
  // Posisi tahap terakhir yang sudah dicapai. Ditolak/mundur berhenti di tahap sebelum keputusan.
  const reached = status === 'rejected' || status === 'withdrawn' ? -1 : STAGES.indexOf(status);
  return (
    <ol className="mt-6 grid gap-0" aria-label={t('timeline')}>
      {STAGES.map((stage, i) => {
        const done = i <= reached;
        const current = i === reached;
        return (
          <li key={stage} className="flex gap-4" aria-current={current ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  current &&
                    'ap-pop border-[var(--ap-orange)] bg-[var(--ap-orange)] text-white ring-4 ring-[var(--ap-orange)]/20',
                  !done && 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn('my-1 w-0.5 flex-1 rounded-full', i < reached ? 'bg-primary' : 'bg-border')}
                />
              )}
            </div>
            <div className={cn('pb-6', i === STAGES.length - 1 && 'pb-0')}>
              <p className={cn('font-heading font-semibold', !done && 'text-muted-foreground')}>
                {t(`stage.${stage}`)}
              </p>
              <p className="text-muted-foreground text-sm text-pretty">{t(`stageHint.${stage}`)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Cek status pendaftaran dengan nomor pendaftaran dan kode pelacakan. */
export function StatusView() {
  const t = useTranslations('apply.status');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { slug } = useApply();
  const [regNumber, setRegNumber] = useState('');
  const [trackingCode, setTrackingCode] = useState('');

  const check = useMutation({
    mutationFn: async (): Promise<StatusResult> =>
      unwrap(
        await api.POST('/v1/public/admission/status', {
          body: {
            slug,
            regNumber: regNumber.trim().toUpperCase(),
            trackingCode: trackingCode.trim().toUpperCase(),
          },
        }),
      ),
  });
  const result = check.data;
  const pending = check.isPending;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/apply" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-4')}>
        <ArrowLeft className="size-4" aria-hidden /> {t('back')}
      </Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-1 text-pretty">{t('subtitle')}</p>

      <form
        className="bg-card mt-6 grid gap-4 rounded-3xl border p-5 shadow-sm sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) check.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="regNumber">{t('regNumber')}</Label>
          <Input
            id="regNumber"
            required
            className="h-11 font-mono uppercase"
            autoComplete="off"
            maxLength={40}
            placeholder="SPMB-2026-0001"
            value={regNumber}
            onChange={(e) => setRegNumber(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trackingCode">{t('trackingCode')}</Label>
          <Input
            id="trackingCode"
            required
            className="h-11 font-mono uppercase"
            autoComplete="off"
            maxLength={40}
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
          />
        </div>
        {check.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{te(errorKey(check.error))}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-11 bg-[var(--ap-orange)] text-white hover:bg-[var(--ap-orange)]/90"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Search className="size-4" aria-hidden />
          )}
          {pending ? t('checking') : t('check')}
        </Button>
      </form>

      {result && (
        <section aria-live="polite" className="ap-rise bg-card mt-6 rounded-3xl border p-5 shadow-sm sm:p-6">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('resultFor')}
          </p>
          <h2 className="font-heading text-2xl font-semibold">{result.fullName}</h2>
          <p className="text-muted-foreground font-mono text-sm">{result.regNumber}</p>

          {result.status === 'rejected' || result.status === 'withdrawn' ? (
            <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-muted/60 p-5 text-center">
              <StudentIllustration className="w-32" />
              <div className="flex items-center gap-2 font-heading text-lg font-semibold">
                <Ban className="size-5 text-muted-foreground" aria-hidden />
                {t(`stage.${result.status}`)}
              </div>
              <p className="text-muted-foreground text-pretty">{t(`stageHint.${result.status}`)}</p>
              {result.decisionNote && (
                <blockquote className="bg-background w-full rounded-xl border p-3 text-left text-sm">
                  <span className="text-muted-foreground block text-xs font-medium uppercase">
                    {t('note')}
                  </span>
                  {result.decisionNote}
                </blockquote>
              )}
            </div>
          ) : (
            <>
              <Timeline status={result.status} />
              {result.decisionNote && (
                <blockquote className="mt-5 rounded-xl border bg-[var(--ap-teal-soft)]/60 p-3 text-sm">
                  <span className="text-muted-foreground block text-xs font-medium uppercase">
                    {t('note')}
                  </span>
                  {result.decisionNote}
                </blockquote>
              )}
            </>
          )}
          <p className="text-muted-foreground mt-5 text-xs">
            {t('updatedAt', { date: formatCalendarDate(locale, result.updatedAt.slice(0, 10)) })}
          </p>
        </section>
      )}
    </div>
  );
}
