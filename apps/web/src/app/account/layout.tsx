import { MainHostOnly } from '@/components/main-host-only';

/** Portal akun yayasan hanya ada di alamat utama. */
export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return <MainHostOnly>{children}</MainHostOnly>;
}
