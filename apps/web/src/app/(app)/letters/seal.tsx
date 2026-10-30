import { useId } from 'react';
import { cn } from '@/lib/utils';
import './letters.css';

export type SealTone = 'valid' | 'revoked' | 'unknown' | 'draft';

const TONE_VAR: Record<SealTone, string> = {
  valid: 'var(--lt-valid)',
  revoked: 'var(--lt-revoked)',
  unknown: 'var(--lt-unknown)',
  draft: 'var(--lt-ink)',
};

/**
 * Segel bergerigi dengan tulisan melingkar. Warna mengikuti status; cincin teks berputar pelan dan segel
 * "dicap" saat muncul (keduanya mati pada prefers-reduced-motion).
 */
export function Seal({
  tone,
  label,
  size = 160,
  stamp = false,
  className,
}: {
  tone: SealTone;
  /** Teks melingkar (mis. nama sekolah); dipotong bila terlalu panjang. */
  label: string;
  size?: number;
  stamp?: boolean;
  className?: string;
}) {
  const pathId = useId();
  const ring = (label.toUpperCase() + ' · ').repeat(3).slice(0, 56);
  const teeth = 28;
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn('lt-seal shrink-0', stamp && 'lt-seal--stamp', className)}
      style={{ ['--seal' as string]: TONE_VAR[tone] }}
    >
      <defs>
        <path id={pathId} d="M100,100 m-68,0 a68,68 0 1,1 136,0 a68,68 0 1,1 -136,0" />
        <radialGradient id={`${pathId}-g`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="var(--lt-gold)" stopOpacity="0.55" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* Tepi bergerigi */}
      <g fill="currentColor" opacity="0.92">
        {Array.from({ length: teeth }, (_, i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: dekorasi statis
            key={i}
            cx={100 + 94 * Math.cos((i / teeth) * Math.PI * 2)}
            cy={100 + 94 * Math.sin((i / teeth) * Math.PI * 2)}
            r="6"
          />
        ))}
        <circle cx="100" cy="100" r="92" />
      </g>
      <circle cx="100" cy="100" r="86" fill="var(--card, #fff)" />
      <circle cx="100" cy="100" r="86" fill={`url(#${pathId}-g)`} />
      <circle cx="100" cy="100" r="83" fill="none" stroke="var(--lt-gold-deep)" strokeWidth="2" />
      <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />

      <g className="lt-seal-ring" fill="currentColor" fontSize="12.5" fontWeight="700" letterSpacing="2.4">
        <text>
          <textPath href={`#${pathId}`} startOffset="0">
            {ring}
          </textPath>
        </text>
      </g>

      {/* Lambang tengah */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(100 100)"
      >
        {tone === 'valid' && <path d="M-22 2 L-7 17 L23 -16" />}
        {tone === 'revoked' && <path d="M-18 -18 L18 18 M18 -18 L-18 18" />}
        {tone === 'unknown' && (
          <>
            <path d="M-14 -12 a14 14 0 1 1 22 11 c-6 4 -8 7 -8 14" strokeWidth="8" />
            <circle cx="0" cy="26" r="1.5" fill="currentColor" strokeWidth="6" />
          </>
        )}
        {tone === 'draft' && (
          <path d="M-20 18 L-20 8 L8 -20 L18 -10 L-10 18 Z M2 -14 L12 -4" strokeWidth="6" />
        )}
      </g>
    </svg>
  );
}
