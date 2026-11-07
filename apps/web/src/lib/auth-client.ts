import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Alamat sama dengan halaman yang sedang dibuka; Next meneruskannya ke API. Di server (SSR) klien ini
// tidak dipakai untuk memanggil apa pun, jadi nilai cadangannya tidak berpengaruh.
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
  // `phone` adalah kolom tambahan pengguna (lihat apps/api/src/auth.ts).
  plugins: [
    emailOTPClient(),
    inferAdditionalFields({
      user: { phone: { type: 'string', required: false }, username: { type: 'string', required: false } },
    }),
  ],
});
