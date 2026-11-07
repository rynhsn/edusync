import { describe, expect, it } from 'vitest';
import { internalDestination } from './use-unsaved-guard';

const here = {
  href: 'https://sekolah.test/cards/abc',
  origin: 'https://sekolah.test',
  pathname: '/cards/abc',
  search: '',
};
const a = (href: string, extra: { target?: string; download?: boolean } = {}) => ({
  href: new URL(href, here.href).href,
  target: extra.target ?? '',
  hasAttribute: (n: string) => n === 'download' && !!extra.download,
});

describe('internalDestination', () => {
  it('tautan ke halaman lain di situs yang sama ditahan', () => {
    expect(internalDestination(a('/students'), here)).toBe('/students');
    expect(internalDestination(a('/cards?x=1#top'), here)).toBe('/cards?x=1#top');
  });
  it('tautan ke halaman yang sama, situs lain, tab baru, atau unduhan dilepas', () => {
    expect(internalDestination(a('/cards/abc#bagian'), here)).toBeNull();
    expect(internalDestination(a('https://contoh.org/x'), here)).toBeNull();
    expect(internalDestination(a('/students', { target: '_blank' }), here)).toBeNull();
    expect(internalDestination(a('/file.pdf', { download: true }), here)).toBeNull();
  });
});
