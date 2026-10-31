import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Satu isian form: label, kontrol, lalu keterangan/galat di bawahnya. Pakai di dalam grid `FORM_GRID` agar label,
 * kontrol, dan keterangan antar-kolom berbagi baris yang sama (kontrol selalu sejajar walau label atau
 * keterangan berbeda panjang).
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

/**
 * Kelas grid untuk deretan isian bersebelahan (label, kontrol, keterangan): tiap anak <div> menjadi subgrid tiga baris
 * sehingga kontrol selalu sejajar walau label atau keterangan antar-kolom berbeda panjang.
 */
const SUB = 'sm:gap-y-2 sm:[&>div]:row-span-3 sm:[&>div]:grid-rows-subgrid sm:[&>div]:mb-3';
export const FORM_GRID = `grid items-start gap-x-4 gap-y-4 sm:grid-cols-2 ${SUB}`;
export const FORM_GRID_3 = `grid items-start gap-x-4 gap-y-4 sm:grid-cols-3 ${SUB}`;
