import type { Metadata } from 'next';
import { LandingPage } from '../landing/landing-page';

export const metadata: Metadata = { title: 'Pratinjau', robots: { index: false, follow: false } };

/**
 * Pratinjau halaman utama untuk staf platform. Alamat utama `/` mengalihkan staf yang sudah masuk ke konsol, jadi
 * hasil suntingan dilihat di sini. Isinya publik (sama dengan halaman utama) tetapi membaca data tanpa cache.
 */
export default function SitePreviewPage() {
  return <LandingPage fresh />;
}
