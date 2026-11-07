import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  tone?: 'default' | 'inverse';
  /** Nama merek di samping ikon; bawaan "Edusync". */
  brand?: string;
  /** Logo unggahan (tema terang). Bila ada, menggantikan ikon dan nama. */
  src?: string | null;
  /** Logo unggahan untuk tema gelap; bila kosong, `src` dipakai di kedua tema. */
  srcDark?: string | null;
}

export function Logo({ className, tone = 'default', brand = 'Edusync', src, srcDark }: LogoProps) {
  if (src) {
    return (
      <span className={cn('flex items-center', className)}>
        {/* Gambar unggahan staf platform; ukuran asli tidak diketahui, jadi next/image tidak dipakai. */}
        {/* biome-ignore lint/performance/noImgElement: sumber dinamis dari API */}
        <img
          src={src}
          alt={brand}
          className={cn('h-8 w-auto max-w-44 object-contain', srcDark && 'dark:hidden')}
        />
        {srcDark && (
          // biome-ignore lint/performance/noImgElement: sumber dinamis dari API
          <img src={srcDark} alt={brand} className="hidden h-8 w-auto max-w-44 object-contain dark:block" />
        )}
      </span>
    );
  }
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
      <span className="font-heading text-lg font-semibold tracking-tight">{brand}</span>
    </span>
  );
}
