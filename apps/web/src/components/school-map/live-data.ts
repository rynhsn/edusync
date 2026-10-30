'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { LiveEvent } from './types';

/** Selang polling: snapshot (angka, langit) pelan; peristiwa (sosok) rapat. */
const SNAPSHOT_MS = 30_000;
const EVENTS_MS = 3_000;
const EVENTS_PAGE = 20;

export function useLiveSnapshot(schoolId: string) {
  return useQuery({
    queryKey: ['live', 'snapshot', schoolId],
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/v1/live/snapshot', { params: { header: schoolHeader(schoolId) }, signal })),
    // Berhenti sendiri saat tab tidak terlihat (refetchIntervalInBackground = false) dan lanjut saat kembali.
    refetchInterval: SNAPSHOT_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/** Status kehadiran tab. */
function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/**
 * Polling peristiwa tiap 3 detik dengan kursor. Jeda saat tab tersembunyi dan lanjut (dengan sinkron ulang)
 * saat terlihat lagi. `initial` bernilai true pada muatan pertama dan setelah tab kembali: peristiwa itu
 * hanya mengisi daftar aktivitas, tidak dianimasikan.
 */
export function useLiveEvents({
  schoolId,
  enabled,
  onBatch,
}: {
  schoolId: string;
  enabled: boolean;
  onBatch: (events: LiveEvent[], info: { initial: boolean }) => void;
}) {
  const handler = useRef(onBatch);
  useEffect(() => {
    handler.current = onBatch;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | undefined;
    let resync = true;
    const ctrl = new AbortController();

    const tick = async () => {
      if (stopped || inflight || document.hidden) return;
      inflight = true;
      try {
        const page = unwrap(
          await api.GET('/v1/live/events', {
            params: { header: schoolHeader(schoolId), query: { limit: EVENTS_PAGE, after: cursor } },
            signal: ctrl.signal,
          }),
        );
        if (stopped) return;
        if (page.cursor) cursor = page.cursor;
        const initial = resync;
        resync = false;
        handler.current(page.events, { initial });
      } catch {
        // Gagal sesaat (jaringan, 404 sebelum API siap): coba lagi pada putaran berikutnya.
      } finally {
        inflight = false;
      }
      if (!stopped && !document.hidden) timer = setTimeout(tick, EVENTS_MS);
    };

    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        resync = true;
        void tick();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    void tick();
    return () => {
      stopped = true;
      ctrl.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [schoolId, enabled]);
}

/** Jam pelajaran hari ini (milik guru) untuk "Meja hari ini". */
export function useTodayLessons(schoolId: string, date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['lessons', schoolId, date],
    enabled,
    queryFn: async () =>
      unwrap(await api.GET('/v1/lessons', { params: { header: schoolHeader(schoolId), query: { date } } })),
  });
}

/** Apakah pengguna piket hari ini (hanya status sendiri). */
export function useDutyMe(schoolId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['duty-roster', 'me', schoolId],
    enabled,
    queryFn: async () =>
      unwrap(await api.GET('/v1/duty-roster/me', { params: { header: schoolHeader(schoolId) } })),
  });
}
