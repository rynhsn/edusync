import type { Metadata } from 'next';
import { GatewayView } from '../gateway-view';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pintu masuk ke aplikasi setelah login dan dari tombol "Buka aplikasi" di profil perusahaan: mengarahkan ke
 * konsol platform, portal pemilik lembaga, atau sekolah menurut peran. Halaman depan (`/`) tidak mengalihkan.
 */
export default function Enter() {
  return <GatewayView landing={null} enter />;
}
