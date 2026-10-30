/**
 * Verifikasi surat bersifat publik: tanpa AppShell, tanpa login, dan tanpa pembatasan alamat (tidak dibungkus
 * MainHostOnly) agar QR di surat dapat dibuka dari alamat mana pun, termasuk alamat sekolah.
 */
export default function VerifyLayout({ children }: LayoutProps<'/verify'>) {
  return <>{children}</>;
}
