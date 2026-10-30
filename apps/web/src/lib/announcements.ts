/**
 * Fungsi murni untuk pengumuman dan situs publik sekolah: warna aksen, tautan aman, ringkasan teks, status.
 * Dipisah dari komponen agar bisa diuji tanpa DOM.
 */

export const CATEGORIES = ['news', 'agenda', 'notice'] as const;
export type AnnouncementCategory = (typeof CATEGORIES)[number];

export const AUDIENCES = ['public', 'portal', 'staff', 'all'] as const;
export type AnnouncementAudience = (typeof AUDIENCES)[number];

/** Warna aksen bawaan situs sekolah (teal tema). */
export const DEFAULT_ACCENT = '#0f766e';

/** Pilihan warna aksen siap pakai. */
export const ACCENT_PRESETS = [
  { key: 'teal', hex: '#0f766e' },
  { key: 'blue', hex: '#2563eb' },
  { key: 'indigo', hex: '#4f46e5' },
  { key: 'rose', hex: '#e11d48' },
  { key: 'orange', hex: '#ea580c' },
  { key: 'emerald', hex: '#059669' },
  { key: 'violet', hex: '#7c3aed' },
  { key: 'slate', hex: '#475569' },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** Terima #RGB atau #RRGGBB (boleh tanpa #); kembalikan #rrggbb huruf kecil, atau null bila tidak sah. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, (c) => c + c);
  const full = `#${v}`;
  return HEX.test(full) ? full.toLowerCase() : null;
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminans relatif WCAG (0 gelap sampai 1 terang). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG antara dua warna. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Teks putih atau hampir-hitam, mana yang lebih terbaca di atas warna latar. */
export function readableOn(hex: string): '#ffffff' | '#111827' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#111827') ? '#ffffff' : '#111827';
}

/** Variabel CSS situs dari warna aksen (aksen tak sah jatuh ke bawaan). */
export function accentVars(accent: string | null | undefined): Record<string, string> {
  const hex = normalizeHex(accent) ?? DEFAULT_ACCENT;
  return { '--site-accent': hex, '--site-accent-ink': readableOn(hex) };
}

/** Hanya http(s) yang dianggap tautan aman; selain itu null. */
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Sumber iframe peta hanya untuk penyedia tepercaya (Google Maps embed, OpenStreetMap embed). */
export function mapEmbedSrc(input: string | null | undefined): string | null {
  const url = safeHttpUrl(input);
  if (!url) return null;
  const u = new URL(url);
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'google.com' && u.pathname.startsWith('/maps/embed')) return url;
  if (host === 'openstreetmap.org' && u.pathname.startsWith('/export/embed')) return url;
  return null;
}

/** Tautan WhatsApp wa.me dari nomor bebas format (0812…, +62 812…, 62812…); null bila tak masuk akal. */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** Tautan telepon tel: dari nomor bebas format. */
export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const v = phone.replace(/[^\d+]/g, '');
  return v.replace(/\D/g, '').length >= 5 ? `tel:${v}` : null;
}

/** Teks polos tanpa tanda markdown ringan, dipotong di batas kata dengan elipsis. */
export function excerpt(body: string, max = 160): string {
  const plain = body
    .replace(/[#>*_`~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Pecah isi menjadi paragraf (dipisah baris kosong); baris tunggal tetap satu paragraf. */
export function paragraphs(body: string | null | undefined): string[] {
  return (body ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Selisih hari kalender dari `from` ke `to` (TTTT-BB-HH); negatif bila sudah lewat. */
export function daysBetween(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Tanggal lokal sebagai TTTT-BB-HH. */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Tanggal (TTTT-BB-HH) dari stempel waktu ISO, memakai tanggal kalender UTC+7 agar sesuai hari sekolah. */
export function isoDay(timestamp: string): string {
  return new Date(new Date(timestamp).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export type AnnouncementStatus = 'draft' | 'published' | 'scheduled' | 'expired';

/** Status tampilan: kedaluwarsa dan terjadwal dihitung dari waktu; `now` disuntikkan agar teruji. */
export function announcementStatus(
  a: { status: 'draft' | 'published'; publishedAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): AnnouncementStatus {
  if (a.status === 'draft') return 'draft';
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= now.getTime()) return 'expired';
  if (a.publishedAt && new Date(a.publishedAt).getTime() > now.getTime()) return 'scheduled';
  return 'published';
}

/** Kata kunci pencarian bebas-aksen untuk filter daftar. */
export function matchesQuery(a: { title: string; body: string }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return a.title.toLowerCase().includes(needle) || a.body.toLowerCase().includes(needle);
}

/** Awal nama sekolah untuk lencana (maksimal dua huruf). */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^\p{L}/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'S'
  );
}

/** Ubah ISO stempel waktu menjadi nilai `datetime-local`-agnostik: tanggal TTTT-BB-HH (UTC+7), '' bila kosong. */
export function dateOnlyOrEmpty(timestamp: string | null | undefined): string {
  return timestamp ? isoDay(timestamp) : '';
}

/** Akhir hari (23:59:59 WIB) dari tanggal TTTT-BB-HH sebagai stempel ISO UTC; null bila kosong. */
export function endOfDayIso(date: string): string | null {
  if (!date) return null;
  return new Date(`${date}T23:59:59+07:00`).toISOString();
}
