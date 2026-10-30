'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Isian teks beberapa baris, bergaya sama dengan Input. */
export function TextArea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

/** Deretan chip pengganti; menekan satu chip menyisipkan {{nama}} di kursor. */
export function PlaceholderChips({
  names,
  onPick,
}: {
  names: readonly string[];
  onPick: (name: string) => void;
}) {
  const t = useTranslations('letters');
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
      aria-label={t('placeholders')}
    >
      <span className="text-muted-foreground text-xs">{t('insert')}</span>
      {names.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="lt-scope border-[color-mix(in_oklab,var(--lt-ink)_30%,transparent)] bg-[var(--lt-ink-soft)] text-[var(--lt-ink)] hover:border-[var(--lt-gold-deep)] focus-visible:ring-ring/50 rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors outline-none focus-visible:ring-3"
        >
          {`{{${n}}}`}
        </button>
      ))}
    </fieldset>
  );
}
