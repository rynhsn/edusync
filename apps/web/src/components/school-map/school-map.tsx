'use client';

import { CalendarOff, ClipboardList, DoorOpen, MessageCircle, Trophy, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nowHm } from '@/lib/school-time';
import { cn } from '@/lib/utils';
import { FigureEngine } from './engine';
import { BUILDINGS, VIEW_H, VIEW_W } from './geometry';
import { useLiveEvents, usePageHidden, useReducedMotion } from './live-data';
import {
  type BuildingInfos,
  idleFigureCount,
  lateDelta,
  litWindowCount,
  mapSummaryParts,
  periodStarted,
  type SummaryLine,
  skyPhase,
} from './logic';
import { CLASS_WINDOW_COUNT, Scene } from './scene';
import { MAP_CSS } from './styles';
import type { BuildingKind, LiveEvent, LiveSnapshot } from './types';

const ICONS: Record<BuildingKind, typeof DoorOpen> = {
  gate: DoorOpen,
  classes: ClipboardList,
  teachers: UserRound,
  office: Wallet,
  field: Trophy,
  mail: MessageCircle,
};

/** Jam sekolah saat tidak ada snapshot (langit tetap mengikuti waktu nyata). */
function fallbackTime() {
  return nowHm();
}

export type MapT = (key: string, values?: Record<string, string | number>) => string;
export const lineText = (t: MapT, line: SummaryLine) => t(line.key, line.values);

interface Props {
  schoolId: string;
  snapshot: LiveSnapshot | null;
  infos: BuildingInfos;
  /** Tautan modul per bangunan; null bila pengguna tidak boleh membukanya. */
  hrefs: Record<BuildingKind, string | null>;
  /** Boleh memantau peristiwa kedatangan/pulang (izin dan modul absensi). */
  watchEvents: boolean;
  onActivity: (events: LiveEvent[], info: { initial: boolean }) => void;
}

