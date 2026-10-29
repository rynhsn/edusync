import { MainHostOnly } from '@/components/main-host-only';

/** Pembayaran hanya ada di alamat utama. */
export default function PayLayout({ children }: LayoutProps<'/pay'>) {
  return <MainHostOnly>{children}</MainHostOnly>;
}
