'use client';

import { useSyncExternalStore } from 'react';

export type DashboardView = 'map' | 'standard';

const KEY = 'edusync.dashboardView';
const listeners = new Set<() => void>();
/** Cadangan di memori bila localStorage tidak bisa dipakai, agar tombol tetap berfungsi. */
let memory: DashboardView | null = null;

function read(): DashboardView {
  if (memory) return memory;
  try {
    return window.localStorage.getItem(KEY) === 'standard' ? 'standard' : 'map';
  } catch {
    // Penyimpanan diblokir (mode privat, kebijakan): pakai bawaan.
    return 'map';
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

/** Pilihan tampilan beranda (peta atau standar), diingat di peramban ini. Bawaan: peta. */
export function useDashboardView(): [DashboardView, (next: DashboardView) => void] {
  const view = useSyncExternalStore(subscribe, read, () => 'map' as DashboardView);
  const set = (next: DashboardView) => {
    memory = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Tidak bisa menyimpan: pilihan hanya berlaku sampai halaman dimuat ulang.
    }
    for (const l of listeners) l();
  };
  return [view, set];
}
