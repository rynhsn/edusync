import { DEFAULT_SITE_CONTENT, type SiteContent } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildLandingMetadata,
  buildSiteMetadata,
  FALLBACK_SITE_CONFIG,
  parseSiteConfig,
  safeHref,
  socialLinks,
  whatsappHref,
} from './site-config';

describe('konfigurasi situs di web', () => {
  it('jawaban rusak atau kosong memakai isi bawaan', () => {
    expect(parseSiteConfig(null)).toBe(FALLBACK_SITE_CONFIG);
    expect(parseSiteConfig('x')).toBe(FALLBACK_SITE_CONFIG);
    expect(parseSiteConfig({ content: { brandName: '' } }).content).toEqual(DEFAULT_SITE_CONTENT);
  });

  it('hanya menerima slot dikenal dengan alamat gambar situs', () => {
    const cfg = parseSiteConfig({
      content: DEFAULT_SITE_CONTENT,
      assets: {
        logo: { url: '/v1/public/site-assets/logo?v=1', mime: 'image/png' },
        hero: { url: 'https://jahat.example/x.png', mime: 'image/png' },
        lain: { url: '/v1/public/site-assets/lain', mime: 'image/png' },
      },
    });
    expect(Object.keys(cfg.assets)).toEqual(['logo']);
  });

  it('tautan sosial: hanya http(s) dan berurutan tetap', () => {
    const content = structuredClone(DEFAULT_SITE_CONTENT) as SiteContent;
    content.social.x = 'https://x.com/edusync';
    content.social.instagram = 'https://instagram.com/edusync';
    expect(socialLinks(content).map((s) => s.key)).toEqual(['instagram', 'x']);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://a.test')).toBe('https://a.test');
  });

  it('WhatsApp menjadi tautan wa.me dengan 0 diganti 62', () => {
    expect(whatsappHref('0812-3456-7890')).toBe('https://wa.me/6281234567890');
    expect(whatsappHref('+62 812 3456 7890')).toBe('https://wa.me/6281234567890');
    expect(whatsappHref('abc')).toBeNull();
  });
});

describe('metadata situs', () => {
  it('tanpa unggahan: judul merek, tanpa ikon khusus, kartu ringkas', () => {
    const meta = buildSiteMetadata(FALLBACK_SITE_CONFIG, 'id', 'https://edusync.web.id');
    expect(meta.title).toEqual({ default: 'Edusync', template: '%s · Edusync' });
    expect(meta.icons).toBeUndefined();
    expect(meta.twitter).toMatchObject({ card: 'summary' });
    expect(meta.openGraph).toMatchObject({ siteName: 'Edusync', locale: 'id_ID' });
  });

  it('dengan unggahan: ikon, apple icon, dan gambar OG terpasang; merek mengubah templat judul', () => {
    const content = structuredClone(DEFAULT_SITE_CONTENT) as SiteContent;
    content.brandName = 'Contoh';
    const meta = buildSiteMetadata(
      {
        content,
        assets: {
          favicon: { url: '/v1/public/site-assets/favicon?v=1', mime: 'image/png' },
          app_icon: { url: '/v1/public/site-assets/app_icon?v=1', mime: 'image/png' },
          og_image: { url: '/v1/public/site-assets/og_image?v=1', mime: 'image/png' },
        },
      },
      'en',
      'https://edusync.web.id',
    );
    expect(meta.title).toEqual({ default: 'Contoh', template: '%s · Contoh' });
    expect(meta.icons).toMatchObject({
      icon: [{ url: '/v1/public/site-assets/favicon?v=1' }],
      apple: [{ url: '/v1/public/site-assets/app_icon?v=1' }],
    });
    expect(meta.openGraph).toMatchObject({
      images: [{ url: '/v1/public/site-assets/og_image?v=1' }],
      locale: 'en_US',
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('halaman utama memakai judul penuh sesuai bahasa pengunjung', () => {
    const meta = buildLandingMetadata(FALLBACK_SITE_CONFIG, 'en', 'https://edusync.web.id');
    expect(meta.title).toEqual({ absolute: DEFAULT_SITE_CONTENT.locales.en.metaTitle });
    expect(meta.description).toBe(DEFAULT_SITE_CONTENT.locales.en.metaDescription);
  });
});
