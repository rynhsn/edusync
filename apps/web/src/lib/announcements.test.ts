import { describe, expect, it } from 'vitest';
import {
  accentVars,
  announcementStatus,
  contrastRatio,
  daysBetween,
  endOfDayIso,
  excerpt,
  initialsOf,
  isoDay,
  mapEmbedSrc,
  matchesQuery,
  normalizeHex,
  paragraphs,
  readableOn,
  safeHttpUrl,
  telLink,
  whatsappLink,
} from './announcements';

describe('warna aksen', () => {
  it('menormalkan hex', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('0F766E')).toBe('#0f766e');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('merah')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
  it('memilih teks yang terbaca', () => {
    expect(readableOn('#ffffff')).toBe('#111827');
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('#0f766e')).toBe('#ffffff');
    expect(readableOn('#fde047')).toBe('#111827');
  });
  it('kontras hitam-putih 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('aksen tak sah jatuh ke bawaan', () => {
    expect(accentVars('xx')['--site-accent']).toBe('#0f766e');
    expect(accentVars('#E11D48')['--site-accent']).toBe('#e11d48');
  });
});

describe('tautan', () => {
  it('hanya http(s) yang aman', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('https://maps.app.goo.gl/x')).toBe('https://maps.app.goo.gl/x');
    expect(safeHttpUrl('bukan url')).toBeNull();
  });
  it('iframe peta hanya penyedia tepercaya', () => {
    expect(mapEmbedSrc('https://www.google.com/maps/embed?pb=abc')).toContain('/maps/embed');
    expect(mapEmbedSrc('https://www.openstreetmap.org/export/embed.html?bbox=1')).not.toBeNull();
    expect(mapEmbedSrc('https://evil.example/maps/embed')).toBeNull();
    expect(mapEmbedSrc('https://www.google.com/maps/place/x')).toBeNull();
    expect(mapEmbedSrc('http://www.google.com/maps/embed')).toBeNull();
  });
  it('whatsapp dan telepon', () => {
    expect(whatsappLink('0812-3456-7890')).toBe('https://wa.me/6281234567890');
    expect(whatsappLink('+62 812 3456 7890')).toBe('https://wa.me/6281234567890');
    expect(whatsappLink('812345678')).toBe('https://wa.me/62812345678');
    expect(whatsappLink('12')).toBeNull();
    expect(telLink('(022) 123-456')).toBe('tel:022123456');
    expect(telLink('1')).toBeNull();
  });
});

describe('teks', () => {
  it('ringkasan memotong di batas kata', () => {
    expect(excerpt('# Judul\n\nIsi **tebal** pendek')).toBe('Judul Isi tebal pendek');
    const long = 'kata '.repeat(100);
    const out = excerpt(long, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
  it('paragraf', () => {
    expect(paragraphs('a\nb\n\n\nc')).toEqual(['a\nb', 'c']);
    expect(paragraphs(null)).toEqual([]);
  });
  it('inisial', () => {
    expect(initialsOf('SMP IT Miftahul Huda')).toBe('SI');
    expect(initialsOf('123')).toBe('S');
  });
  it('pencarian', () => {
    expect(matchesQuery({ title: 'Libur Semester', body: 'x' }, 'libur')).toBe(true);
    expect(matchesQuery({ title: 'a', body: 'Ujian' }, 'ujian')).toBe(true);
    expect(matchesQuery({ title: 'a', body: 'b' }, 'zzz')).toBe(false);
    expect(matchesQuery({ title: 'a', body: 'b' }, '  ')).toBe(true);
  });
});

describe('tanggal', () => {
  it('selisih hari', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
  it('hari WIB', () => {
    expect(isoDay('2026-10-31T20:00:00Z')).toBe('2026-11-01');
    expect(isoDay('2026-10-31T10:00:00Z')).toBe('2026-10-31');
    expect(endOfDayIso('2026-11-01')).toBe('2026-11-01T16:59:59.000Z');
    expect(endOfDayIso('')).toBeNull();
  });
  it('status tampilan', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    const base = { status: 'published' as const, publishedAt: '2026-10-01T00:00:00Z', expiresAt: null };
    expect(announcementStatus({ ...base, status: 'draft' }, now)).toBe('draft');
    expect(announcementStatus(base, now)).toBe('published');
    expect(announcementStatus({ ...base, expiresAt: '2026-10-30T00:00:00Z' }, now)).toBe('expired');
    expect(announcementStatus({ ...base, publishedAt: '2026-11-05T00:00:00Z' }, now)).toBe('scheduled');
  });
});
