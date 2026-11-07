import { describe, expect, it } from 'vitest';
import { checkSiteAsset, checkSvg, SITE_ASSET_SLOTS } from './site-assets';
import {
  DEFAULT_SITE_CONTENT,
  resolveSiteContent,
  SITE_MAX_FEATURES,
  siteContentSchema,
  siteLocaleOf,
  siteParagraphs,
} from './site-content';

const bytes = (...b: number[]) => new Uint8Array(b);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const svg = (body: string) => Uint8Array.from(body, (c) => c.charCodeAt(0));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('isi situs: bawaan dan validasi', () => {
  it('bawaan lolos skema dan memuat sepuluh fitur tiga bahasa', () => {
    expect(siteContentSchema.safeParse(DEFAULT_SITE_CONTENT).success).toBe(true);
    expect(DEFAULT_SITE_CONTENT.features).toHaveLength(10);
    expect(DEFAULT_SITE_CONTENT.sections.about).toBe(false);
  });

  it('isi rusak atau kosong kembali ke bawaan; kolom yang belum ada dilengkapi bawaan', () => {
    expect(resolveSiteContent(null)).toEqual(DEFAULT_SITE_CONTENT);
    expect(resolveSiteContent('rusak')).toEqual(DEFAULT_SITE_CONTENT);
    expect(resolveSiteContent({ brandName: '' })).toEqual(DEFAULT_SITE_CONTENT);
    const partial = resolveSiteContent({ brandName: 'Contoh', locales: { en: { heroTitle: 'Hello' } } });
    expect(partial.brandName).toBe('Contoh');
    expect(partial.locales.en.heroTitle).toBe('Hello');
    expect(partial.locales.id.heroTitle).toBe(DEFAULT_SITE_CONTENT.locales.id.heroTitle);
  });

  it('menolak ikon di luar daftar, tautan bukan http(s), email salah, dan fitur terlalu banyak', () => {
    const base = clone(DEFAULT_SITE_CONTENT);
    const feature = base.features[0]!;
    expect(siteContentSchema.safeParse({ ...base, features: [{ ...feature, icon: 'Bomb' }] }).success).toBe(
      false,
    );
    expect(
      siteContentSchema.safeParse({ ...base, social: { ...base.social, x: 'javascript:alert(1)' } }).success,
    ).toBe(false);
    expect(
      siteContentSchema.safeParse({ ...base, contact: { ...base.contact, email: 'bukan-email' } }).success,
    ).toBe(false);
    expect(
      siteContentSchema.safeParse({ ...base, features: Array(SITE_MAX_FEATURES + 1).fill(feature) }).success,
    ).toBe(false);
    expect(
      siteContentSchema.safeParse({ ...base, social: { ...base.social, x: 'https://x.com/edusync' } })
        .success,
    ).toBe(true);
  });

  it('bahasa tak dikenal memakai Indonesia; paragraf dipisah baris kosong', () => {
    expect(siteLocaleOf(DEFAULT_SITE_CONTENT, 'fr')).toBe(DEFAULT_SITE_CONTENT.locales.id);
    expect(siteLocaleOf(DEFAULT_SITE_CONTENT, 'su')).toBe(DEFAULT_SITE_CONTENT.locales.su);
    expect(siteParagraphs('Satu\nbaris.\n\n\n  Dua.  \n\n')).toEqual(['Satu\nbaris.', 'Dua.']);
  });
});

describe('gambar situs', () => {
  it('menerima PNG asli dan menolak isi yang tidak cocok dengan jenisnya', () => {
    expect(checkSiteAsset('logo', 'image/png', bytes(...PNG))).toBeNull();
    expect(checkSiteAsset('logo', 'image/png', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('content');
    expect(checkSiteAsset('logo', 'image/gif', bytes(...PNG))).toBe('mime');
    expect(checkSiteAsset('og_image', 'image/svg+xml', svg('<svg/>'))).toBe('mime');
    expect(checkSiteAsset('favicon', 'image/x-icon', bytes(0, 0, 1, 0, 1))).toBeNull();
  });

  it('batas ukuran: favicon 256 KB, gambar lain 2 MB, kosong ditolak', () => {
    const big = (n: number) => new Uint8Array([...PNG, ...new Array(n - PNG.length).fill(0)]);
    expect(checkSiteAsset('favicon', 'image/png', big(SITE_ASSET_SLOTS.favicon.maxBytes))).toBeNull();
    expect(checkSiteAsset('favicon', 'image/png', big(SITE_ASSET_SLOTS.favicon.maxBytes + 1))).toBe('size');
    expect(checkSiteAsset('hero', 'image/png', big(SITE_ASSET_SLOTS.hero.maxBytes))).toBeNull();
    expect(checkSiteAsset('hero', 'image/png', big(SITE_ASSET_SLOTS.hero.maxBytes + 1))).toBe('size');
    expect(checkSiteAsset('hero', 'image/png', bytes())).toBe('size');
  });

  it('SVG aman lolos; skrip, penanganan peristiwa, foreignObject, dan javascript: ditolak', () => {
    expect(
      checkSvg(svg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')),
    ).toBeNull();
    expect(checkSvg(svg('<svg><script>alert(1)</script></svg>'))).toBe('svg_unsafe');
    expect(checkSvg(svg('<svg onload="x()"></svg>'))).toBe('svg_unsafe');
    expect(checkSvg(svg('<svg><foreignObject><div/></foreignObject></svg>'))).toBe('svg_unsafe');
    expect(checkSvg(svg('<svg><a href="javascript:alert(1)"/></svg>'))).toBe('svg_unsafe');
    expect(checkSvg(svg('<html></html>'))).toBe('content');
  });
});
