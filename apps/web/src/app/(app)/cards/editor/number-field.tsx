'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Isian angka yang boleh diketik bebas (mis. "1." atau kosong sebentar). Nilai baru dikirim hanya bila
 * berupa angka sah; saat fokus hilang tampilan dikembalikan ke nilai sebenarnya.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  id,
  'aria-label': ariaLabel,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      {...(disabled !== undefined ? { disabled } : {})}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() === '' || !Number.isFinite(n)) return;
        const lo = min ?? Number.NEGATIVE_INFINITY;
        const hi = max ?? Number.POSITIVE_INFINITY;
        onChange(Math.min(hi, Math.max(lo, n)));
      }}
    />
  );
}
