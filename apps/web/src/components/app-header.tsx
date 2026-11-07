'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Kepala halaman bersama untuk semua kerangka: lengket, buram-latar, jarak dan lapisan yang sama.
 * `mobileNav` (tombol menu, hanya ponsel) dan `leading` (mis. lencana peran) ada di kiri; `children` di kanan.
 */
export function AppHeader({
  mobileNav,
  sidebarToggle,
  leading,
  search,
  children,
  className,
}: {
  mobileNav?: React.ReactNode;
  /** Tombol sembunyikan/tampilkan sidebar (hanya md ke atas); biasanya `<SidebarToggle />`. */
  sidebarToggle?: React.ReactNode;
  leading?: React.ReactNode;
  /** Pencarian di kanan, sebelum kontrol pengguna; biasanya `<TopbarSearch />`. */
  search?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'bg-background/80 sticky top-0 z-20 flex items-center justify-between gap-2 border-b p-3 backdrop-blur',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {mobileNav}
        {sidebarToggle}
        {leading}
      </div>
      <div className="flex items-center gap-1">
        {search}
        {children}
      </div>
    </header>
  );
}

/**
 * Menu geser untuk ponsel: tombol hamburger di kepala halaman yang membuka laci dari kiri. Dibangun di atas
 * dialog (fokus terkunci, Esc menutup) dan menutup sendiri begitu pengguna berpindah halaman.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada perubahan halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" aria-label={t('menu')} />}
      >
        <Menu className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="bg-sidebar text-sidebar-foreground data-closed:slide-out-to-left data-open:slide-in-from-left top-0 left-0 h-dvh w-80 max-w-[85vw] translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto rounded-none p-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-80">
        <DialogTitle className="sr-only">{t('menu')}</DialogTitle>
        <DialogDescription className="sr-only">{t('menu')}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
