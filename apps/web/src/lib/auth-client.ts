import { createAuthClient } from 'better-auth/react';

// Alamat sama dengan halaman yang sedang dibuka; Next meneruskannya ke API. Di server (SSR) klien ini
// tidak dipakai untuk memanggil apa pun, jadi nilai cadangannya tidak berpengaruh.
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});
