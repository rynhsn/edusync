import { DEFAULT_SITE_CONTENT, SITE_MAX_FEATURES, type SiteContent } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import {
  addFeature,
  canAddFeature,
  formatBytes,
  localesWithMissingRequired,
  moveItem,
  removeItem,
  sameContent,
  updateFeatureText,
  updateLocale,
} from './site-editor';

const base = () => structuredClone(DEFAULT_SITE_CONTENT) as SiteContent;

describe('editor situs: daftar', () => {
  it('memindahkan naik/turun dan menahan di tepi', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('menghapus elemen tanpa mengubah masukan', () => {
    const list = ['a', 'b', 'c'];
    expect(removeItem(list, 1)).toEqual(['a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('menambah fitur kosong sampai batas', () => {
    let content = base();
    content = addFeature(content);
    expect(content.features).toHaveLength(11);
    expect(content.features[10]?.text.en.title).toBe('');
    while (canAddFeature(content)) content = addFeature(content);
    expect(content.features).toHaveLength(SITE_MAX_FEATURES);
    expect(addFeature(content)).toBe(content);
  });
});

describe('editor situs: pembaruan', () => {
  it('mengubah satu bahasa dan satu teks fitur tanpa menyentuh yang lain', () => {
    const content = base();
    const next = updateLocale(content, 'en', { heroTitle: 'Hello' });
    expect(next.locales.en.heroTitle).toBe('Hello');
    expect(next.locales.id.heroTitle).toBe(content.locales.id.heroTitle);
    expect(content.locales.en.heroTitle).not.toBe('Hello');

    const withFeature = updateFeatureText(content, 2, 'su', { title: 'Judul' });
    expect(withFeature.features[2]?.text.su.title).toBe('Judul');
    expect(withFeature.features[2]?.text.su.description).toBe(content.features[2]?.text.su.description);
    expect(withFeature.features[3]).toBe(content.features[3]);
  });

  it('menandai bahasa yang kolom wajibnya kosong, termasuk judul fitur', () => {
    expect(localesWithMissingRequired(base())).toEqual([]);
    let content = updateLocale(base(), 'su', { heroTitle: '  ' });
    content = updateFeatureText(content, 0, 'en', { title: '' });
    expect(localesWithMissingRequired(content)).toEqual(['en', 'su']);
  });

  it('membandingkan isi untuk penanda perubahan', () => {
    expect(sameContent(base(), base())).toBe(true);
    expect(sameContent(base(), updateLocale(base(), 'id', { tagline: 'x' }))).toBe(false);
  });

  it('memformat ukuran berkas', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(256 * 1024)).toBe('256 KB');
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
  });
});
