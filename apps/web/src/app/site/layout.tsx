import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Edusync' },
};

/** Situs publik sekolah: tanpa AppShell dan tanpa login (kerangkanya dibuat per halaman oleh SiteShell). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
