'use client';

import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Kotak centang dengan label yang terhubung (klik label mengubah kotak). */
export function CheckField({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <Label htmlFor={id} className="text-sm font-normal">
        {children}
      </Label>
    </div>
  );
}
