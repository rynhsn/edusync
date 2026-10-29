import { MainHostOnly } from '@/components/main-host-only';

/** Pendaftaran hanya ada di alamat utama. */
export default function RegisterLayout({ children }: LayoutProps<'/register'>) {
  return <MainHostOnly>{children}</MainHostOnly>;
}
