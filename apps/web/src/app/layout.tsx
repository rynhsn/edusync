import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { buildSiteMetadata, getSiteConfig } from '@/lib/site-config';
import { requestOrigin } from '@/lib/site-origin';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] });

/** Nama merek, ikon, dan gambar OG dari pengaturan situs (konsol platform); cadangannya teks bawaan. */
export async function generateMetadata(): Promise<Metadata> {
  const [config, locale, origin] = await Promise.all([getSiteConfig(), getLocale(), requestOrigin()]);
  return buildSiteMetadata(config, locale, origin);
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
