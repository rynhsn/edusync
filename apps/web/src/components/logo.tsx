import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'inverse' }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid size-8 place-items-center rounded-lg',
          tone === 'inverse' ? 'bg-amber text-amber-foreground' : 'bg-primary text-primary-foreground',
        )}
      >
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">Edusync</span>
    </span>
  );
}
