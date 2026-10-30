import { headers } from 'next/headers';
import { cache } from 'react';
import { parseHost } from './host';
import { protocolOf, type SiteLinks, siteLinks } from './site-links';

/*
 * Pengambilan data situs publik di server (untuk SEO: metadata dan HTML sudah berisi konten). Bentuknya
 * mengikuti GET /v1/public/site/{slug}; tanpa login, jadi tidak perlu cookie atau x-school-id.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type PublicCategory = 'news' | 'agenda' | 'notice';

export interface PublicItem {
  id: string;
  title: string;
  excerpt: string;
  category: PublicCategory;
  eventDate: string | null;
  pinned: boolean;
  publishedAt: string | null;
}

export interface PublicDetail extends Omit<PublicItem, 'excerpt'> {
  body: string;
}

export interface SiteProfile {
  tagline: string | null;
  about: string | null;
  vision: string | null;
  mission: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  mapUrl: string | null;
  accentColor: string | null;
}

export interface SiteHome {
  school: { name: string; slug: string };
  profile: SiteProfile;
  admission: { enabled: boolean; openLevels: string[] };
  announcements: PublicItem[];
  agenda: PublicItem[];
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const seg = encodeURIComponent;

export const getSiteHome = cache((slug: string) => getJson<SiteHome>(`/v1/public/site/${seg(slug)}`));

export const getSiteAnnouncements = cache((slug: string, category: string, offset: number) =>
  getJson<{ items: PublicItem[]; total: number }>(
    `/v1/public/site/${seg(slug)}/announcements?limit=12&offset=${offset}${category ? `&category=${seg(category)}` : ''}`,
  ),
);

export const getSiteAnnouncement = cache((slug: string, id: string) =>
  getJson<PublicDetail>(`/v1/public/site/${seg(slug)}/announcements/${seg(id)}`),
);

const getBaseDomain = cache(
  async () => (await getJson<{ baseDomain: string }>('/v1/config'))?.baseDomain ?? null,
);

/** Slug sekolah dari host permintaan (untuk /site yang dibuka dari <slug>.domain); null di alamat utama. */
export async function hostSlug(): Promise<string | null> {
  const [h, base] = [await headers(), await getBaseDomain()];
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host || !base) return null;
  const where = parseHost(host, base);
  return where.kind === 'school' ? where.slug : null;
}

/** Tautan situs untuk permintaan saat ini. */
export async function currentLinks(slug: string, mode: 'host' | 'slug'): Promise<SiteLinks> {
  const [h, baseDomain] = [await headers(), await getBaseDomain()];
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return siteLinks({
    host,
    baseDomain: baseDomain ?? host,
    protocol: protocolOf(h.get('x-forwarded-proto'), host),
    slug,
    mode,
  });
}
