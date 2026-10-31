'use client';

import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  id?: string;
  'aria-label'?: string;
  /** Jam HH:mm (24 jam), atau '' bila kosong. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Kelipatan menit pada daftar (default 5). Menit di luar kelipatan tetap tampil bila sedang terpilih. */
  step?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

function Column({
  label,
  items,
  selected,
  onPick,
}: {
  label: string;
  items: number[];
  selected: number | null;
  onPick: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Gulirkan nilai terpilih ke tengah saat pemilih dibuka.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat dipasang
  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      className="flex max-h-56 w-16 flex-col gap-0.5 overflow-y-auto overscroll-contain pe-1"
    >
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="option"
          aria-selected={n === selected}
          onClick={() => onPick(n)}
          className={cn(
            'hover:bg-muted focus-visible:ring-ring/50 rounded-md px-2 py-1.5 text-center text-sm tabular-nums outline-none focus-visible:ring-[3px]',
            n === selected && 'bg-primary text-primary-foreground hover:bg-primary',
          )}
        >
          {pad(n)}
        </button>
      ))}
    </div>
  );
}

/** Pemilih jam shadcn (Popover dengan dua kolom jam dan menit yang bisa digulir). Nilai berbentuk 'HH:mm'. */
export function TimeField({ id, 'aria-label': ariaLabel, value, onChange, disabled, className, step = 5 }: Props) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  const hour = m ? Number(m[1]) : null;
  const minute = m ? Number(m[2]) : null;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  if (minute !== null && !minutes.includes(minute)) minutes.push(minute);
  minutes.sort((a, b) => a - b);

  const emit = (h: number, mi: number) => onChange(`${pad(h)}:${pad(mi)}`);

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
            className={cn('w-full justify-start font-normal tabular-nums', !m && 'text-muted-foreground', className)}
          />
        }
      >
        <Clock className="size-4 shrink-0 opacity-60" />
        <span>{m ? `${pad(hour ?? 0)}:${m[2]}` : t('pickTime')}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto flex-row gap-2 p-2" align="start">
        <Column label={t('hour')} items={hours} selected={hour} onPick={(h) => emit(h, minute ?? 0)} />
        <Column
          label={t('minute')}
          items={minutes}
          selected={minute}
          onPick={(mi) => {
            emit(hour ?? 0, mi);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
