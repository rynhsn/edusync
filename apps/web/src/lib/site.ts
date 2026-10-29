'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { type HostKind, parseHost, siteUrl } from './host';

/** Pengaturan publik dari API (domain dasar). Tidak berubah selama aplikasi berjalan. */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => unwrap(await api.GET('/v1/config')),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export type Site =
  | { ready: false }
  | ({ ready: true; baseDomain: string; urlFor: (slug: string | null, path?: string) => string } & HostKind);

/**
 * Jenis alamat yang sedang dibuka (utama atau sekolah). Baru siap di klien, karena host hanya diketahui
 * di browser dan domain dasar datang dari API.
 */
export function useSite(): Site {
  const config = useConfig();
  const [where, setWhere] = useState<{ host: string; protocol: string } | null>(null);
  useEffect(() => setWhere({ host: window.location.host, protocol: window.location.protocol }), []);

  if (!config.data || !where) return { ready: false };
  const baseDomain = config.data.baseDomain;
  return {
    ready: true,
    baseDomain,
    ...parseHost(where.host, baseDomain),
    urlFor: (slug, path = '/') => siteUrl(where.protocol, baseDomain, slug, path),
  };
}

/**
 * Pindah ke alamat sekolah lain. Sesi terikat ke alamat tempat login dibuat, jadi sesi saat ini
 * ditukar menjadi token sekali pakai (berlaku satu menit) yang dipakai halaman tujuan untuk membuat
 * sesinya sendiri.
 */
export async function goToSchool(site: Extract<Site, { ready: true }>, slug: string, next = '/dashboard') {
  const res = await fetch('/api/auth/one-time-token/generate', { credentials: 'include' });
  if (!res.ok) throw new Error('Tidak dapat membuat token pindah alamat');
  const { token } = (await res.json()) as { token: string };
  const target = site.urlFor(slug, '/auth/handoff');
  window.location.assign(`${target}?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`);
}
