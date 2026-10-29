import type { NextConfig } from 'next';

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

export default nextConfig;
