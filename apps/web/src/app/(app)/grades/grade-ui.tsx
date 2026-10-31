import { TONES, type Tone, ToneBadge } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

/** Warna predikat nilai: A hijau, B biru, C kuning, D merah; tanpa predikat abu-abu. */
const PREDICATE_TONE: Record<string, Tone> = { A: 'emerald', B: 'sky', C: 'amber', D: 'rose' };

/** Warna komponen nilai (tugas, UH, UTS, UAS, dst.) menurut urutannya; dipakai daftar penilaian dan pengaturan. */
export const COMPONENT_TONES: Tone[] = ['sky', 'violet', 'amber', 'rose', 'emerald', 'teal'];

export const PREDICATES = ['A', 'B', 'C', 'D'] as const;

export function predicateTone(predicate: string | null | undefined): Tone {
  return (predicate && PREDICATE_TONE[predicate]) || 'slate';
}

/** Lencana predikat A-D bernada (dipakai rekap nilai dan pratinjau rapor). */
export function PredicateBadge({
  predicate,
  className,
}: {
  predicate: string | null | undefined;
  className?: string;
}) {
  if (!predicate) return null;
  return (
    <ToneBadge
      tone={predicateTone(predicate)}
      dot={false}
      className={cn('font-heading font-semibold', className)}
    >
      {predicate}
    </ToneBadge>
  );
}

/** Angka nilai dalam kapsul berwarna: merah bila di bawah KKM, selain itu menurut predikat. */
export function ScoreChip({
  children,
  predicate,
  below,
  className,
}: {
  children: React.ReactNode;
  predicate?: string | null;
  below?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 font-semibold tabular-nums',
        TONES[below ? 'rose' : predicateTone(predicate)].soft,
        className,
      )}
    >
      {children}
    </span>
  );
}
