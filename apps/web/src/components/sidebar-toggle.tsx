'use client';

import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Kunci localStorage: pilihan sembunyikan sidebar berlaku per peramban, untuk semua kerangka. */
export const SIDEBAR_HIDDEN_KEY = 'ui:sidebar-hidden';

const SIDEBAR_ID = 'app-sidebar';

// Penyimpanan sederhana di luar React: state tetap ada ketika kerangka dipasang ulang saat berpindah layout,
// dan cadangan di memori dipakai bila localStorage tidak tersedia (mode privat, dll.).
let memory = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_HIDDEN_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    // localStorage tidak bisa diakses: pakai memori.
  }
  return memory;
}

function write(hidden: boolean) {
  memory = hidden;
  try {
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // tidak tersimpan permanen, tetap berlaku selama halaman terbuka.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Perubahan dari tab lain ikut diterapkan.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_HIDDEN_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Apakah sidebar desktop disembunyikan. Di server (dan saat hidrasi) selalu "terlihat"; nilai tersimpan dibaca
 * di klien. Kerangka baru dirender setelah data pengguna dimuat, jadi tidak ada kedipan saat halaman dibuka.
 */
export function useSidebarHidden() {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const setHidden = useCallback((value: boolean) => write(value), []);
  const toggle = useCallback(() => write(!read()), []);
  return { hidden, setHidden, toggle };
}

/** Elemen pengetikan: pintasan papan ketik tidak boleh merebut tombol di sini. */
function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Sidebar desktop (md ke atas), satu untuk semua kerangka. Tetap lengket setinggi layar; saat disembunyikan
 * lebarnya menyusut ke 0 (tanpa animasi bila pengguna meminta gerak dikurangi) dan isinya tidak bisa difokus.
 * Ponsel memakai laci (MobileNavDrawer), bukan komponen ini.
 */
export function ShellAside({ children }: { children: React.ReactNode }) {
  const { hidden } = useSidebarHidden();
  return (
    <aside
      id={SIDEBAR_ID}
      inert={hidden}
      className={cn(
        'bg-sidebar text-sidebar-foreground hidden md:sticky md:top-0 md:block md:h-dvh md:shrink-0 md:overflow-x-hidden md:overflow-y-auto md:border-r md:transition-[width] md:duration-200 motion-reduce:md:transition-none',
        hidden ? 'md:w-0 md:border-r-0' : 'md:w-64',
      )}
    >
      <div className="md:w-64">{children}</div>
    </aside>
  );
}

/** Tombol di kepala halaman untuk menyembunyikan/menampilkan sidebar (md ke atas) dan pintasan Ctrl/Cmd+B. */
export function SidebarToggle() {
  const t = useTranslations('shell');
  const { hidden, toggle } = useSidebarHidden();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      if (isEditable(e.target)) return;
      // Di bawah md sidebar adalah laci; pintasan hanya untuk tampilan desktop.
      if (!window.matchMedia('(min-width: 768px)').matches) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const label = hidden ? t('showSidebar') : t('hideSidebar');
  const Icon = hidden ? PanelLeft : PanelLeftClose;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="max-md:hidden"
      onClick={toggle}
      aria-label={label}
      aria-expanded={!hidden}
      aria-controls={SIDEBAR_ID}
      aria-keyshortcuts="Control+B Meta+B"
      title={`${label} (Ctrl+B)`}
    >
      <Icon className="size-5" aria-hidden />
    </Button>
  );
}
