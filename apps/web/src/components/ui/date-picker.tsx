'use client';

import { CalendarIcon, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { enUS, id as localeId } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

interface Props {
  id?: string;
  'aria-label'?: string;
  /** Tanggal TTTT-BB-HH, atau '' bila kosong. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Tombol "Hapus tanggal" di dalam pemilih, untuk isian opsional. */
  clearable?: boolean;
  /** Pemilih bulan dan tahun (dropdown), cocok untuk tanggal lahir. */
  yearRange?: { from: number; to: number };
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Pemilih tanggal shadcn (Popover + Calendar). Bahasa Sunda memakai nama bulan Indonesia di kalender. */
export function DatePicker({ id, 'aria-label': ariaLabel, value, onChange, placeholder, disabled, className, clearable, yearRange }: Props) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const selected = value ? parse(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            aria-label={ariaLabel}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground', className)}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 opacity-60" />
        <span className="truncate">{value ? formatCalendarDate(locale, value) : (placeholder ?? t('pickDate'))}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (yearRange ? new Date(yearRange.to - 12, 0) : undefined)}
          onSelect={(d) => {
            if (d) onChange(toIso(d));
            setOpen(false);
          }}
          locale={locale === 'en' ? enUS : localeId}
          {...(yearRange
            ? {
                captionLayout: 'dropdown' as const,
                startMonth: new Date(yearRange.from, 0),
                endMonth: new Date(yearRange.to, 11),
              }
            : {})}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              <X className="size-4" /> {t('clearDate')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
