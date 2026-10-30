'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgePercent, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/select-field';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';

export const METHODS = ['cash', 'transfer', 'other'] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_KEY = { cash: 'methodCash', transfer: 'methodTransfer', other: 'methodOther' } as const;

export const KINDS = ['monthly', 'one_time', 'yearly'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_KEY = { monthly: 'kindMonthly', one_time: 'kindOneTime', yearly: 'kindYearly' } as const;

export const STATUSES = ['unpaid', 'partial', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof STATUSES)[number];
export const STATUS_KEY = {
  unpaid: 'statusUnpaid',
  partial: 'statusPartial',
  paid: 'statusPaid',
  void: 'statusVoid',
} as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal hari ini (zona waktu perangkat) dalam bentuk TTTT-BB-HH. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tanggal lokal (TTTT-BB-HH) dari waktu ISO, supaya pembayaran malam hari tidak tampil sehari lebih awal. */
export function localDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tanggal bayar yang dipilih jadi waktu ISO: hari ini = sekarang (kosong), tanggal lain = tengah hari lokal. */
export function paidAtIso(date: string): string | undefined {
  if (date === todayIso()) return undefined;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).toISOString();
}

/** Badge status tagihan; tagihan lewat jatuh tempo ditandai merah. */
export function StatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  const t = useTranslations('finance');
  const variant = overdue && status !== 'paid' && status !== 'void' ? 'destructive' : 'secondary';
  return (
    <Badge variant={status === 'void' ? 'outline' : variant}>
      {t(STATUS_KEY[status])}
      {overdue && status !== 'paid' && status !== 'void' ? ` · ${t('overdue')}` : ''}
    </Badge>
  );
}

/* ---------- Cicilan dan keringanan ---------- */

/** Pilihan jumlah cicilan; "lunas sekali" = tanpa cicilan. */
export const INSTALLMENT_CHOICES = [2, 3, 4, 6, 10, 12] as const;

/** Nomor dan jumlah cicilan dari periode `C01`.. dan judul "... (cicilan i/n) ..."; null bila bukan cicilan. */
export function installmentInfo(
  period: string | null | undefined,
  title: string,
): { index: number; total: number | null } | null {
  const fromTitle = /\(cicilan (\d+)\/(\d+)\)/i.exec(title);
  if (fromTitle) return { index: Number(fromTitle[1]), total: Number(fromTitle[2]) };
  const fromPeriod = /^C(\d{2})$/.exec(period ?? '');
  return fromPeriod ? { index: Number(fromPeriod[1]), total: null } : null;
}

/** Tambah bulan ke tanggal TTTT-BB-HH; hari dijepit ke akhir bulan tujuan (31 Jan + 1 = 28/29 Feb). */
export function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** Lencana "Cicilan i/N" berwarna biru-hijau. */
export function InstallmentBadge({ period, title }: { period: string | null | undefined; title: string }) {
  const t = useTranslations('finance');
  const info = installmentInfo(period, title);
  if (!info) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
      <Layers className="size-3" aria-hidden="true" />
      {info.total
        ? t('installmentBadge', { index: info.index, total: info.total })
        : t('installmentBadgeOpen', { index: info.index })}
    </span>
  );
}

/** Tanda diskon dengan keterangan alasan (tooltip dan teks pembaca layar). Kosong bila tanpa diskon. */
export function DiscountMark({ amount, reason }: { amount: number; reason: string | null | undefined }) {
  const t = useTranslations('finance');
  if (amount <= 0) return null;
  const rupiah = formatRupiah(amount);
  const text = reason
    ? t('discountMarkReason', { amount: rupiah, reason })
    : t('discountMarkNoReason', { amount: rupiah });
  return (
    <span
      title={text}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
    >
      <BadgePercent className="size-3" aria-hidden="true" />
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{t('discountMarkTitle', { amount: rupiah })}</span>
    </span>
  );
}

/**
 * Mini-linimasa jadwal cicilan: titik bernomor yang tersambung garis, dengan jatuh tempo pertama dan
 * terakhir di bawahnya.
 */
export function InstallmentTimeline({
  count,
  firstDue,
  locale,
}: {
  count: number;
  firstDue: string;
  locale: Locale;
}) {
  const t = useTranslations('finance');
  if (count < 2 || !firstDue) return null;
  const last = addMonthsIso(firstDue, count - 1);
  return (
    <div
      className="grid gap-1.5"
      role="img"
      aria-label={t('splitPreview', {
        first: formatCalendarDate(locale, firstDue),
        last: formatCalendarDate(locale, last),
      })}
    >
      <ol className="flex items-center" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => i + 1).map((n, i) => (
          <li key={n} className="flex min-w-0 flex-1 items-center last:flex-none">
            <span className="bg-primary/15 text-primary ring-primary/30 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1">
              {i + 1}
            </span>
            {i < count - 1 && <span className="bg-primary/25 h-0.5 min-w-1 flex-1" />}
          </li>
        ))}
      </ol>
      <div className="text-muted-foreground flex justify-between text-xs" aria-hidden="true">
        <span>{formatCalendarDate(locale, firstDue)}</span>
        <span>{formatCalendarDate(locale, last)}</span>
      </div>
    </div>
  );
}

/** Daftar tahun ajaran dan pilihan yang sedang dipakai (bawaan: yang aktif). */
export function useFinanceYear() {
  const { school } = useSchool();
  const [choice, setChoice] = useState('');
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });
  const list = years.data ?? [];
  const year = list.find((y) => y.id === choice) ?? list.find((y) => y.isActive) ?? list[0];
  return { years: list, yearId: year?.id ?? '', setYear: setChoice, loading: years.isPending };
}

export function YearSelect({
  years,
  yearId,
  onChange,
  className,
}: {
  years: { id: string; name: string }[];
  yearId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations('finance');
  return (
    <SelectField
      aria-label={t('academicYear')}
      {...(className ? { className } : {})}
      value={yearId}
      onChange={(e) => onChange(e.target.value)}
    >
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.name}
        </option>
      ))}
    </SelectField>
  );
}

/** Rupiah dari teks isian: hanya angka, tanpa nol di depan. '' bila kosong. */
export function digitsOnly(v: string) {
  return v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;

/**
 * Pemilih periode bulanan (bulan + tahun) berupa dropdown; nilainya 'TTTT-BB'. Dengan `allowEmpty`, bulan
 * "Semua" menghasilkan '' (dipakai untuk saringan).
 */
export function PeriodPicker({
  value,
  onChange,
  allowEmpty,
  idPrefix,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  idPrefix: string;
}) {
  const t = useTranslations('finance');
  const thisYear = new Date().getFullYear();
  const [yearState, setYearState] = useState(value ? value.slice(0, 4) : String(thisYear));
  const month = value ? value.slice(5, 7) : '';
  const year = value ? value.slice(0, 4) : yearState;
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - 3 + i));
  if (!years.includes(year)) years.push(year);

  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectField
        id={`${idPrefix}-month`}
        aria-label={t('month')}
        value={month}
        onChange={(e) => onChange(e.target.value ? `${year}-${e.target.value}` : '')}
      >
        {allowEmpty && <option value="">{t('allPeriods')}</option>}
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {t(`month${m}` as never)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${idPrefix}-year`}
        aria-label={t('year')}
        value={year}
        onChange={(e) => {
          setYearState(e.target.value);
          if (month) onChange(`${e.target.value}-${month}`);
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
