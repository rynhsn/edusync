import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Dashboard sepenuhnya dirender di klien di balik login, jadi Cache Components tidak memberi manfaat
  // dan hanya menambah validasi navigasi. Aktifkan lagi untuk situs publik (M8) bila diperlukan.
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: false }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
