import {
  DEFAULT_SITE_CONTENT,
  isSiteAssetKey,
  resolveSiteContent,
  type SiteAssetKey,
  type SiteContent,
  siteLocaleOf,
} from '@edusync/contracts';
import type { Metadata } from 'next';
import { cache } from 'react';

/*
 * Isi dan gambar situs Edusync yang diatur staf platform (GET /v1/public/site). Dibaca di server dengan cache
 * sekitar satu menit; bila API mati, halaman memakai isi bawaan yang sama dengan teks aslinya.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface SiteAssetRef {
  url: string;
  mime: string;
}

export interface SiteConfig {
  content: SiteContent;
  assets: Partial<Record<SiteAssetKey, SiteAssetRef>>;
}

export const FALLBACK_SITE_CONFIG: SiteConfig = {
  content: DEFAULT_SITE_CONTENT as SiteContent,
  assets: {},
};

/** Rapikan jawaban API: isi diperiksa ulang dengan skema, slot gambar tak dikenal dibuang. */
export function parseSiteConfig(raw: unknown): SiteConfig {
  if (typeof raw !== 'object' || raw === null) return FALLBACK_SITE_CONFIG;
  const { content, assets } = raw as { content?: unknown; assets?: unknown };
  const clean: SiteConfig['assets'] = {};
  if (typeof assets === 'object' && assets !== null) {
    for (const [key, ref] of Object.entries(assets)) {
      const r = ref as Partial<SiteAssetRef> | null;
      if (isSiteAssetKey(key) && typeof r?.url === 'string' && r.url.startsWith('/v1/public/site-assets/')) {
        clean[key] = { url: r.url, mime: typeof r.mime === 'string' ? r.mime : '' };
      }
    }
  }
  return { content: resolveSiteContent(content), assets: clean };
}

/** `fresh` melewati cache (untuk pratinjau di konsol, supaya hasil simpan langsung terlihat). */
export const getSiteConfig = cache(async (fresh = false): Promise<SiteConfig> => {
  try {
    const res = await fetch(
      `${API_URL}/v1/public/site`,
      fresh ? { cache: 'no-store' } : { next: { revalidate: 60 } },
    );
    if (!res.ok) return FALLBACK_SITE_CONFIG;
    return parseSiteConfig(await res.json());
  } catch {
    return FALLBACK_SITE_CONFIG;
  }
});

/** Alamat gambar yang diunggah, atau null bila slot kosong (pakai gambar bawaan aplikasi). */
export function siteAssetUrl(config: SiteConfig, key: SiteAssetKey): string | null {
  return config.assets[key]?.url ?? null;
}

/** Hanya alamat http(s) yang boleh menjadi tautan; selain itu dibuang. */
export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Tautan sosial yang terisi, berurutan tetap. */
export function socialLinks(content: SiteContent): { key: keyof SiteContent['social']; href: string }[] {
  const order = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'] as const;
  return order.flatMap((key) => {
    const href = safeHref(content.social[key]);
    return href ? [{ key, href }] : [];
  });
}

/** Nomor WhatsApp menjadi tautan wa.me (hanya angka; 0 di depan diganti 62). Null bila tidak ada angka. */
export function whatsappHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`;
}

const OG_LOCALE: Record<string, string> = { id: 'id_ID', en: 'en_US', su: 'su_ID' };

/**
 * Metadata dasar seluruh situs dari konfigurasi: nama merek sebagai judul, ikon unggahan (bila ada), dan gambar OG.
 * `origin` (mis. https://edusync.web.id) dibutuhkan agar alamat gambar OG absolut.
 */
export function buildSiteMetadata(config: SiteConfig, locale: string, origin: string): Metadata {
  const { content } = config;
  const l = siteLocaleOf(content, locale);
  const favicon = siteAssetUrl(config, 'favicon');
  const appIcon = siteAssetUrl(config, 'app_icon');
  const og = siteAssetUrl(config, 'og_image');
  const description = l.metaDescription || l.tagline || content.brandName;
  return {
    metadataBase: new URL(origin),
    title: { default: content.brandName, template: `%s · ${content.brandName}` },
    description,
    ...(favicon || appIcon
      ? {
          icons: {
            ...(favicon ? { icon: [{ url: favicon, type: config.assets.favicon?.mime || undefined }] } : {}),
            ...(appIcon ? { apple: [{ url: appIcon, type: 'image/png' }] } : {}),
          },
        }
      : {}),
    openGraph: {
      type: 'website',
      siteName: content.brandName,
      title: l.metaTitle,
      description,
      locale: OG_LOCALE[locale] ?? 'id_ID',
      ...(og ? { images: [{ url: og }] } : {}),
    },
    twitter: { card: og ? 'summary_large_image' : 'summary', title: l.metaTitle, description },
  };
}

/** Metadata halaman utama: judul penuh (tanpa templat) dan deskripsi bahasa pengunjung. */
export function buildLandingMetadata(config: SiteConfig, locale: string, origin: string): Metadata {
  const base = buildSiteMetadata(config, locale, origin);
  const l = siteLocaleOf(config.content, locale);
  return { title: { absolute: l.metaTitle }, description: base.description, openGraph: base.openGraph };
}
