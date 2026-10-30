/**
 * Halaman pembimbing industri bersifat publik: tanpa AppShell, tanpa login, dan tanpa pembatasan alamat
 * (tidak dibungkus MainHostOnly) agar tautan dapat dibuka dari alamat mana pun.
 */
export default function PklPublicLayout({ children }: LayoutProps<'/pkl/[token]'>) {
  return <>{children}</>;
}
