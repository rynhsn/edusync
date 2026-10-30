'use client';

import { cn } from '@/lib/utils';

/**
 * Peta 30 juz: kotak penuh bila juz selesai, terisi sebagian (tinggi mengikuti persen) bila baru sebagian.
 * `fraction[j]` = 0..1 untuk juz j (1..30).
 */
export function JuzMap({
  fraction,
  labelFor,
}: {
  fraction: (juz: number) => number;
  labelFor: (juz: number, percent: number) => string;
}) {
  return (
    <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-10" aria-label="30 juz">
      {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => {
        const f = Math.min(1, Math.max(0, fraction(juz)));
        const full = f >= 0.999;
        const percent = Math.round(f * 100);
        return (
          <li
            key={juz}
            title={labelFor(juz, percent)}
            aria-label={labelFor(juz, percent)}
            className={cn(
              'relative grid aspect-square place-items-center overflow-hidden rounded-lg border text-xs font-medium tabular-nums',
              full ? 'border-chart-5 text-primary-foreground' : 'bg-muted/40 text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-0 bottom-0 transition-[height] duration-700 motion-reduce:transition-none',
                full ? 'bg-chart-5' : 'bg-chart-5/35',
              )}
              style={{ height: `${f * 100}%` }}
            />
            <span className={cn('relative', full && 'text-white drop-shadow-sm dark:text-black')}>{juz}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface DayPoint {
  date: string;
  /** Ayat ziyadah (tumpukan bawah, zamrud). */
  ziyadah: number;
  /** Ayat murajaah (tumpukan atas, emas). */
  murajaah: number;
}

/** Grafik batang tumpuk SVG sederhana (30 hari). Hari ini diberi garis tepi; hari kosong berupa garis tipis. */
export function DayBars({
  points,
  todayDate,
  height = 120,
  unit,
}: {
  points: DayPoint[];
  todayDate: string;
  height?: number;
  unit: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.ziyadah + p.murajaah));
  const n = Math.max(1, points.length);
  const bw = 100 / n;
  const usable = height - 6;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={`${points.reduce((s, p) => s + p.ziyadah + p.murajaah, 0)} ${unit}`}
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1="0"
          x2="100"
          y1={height * g}
          y2={height * g}
          className="stroke-border"
          strokeWidth="0.4"
          strokeDasharray="1.5 1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {points.map((p, i) => {
        const total = p.ziyadah + p.murajaah;
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const isToday = p.date === todayDate;
        if (total === 0) {
          return (
            <rect
              key={p.date}
              x={x}
              width={w}
              y={height - 1.5}
              height={1.5}
              rx="0.6"
              className="fill-muted"
            />
          );
        }
        const hz = (p.ziyadah / max) * usable;
        const hm = (p.murajaah / max) * usable;
        return (
          <g key={p.date} className="animate-in fade-in duration-700 motion-reduce:animate-none">
            <title>{`${p.date}: ${p.ziyadah} + ${p.murajaah} ${unit}`}</title>
            {hm > 0 && (
              <rect x={x} width={w} y={height - hz - hm} height={hm} rx="0.8" className="fill-chart-2" />
            )}
            {hz > 0 && <rect x={x} width={w} y={height - hz} height={hz} rx="0.8" className="fill-chart-5" />}
            {isToday && (
              <rect
                x={x}
                width={w}
                y={height - hz - hm}
                height={hz + hm}
                rx="0.8"
                fill="none"
                className="stroke-foreground"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