/** Peta sekolah hidup: ilustrasi SVG, sosok bergerak, lencana yang dapat diklik. */
export function SchoolMap({ schoolId, snapshot, infos, hrefs, watchEvents, onActivity }: Props) {
  const t = useTranslations('schoolMap') as unknown as MapT;
  const reduced = useReducedMotion();
  const hidden = usePageHidden();
  const idleRef = useRef<SVGGElement>(null);
  const movingRef = useRef<SVGGElement>(null);
  const engineRef = useRef<FigureEngine | null>(null);
  const lastLate = useRef<number | null>(null);
  const lastPeriod = useRef<number | null | undefined>(undefined);
  const bellTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bell, setBell] = useState<number | null>(null);

  const closed = Boolean(snapshot?.closed);
  const att = snapshot?.attendance ?? null;
  const time = snapshot?.time ?? fallbackTime();
  const phase = skyPhase(time);
  const running = snapshot?.lessons?.running.length ?? 0;
  const animate = !reduced && !hidden && !closed;

  // Mesin sosok: dibuat sekali per mode gerak dan dibersihkan saat unmount.
  useEffect(() => {
    if (reduced || !idleRef.current || !movingRef.current) return;
    const engine = new FigureEngine(movingRef.current, idleRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [reduced]);

  // Sosok yang berdiri sebanding dengan yang sudah hadir.
  const present = att ? att.present + att.late : 0;
  const total = att?.total ?? 0;
  const late = att?.late ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reduced` memicu ulang setelah mesin dibuat ulang
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (closed || hidden || !att) engine.setIdle(0, 0, 0);
    else engine.setIdle(idleFigureCount(present, total), present, late);
  }, [closed, hidden, att, present, total, late, reduced]);

  // Keterlambatan baru mewarnai kedatangan berikutnya dengan nada hangat.
  useEffect(() => {
    if (!att) return;
    engineRef.current?.addLate(lateDelta(lastLate.current, att.late));
    lastLate.current = att.late;
  }, [att]);

  // Tab tersembunyi: hentikan semua sosok yang berjalan.
  useEffect(() => {
    if (hidden) engineRef.current?.clearMoving();
  }, [hidden]);

  // Lonceng berayun saat jam pelajaran berganti.
  useEffect(() => {
    if (!snapshot) return;
    const next = snapshot.lessons ? (snapshot.lessons.currentPeriod ?? null) : null;
    const started = periodStarted(lastPeriod.current, next);
    lastPeriod.current = next;
    if (started === null) return;
    setBell(started);
    clearTimeout(bellTimer.current);
    bellTimer.current = setTimeout(() => setBell(null), 6000);
  }, [snapshot]);
  useEffect(() => () => clearTimeout(bellTimer.current), []);

  useLiveEvents({
    schoolId,
    enabled: watchEvents,
    onBatch: (events, info) => {
      onActivity(events, info);
      if (info.initial || closed) return;
      const fresh = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      engineRef.current?.push(fresh);
    },
  });

  const active = useMemo(
    () =>
      Object.fromEntries(BUILDINGS.map((b) => [b.kind, infos[b.kind] !== null])) as Record<
        BuildingKind,
        boolean
      >,
    [infos],
  );

  const summary = [...mapSummaryParts(snapshot).map((p) => lineText(t, p)), t(`phase_${phase}`)].join('. ');

  const litClass = litWindowCount(
    phase === 'night' ? Math.max(running, 4) : running,
    CLASS_WINDOW_COUNT,
    closed,
  );

  return (
    <div
      className="sm-root sm-stage ring-foreground/10 relative overflow-hidden rounded-xl ring-1"
      data-phase={phase}
      data-paused={hidden ? 'true' : 'false'}
    >
      <style>{MAP_CSS}</style>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={t('mapLabel', { summary })}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <Scene
          time={time}
          litClass={litClass}
          litStaff={phase === 'night' && !closed}
          ringing={bell !== null && animate}
          active={active}
        />
        <g ref={idleRef} />
        <g ref={movingRef} />
      </svg>

      {/* Penanda: langsung/dijeda */}
      <div className="bg-card/85 text-muted-foreground absolute top-2 left-2 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] backdrop-blur">
        <span
          className={cn(
            'sm-live-dot size-1.5 rounded-full',
            snapshot && !hidden ? 'bg-emerald-500' : 'bg-muted-foreground',
          )}
          aria-hidden
        />
        {snapshot ? (hidden ? t('paused') : t('live')) : t('waiting')}
      </div>

      {closed && snapshot?.closed && (
        <div className="bg-card/90 sm-pop absolute top-2 left-1/2 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur md:text-sm">
          <CalendarOff className="text-amber size-4 shrink-0" aria-hidden />
          <span className="truncate">{t('closedBanner', { title: snapshot.closed.title })}</span>
        </div>
      )}

      {bell !== null && !reduced && (
        <div
          className="bg-primary text-primary-foreground sm-pop absolute rounded-full px-3 py-1 text-xs font-medium shadow-md"
          style={{
            left: `${(454 / VIEW_W) * 100}%`,
            top: `${(50 / VIEW_H) * 100}%`,
            translate: '-50% -100%',
          }}
          role="status"
        >
          {t('periodStarted', { n: bell })}
        </div>
      )}

      {reduced && att && !closed && (
        <div className="bg-card/90 absolute bottom-2 left-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
          {t('reducedCount', { present, total })}
        </div>
      )}

      {/* Lencana dan tautan di atas SVG */}
      {BUILDINGS.map(({ kind, box }) => {
        const info = infos[kind];
        if (!info) return null;
        const href = hrefs[kind];
        const name = t(`b_${kind}`);
        const label = `${name}: ${info.lines.map((l) => lineText(t, l)).join(', ')}`;
        const center = (box[0] + box[2] / 2) / VIEW_W;
        const align = center < 0.28 ? 'left-0' : center > 0.72 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        const style = {
          left: `${(box[0] / VIEW_W) * 100}%`,
          top: `${(box[1] / VIEW_H) * 100}%`,
          width: `${(box[2] / VIEW_W) * 100}%`,
          height: `${(box[3] / VIEW_H) * 100}%`,
        };
        const Icon = ICONS[kind];
        const body = (
          <>
            <span
              className={cn(
                'bg-card/95 text-foreground absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm backdrop-blur transition-transform group-hover:-translate-y-[60%] md:px-2 md:text-xs',
                info.attention && 'border-amber',
                info.accent && 'border-primary text-primary',
              )}
              aria-hidden
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="hidden md:inline">{name}</span>
              {info.accent && <span>{t('dutyShort')}</span>}
              {info.primary && <span className="tabular-nums">{info.primary}</span>}
              {info.attention && <span className="bg-amber size-1.5 rounded-full" />}
            </span>
            <span
              className={cn(
                'bg-popover text-popover-foreground pointer-events-none absolute top-4 z-10 hidden w-max max-w-56 rounded-lg border p-2 text-xs opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block',
                align,
              )}
              aria-hidden
            >
              <span className="block font-semibold">{name}</span>
              {info.lines.map((l) => (
                <span key={l.key} className="text-muted-foreground block">
                  {lineText(t, l)}
                </span>
              ))}
            </span>
          </>
        );
        return href ? (
          <Link
            key={kind}
            href={href}
            data-b={kind}
            aria-label={label}
            style={style}
            className="group focus-visible:ring-ring/60 absolute block rounded-xl outline-none focus-visible:ring-3"
          >
            {body}
          </Link>
        ) : (
          <div key={kind} data-b={kind} style={style} className="group absolute block rounded-xl">
            {body}
          </div>
        );
      })}
    </div>
  );
}
