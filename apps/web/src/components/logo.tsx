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

/**
 * Lambang Edusync: huruf E dari tiga "halaman" bertumpuk (lengan tengah lebih pendek), dengan titik di ujung
 * lengan tengah sebagai simpul sinkronisasi. Hanya gambar huruf dan titik; petak berwarnanya dari pembungkus
 * (bg-primary), sehingga ikut tema. Rancangan yang sama ada di app/icon.svg dan public/logo*.svg.
 */
export function LogoGlyph({
  className,
  tone = 'default',
}: {
  className?: string;
  tone?: 'default' | 'inverse';
}) {
  return (
    <svg viewBox="16 13 34 38" className={className} fill="none" aria-hidden>
      <rect x="18" y="15" width="28" height="8" rx="4" fill="currentColor" />
      <rect x="18" y="28" width="20" height="8" rx="4" fill="currentColor" />
      <rect x="18" y="41" width="28" height="8" rx="4" fill="currentColor" />
      <rect x="18" y="15" width="8" height="34" rx="4" fill="currentColor" />
      <circle cx="46" cy="32" r="4.5" className={tone === 'inverse' ? 'fill-primary' : 'fill-amber'} />
    </svg>
  );
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
        <LogoGlyph tone={tone} className="size-[18px]" />
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">{brand}</span>
    </span>
  );
}
