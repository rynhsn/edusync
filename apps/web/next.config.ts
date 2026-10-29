import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Next hanya membaca .env di folder apps/web; konfigurasi bersama ada di .env akar repo.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Variabel boleh datang dari lingkungan (CI, produksi).
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Subdomain sekolah di lokal (<alamat>.localhost:3000) harus boleh memakai dev server dan HMR.
  allowedDevOrigins: ['*.localhost'],

  // Semua panggilan API lewat alamat web yang sama. Dengan begitu cookie sesi menjadi milik alamat itu
  // (alamat utama, subdomain sekolah, atau nanti domain milik sekolah) dan tidak ada permintaan lintas-situs.
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` },
      { source: '/api/auth/:path*', destination: `${apiUrl}/api/auth/:path*` },
    ];
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
