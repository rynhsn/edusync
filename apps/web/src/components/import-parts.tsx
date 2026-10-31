'use client';

import { Check, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type RefObject, useState } from 'react';
import { cn } from '@/lib/utils';

export type ImportStep = 0 | 1 | 2;

/** Penunjuk langkah Unggah → Pratinjau → Selesai. */
export function ImportStepper({ step }: { step: ImportStep }) {
  const t = useTranslations('importKit');
  const labels = [t('stepUpload'), t('stepPreview'), t('stepDone')];
  return (
    <ol
      aria-label={t('steps')}
      className="bg-card flex items-center gap-2 rounded-2xl border p-3 sm:gap-3 sm:p-4"
    >
      {labels.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className={cn('flex items-center gap-2 sm:gap-3', i < labels.length - 1 && 'flex-1')}
          >
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
                done && 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
                current && 'bg-primary text-primary-foreground',
                !done && !current && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-sm font-medium', !current && !done && 'text-muted-foreground')}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <span
                aria-hidden
                className={cn('h-px flex-1 transition-colors', done ? 'bg-emerald-500' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Area seret-lepas untuk berkas .xlsx; tetap bisa diklik dan difokus dengan keyboard. */
export function ImportDropzone({
  inputRef,
  onFile,
  disabled,
  fileName,
  inputId,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File | undefined) => void;
  disabled?: boolean;
  fileName?: string | null;
  inputId: string;
}) {
  const t = useTranslations('importKit');
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'bg-card focus-within:ring-ring/50 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-[3px]',
        over ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
        {fileName ? (
          <FileSpreadsheet className="size-6" aria-hidden />
        ) : (
          <UploadCloud className="size-6" aria-hidden />
        )}
      </span>
      <span className="font-heading mt-1 font-semibold">
        {fileName ?? (over ? t('dropActive') : t('dropTitle'))}
      </span>
      <span className="text-muted-foreground max-w-sm text-sm">
        {fileName ? t('replaceFile') : t('dropHint')}
      </span>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0])}
        className="sr-only"
      />
    </label>
  );
}
