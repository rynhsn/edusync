'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';

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
