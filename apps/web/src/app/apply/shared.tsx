'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createContext, useContext } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useSite } from '@/lib/site';
import { SchoolIllustration, StudentIllustration } from './illustrations';
import './apply.css';

export { BookIllustration, SchoolIllustration, StudentIllustration } from './illustrations';

/** Isi GET /v1/public/admission/{slug}: data yang boleh dilihat calon pendaftar tanpa login. */
export interface AdmissionInfo {
  school: { name: string };
  periods: { id: string; name: string; level: string; opensOn: string; closesOn: string; open: boolean }[];
  programs: { id: string; name: string }[];
}

interface ApplyContextValue {
  slug: string;
  info: AdmissionInfo;
}

const ApplyContext = createContext<ApplyContextValue | null>(null);

export function useApply() {
  const ctx = useContext(ApplyContext);
  if (!ctx) throw new Error('useApply harus dipakai di dalam ApplyShell');
  return ctx;
}

/** Tanggal lokal hari ini sebagai TTTT-BB-HH. */
export function todayIso(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Selisih hari kalender dari `from` ke `to` (TTTT-BB-HH); negatif bila sudah lewat. */
export function daysBetween(from: string, to: string) {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Awal nama sekolah untuk lencana (maksimal dua huruf). */
export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^\p{L}/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'S'
  );
}

/**
 * Kerangka halaman publik pendaftaran. Sekolah dikenali dari alamat (<slug>.domain/apply), tanpa login dan
 * tanpa menu aplikasi. Data sekolah dan periode dimuat sekali lalu dibagikan lewat konteks.
 */
export function ApplyShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('apply');
  const te = useTranslations();
  const site = useSite();
  const slug = site.ready && site.kind === 'school' ? site.slug : null;

  const info = useQuery({
    queryKey: ['public-admission', slug],
    enabled: slug !== null,
    queryFn: async (): Promise<AdmissionInfo> =>
      unwrap(await api.GET('/v1/public/admission/{slug}', { params: { path: { slug: slug as string } } })),
  });

  const unavailable =
    info.error instanceof ApiError &&
    (info.error.code === 'not_found' || info.error.code === 'module_disabled');

  let body: React.ReactNode;
  if (!site.ready || (slug !== null && info.isPending)) {
    body = (
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (slug === null) {
    body = (
      <Notice
        title={t('wrongHostTitle')}
        body={t('wrongHostBody')}
        illustration={<SchoolIllustration className="w-64" />}
      />
    );
  } else if (unavailable) {
    body = (
      <Notice
        title={t('unavailableTitle')}
        body={t('unavailableBody')}
        illustration={<StudentIllustration className="w-56" />}
      />
    );
  } else if (info.isError) {
    body = (
      <Notice
        title={t('loadError')}
        body={te(errorKey(info.error))}
        illustration={<StudentIllustration className="w-56" />}
        action={<Button onClick={() => info.refetch()}>{t('retry')}</Button>}
      />
    );
  } else {
    body = (
      <ApplyContext.Provider value={{ slug: slug as string, info: info.data as AdmissionInfo }}>
        {children}
      </ApplyContext.Provider>
    );
  }

  const schoolName = info.data?.school.name;
  return (
    <div className="apply-root bg-background flex min-h-dvh flex-col">
      <header className="no-print mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/apply" className="flex min-w-0 items-center gap-2.5" aria-label={t('home')}>
          <span
            aria-hidden
            className="font-heading grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--ap-orange)] text-sm font-bold text-white shadow-sm"
          >
            {schoolName ? initialsOf(schoolName) : 'S'}
          </span>
          <span className="font-heading truncate text-base font-semibold tracking-tight">
            {schoolName ?? t('brand')}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{body}</main>
      <footer className="no-print text-muted-foreground px-4 py-6 text-center text-xs">
        {t('poweredBy')}
      </footer>
    </div>
  );
}

function Notice({
  title,
  body,
  illustration,
  action,
}: {
  title: string;
  body: string;
  illustration: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="ap-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      {illustration}
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-muted-foreground text-pretty">{body}</p>
      {action}
    </div>
  );
}

export { Notice };
