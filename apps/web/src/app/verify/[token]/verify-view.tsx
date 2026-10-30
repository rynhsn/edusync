'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileSearch, FileUp, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { sha256Hex } from '@/app/(app)/letters/format';
import { Seal, type SealTone } from '@/app/(app)/letters/seal';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import '@/app/(app)/letters/letters.css';

const TONE: Record<'valid' | 'revoked' | 'unknown', SealTone> = {
  valid: 'valid',
  revoked: 'revoked',
  unknown: 'unknown',
};

function formatWhen(locale: Locale, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Bahasa Sunda tidak ada di Intl peramban; pakai tanggal Indonesia.
  return new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'id', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'working'; name: string }
  | { kind: 'done'; name: string; match: boolean; sha: string };

/** Halaman verifikasi publik: status surat, rincian, dan pencocokan berkas PDF di browser. */
export function VerifyView({ token }: { token: string }) {
  const t = useTranslations('verify');
  const locale = useLocale() as Locale;
  const fileRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [checkError, setCheckError] = useState(false);

  const result = useQuery({
    queryKey: ['verify', token],
    retry: 1,
    queryFn: async () => unwrap(await api.GET('/v1/public/verify/{token}', { params: { path: { token } } })),
  });

  const compare = useMutation({
    mutationFn: async (file: File) => {
      setCheckError(false);
      setCheck({ kind: 'working', name: file.name });
      const sha = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      const r = unwrap(
        await api.POST('/v1/public/verify/{token}/check', {
          params: { path: { token } },
          body: { sha256: sha },
        }),
      );
      setCheck({ kind: 'done', name: file.name, match: r.match, sha });
    },
    onError: () => {
      setCheck({ kind: 'idle' });
      setCheckError(true);
    },
  });

  const data = result.data;
  const status = data?.status ?? 'unknown';
  const tone = TONE[status];
  const accent =
    status === 'valid'
      ? 'text-[var(--lt-valid)]'
      : status === 'revoked'
        ? 'text-[var(--lt-revoked)]'
        : 'text-[var(--lt-unknown)]';

  function pick(file: File | undefined) {
    if (file) compare.mutate(file);
  }

  return (
    <div className="lt-scope lt-verify-bg">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pt-2 pb-16">
        {result.isPending && (
          <div className="lt-cert grid gap-4 p-10">
            <Skeleton className="mx-auto size-36 rounded-full" />
            <Skeleton className="mx-auto h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {result.isError && (
          <div className="lt-cert grid justify-items-center gap-3 px-6 py-12 text-center">
            <ShieldAlert className="text-muted-foreground size-10" aria-hidden />
            <h1 className="font-heading text-xl font-semibold">{t('loadErrorTitle')}</h1>
            <p className="text-muted-foreground max-w-sm text-sm">{t('loadErrorBody')}</p>
            <Button variant="outline" onClick={() => result.refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}

        {data && (
          <article className="lt-cert lt-fade-up px-5 py-10 sm:px-12" aria-labelledby="verify-status">
            <div className="grid justify-items-center gap-2 text-center">
              <p className="text-muted-foreground text-xs font-medium tracking-[0.25em] uppercase">
                {t('eyebrow')}
              </p>
              <Seal tone={tone} label={data.issuer.schoolName ?? 'Edusync'} size={176} stamp />
              <h1
                id="verify-status"
                className={cn('font-heading text-3xl font-semibold tracking-tight sm:text-4xl', accent)}
              >
                {t(`status_${status}`)}
              </h1>
              <p className="text-muted-foreground max-w-md text-sm">{t(`statusBody_${status}`)}</p>
            </div>

            {status !== 'unknown' && (
              <dl className="mx-auto mt-8 grid max-w-xl gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Row label={t('number')} value={data.number} mono />
                <Row label={t('signedAt')} value={data.signedAt ? formatWhen(locale, data.signedAt) : null} />
                <div className="sm:col-span-2">
                  <Row label={t('subject')} value={data.subject} large />
                </div>
                <Row label={t('issuer')} value={data.issuer.schoolName} />
                <Row
                  label={t('signer')}
                  value={
                    data.signer.name
                      ? data.signer.title
                        ? `${data.signer.name}, ${data.signer.title}`
                        : data.signer.name
                      : null
                  }
                />
              </dl>
            )}

            {status === 'revoked' && (
              <div
                className="mx-auto mt-6 max-w-xl rounded-xl border border-[color-mix(in_oklab,var(--lt-revoked)_45%,transparent)] bg-[color-mix(in_oklab,var(--lt-revoked)_9%,transparent)] p-4 text-sm"
                role="alert"
              >
                <p className="font-medium text-[var(--lt-revoked)]">
                  {data.revokedAt
                    ? t('revokedAt', { at: formatWhen(locale, data.revokedAt) })
                    : t('revokedNoDate')}
                </p>
                {data.revokedReason && (
                  <p className="mt-1">{t('revokedReason', { reason: data.revokedReason })}</p>
                )}
              </div>
            )}

            {status === 'unknown' && (
              <p className="text-muted-foreground mx-auto mt-6 max-w-md text-center text-sm">
                {t('unknownHint')}
              </p>
            )}

            {status !== 'unknown' && (
              <section className="mx-auto mt-10 max-w-xl" aria-labelledby="match-title">
                <h2 id="match-title" className="font-heading flex items-center gap-2 text-lg font-medium">
                  <FileSearch className="size-5 text-[var(--lt-ink)]" aria-hidden /> {t('matchTitle')}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">{t('matchBody')}</p>

                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  aria-label={t('pickFile')}
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pick(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    'mt-3 grid w-full place-items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    dragging ? 'border-[var(--lt-ink)] bg-[var(--lt-ink-soft)]' : 'hover:bg-muted/60',
                  )}
                >
                  {check.kind === 'working' ? (
                    <Loader2 className="size-6 animate-spin text-[var(--lt-ink)]" aria-hidden />
                  ) : (
                    <FileUp className="size-6 text-[var(--lt-ink)]" aria-hidden />
                  )}
                  <span className="text-sm font-medium">
                    {check.kind === 'working' ? t('checking') : t('pickFile')}
                  </span>
                  <span className="text-muted-foreground text-xs">{t('pickHint')}</span>
                </button>

                <div aria-live="polite" className="mt-3">
                  {checkError && (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>{t('checkError')}</AlertDescription>
                    </Alert>
                  )}
                  {check.kind === 'done' && check.match && (
                    <div className="lt-fade-up flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--lt-valid)_45%,transparent)] bg-[color-mix(in_oklab,var(--lt-valid)_10%,transparent)] p-4">
                      <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-[var(--lt-valid)]" aria-hidden />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-[var(--lt-valid)]">{t('matchYes')}</p>
                        <p className="mt-0.5">{t('matchYesBody')}</p>
                        <p className="text-muted-foreground mt-1 truncate text-xs">{check.name}</p>
                      </div>
                    </div>
                  )}
                  {check.kind === 'done' && !check.match && (
                    <div className="lt-fade-up flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--lt-revoked)_45%,transparent)] bg-[color-mix(in_oklab,var(--lt-revoked)_9%,transparent)] p-4">
                      <XCircle className="mt-0.5 size-6 shrink-0 text-[var(--lt-revoked)]" aria-hidden />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-[var(--lt-revoked)]">{t('matchNo')}</p>
                        <p className="mt-0.5">{data.hashRegistered ? t('matchNoBody') : t('matchNoHash')}</p>
                        <p className="text-muted-foreground mt-1 truncate text-xs">{check.name}</p>
                      </div>
                    </div>
                  )}
                </div>
                {check.kind === 'done' && (
                  <p className="text-muted-foreground mt-2 font-mono text-[10px] break-all">
                    SHA-256: {check.sha}
                  </p>
                )}
              </section>
            )}

            <p className="text-muted-foreground mx-auto mt-10 max-w-xl border-t pt-4 text-center text-xs">
              {t('disclaimer')}
            </p>
          </article>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  large,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  large?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd
        className={cn('mt-0.5 break-words', mono && 'font-mono text-[13px]', large && 'font-heading text-lg')}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}
