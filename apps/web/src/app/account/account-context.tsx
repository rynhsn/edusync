'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useContext, useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { ApiError, api, unwrap } from '@/lib/api';
import type { paths } from '@/lib/api-types';
import { formatCalendarDate } from '@/lib/format-date';

type AccountResponse = paths['/v1/account']['get']['responses'][200]['content']['application/json'];
export type AccountFoundation = AccountResponse['foundations'][number];
export type AccountSchool = AccountFoundation['schools'][number];
export type AccountInvoice = AccountFoundation['invoices'][number];

async function fetchAccount() {
  return unwrap(await api.GET('/v1/account'));
}

interface Ctx {
  foundations: AccountFoundation[];
  foundation: AccountFoundation;
  selectFoundation: (id: string) => void;
  money: (amount: number) => string;
  date: (iso: string) => string;
  moduleLabel: (key: string) => string;
  tierLabel: (key: string) => string;
}

const AccountCtx = createContext<Ctx | null>(null);

export function useAccount() {
  const ctx = useContext(AccountCtx);
  if (!ctx) throw new Error('useAccount harus dipakai di dalam AccountProvider');
  return ctx;
}

/** Data akun yayasan (satu kali ambil, dipakai semua halaman portal). */
export function useAccountQuery() {
  const query = useQuery({ queryKey: ['account'], queryFn: fetchAccount });
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  return { query, unauthenticated };
}

export function AccountProvider({
  foundations,
  children,
}: {
  foundations: AccountFoundation[];
  children: React.ReactNode;
}) {
  const locale = useLocale() as Locale;
  const tm = useTranslations('modules');
  const tt = useTranslations('tiers');
  const [selected, setSelected] = useState<string | null>(null);
  const foundation = foundations.find((f) => f.id === selected) ?? (foundations[0] as AccountFoundation);

  const value = useMemo<Ctx>(() => {
    const fmt = new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    });
    return {
      foundations,
      foundation,
      selectFoundation: setSelected,
      money: (n) => fmt.format(n),
      date: (iso) => formatCalendarDate(locale, iso.slice(0, 10)),
      moduleLabel: (key) => (tm.has(key as never) ? tm(key as never) : key),
      tierLabel: (key) => (tt.has(key as never) ? tt(key as never) : key),
    };
  }, [foundations, foundation, locale, tm, tt]);

  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

/** Simpan tujuan kembali setelah bayar (dipakai halaman bayar penyedia dev), lalu buka tautan bayar. */
export function goPay(paymentUrl: string, returnTo = '/account/billing') {
  try {
    sessionStorage.setItem('edusync.payReturn', returnTo);
  } catch {
    // Tanpa penyimpanan sesi, pengguna kembali lewat menu.
  }
  window.location.assign(paymentUrl);
}
