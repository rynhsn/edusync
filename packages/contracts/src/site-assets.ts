/*
 * Gambar situs Edusync (ikon, logo, ilustrasi, OG) yang diatur staf platform. Aturan per slot ada di sini agar API
 * (penolakan) dan konsol web (petunjuk ukuran/jenis) memakai angka yang sama.
 */

export const SITE_ASSET_KEYS = ['favicon', 'app_icon', 'logo', 'logo_dark', 'hero', 'og_image'] as const;
export type SiteAssetKey = (typeof SITE_ASSET_KEYS)[number];

export const SITE_ASSET_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
] as const;
export type SiteAssetMime = (typeof SITE_ASSET_MIMES)[number];

export interface SiteAssetSlot {
  mimes: readonly SiteAssetMime[];
  maxBytes: number;
  /** Petunjuk ukuran piksel yang disarankan, ditampilkan di konsol. */
  size: string;
}

const KB = 1024;

export const SITE_ASSET_SLOTS: Readonly<Record<SiteAssetKey, SiteAssetSlot>> = {
  favicon: {
    mimes: ['image/png', 'image/x-icon', 'image/svg+xml', 'image/webp'],
    maxBytes: 256 * KB,
    size: '32x32 atau 64x64',
  },
  app_icon: { mimes: ['image/png'], maxBytes: 256 * KB, size: '512x512 (persegi)' },
  logo: {
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2048 * KB,
    size: 'tinggi sekitar 64 px, latar transparan',
  },
  logo_dark: {
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2048 * KB,
    size: 'tinggi sekitar 64 px, untuk tema gelap',
  },
  hero: {
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2048 * KB,
    size: 'sekitar 1200x900',
  },
  og_image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 2048 * KB, size: '1200x630' },
};

export function isSiteAssetKey(value: string): value is SiteAssetKey {
  return (SITE_ASSET_KEYS as readonly string[]).includes(value);
}

export type SiteAssetProblem = 'mime' | 'size' | 'content' | 'svg_unsafe';

const startsWith = (bytes: Uint8Array, magic: readonly number[], offset = 0) =>
  magic.every((b, i) => bytes[offset + i] === b);

/** Pola yang membuat SVG berbahaya bila dibuka langsung di peramban (skrip, penanganan peristiwa, objek asing). */
const SVG_UNSAFE = [
  /<\s*script/i,
  /<\s*foreignObject/i,
  /<\s*(iframe|embed|object)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /<!ENTITY/i,
];

/** Salah satu dari `svg_unsafe` / `content` untuk isi SVG, atau null bila aman. */
export function checkSvg(bytes: Uint8Array): 'svg_unsafe' | 'content' | null {
  // Pola yang dicari ASCII, jadi cukup membaca bita apa adanya (tanpa TextDecoder, tidak ada di lib kontrak).
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  if (!/<\s*svg[\s>]/i.test(text)) return 'content';
  return SVG_UNSAFE.some((re) => re.test(text)) ? 'svg_unsafe' : null;
}

/** Periksa jenis, ukuran, dan isi sebenarnya (magic bytes) sebuah gambar untuk slot tertentu. Null = lolos. */
export function checkSiteAsset(key: SiteAssetKey, mime: string, bytes: Uint8Array): SiteAssetProblem | null {
  const slot = SITE_ASSET_SLOTS[key];
  if (!(slot.mimes as readonly string[]).includes(mime)) return 'mime';
  if (bytes.length === 0 || bytes.length > slot.maxBytes) return 'size';
  switch (mime) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? null : 'content';
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? null : 'content';
    case 'image/webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        ? null
        : 'content';
    case 'image/x-icon':
      return startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) ? null : 'content';
    case 'image/svg+xml':
      return checkSvg(bytes);
    default:
      return 'mime';
  }
}
