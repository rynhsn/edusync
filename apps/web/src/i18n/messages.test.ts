import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import id from '../../messages/id.json';
import su from '../../messages/su.json';
import { defaultLocale, isLocale, matchAcceptLanguage } from './config';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const catalogs = { id: flatten(id), en: flatten(en), su: flatten(su) };

describe('terjemahan', () => {
  for (const locale of ['id', 'su'] as const) {
    it(`${locale} memiliki kunci yang sama persis dengan en`, () => {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
    });

    it(`${locale} memakai placeholder yang sama dengan en`, () => {
      for (const [key, text] of Object.entries(catalogs[locale])) {
        expect(placeholders(text), key).toEqual(placeholders(catalogs.en[key] as string));
      }
    });
  }

  it('tidak ada teks kosong', () => {
    for (const catalog of Object.values(catalogs)) {
      for (const [key, text] of Object.entries(catalog)) expect(text.trim(), key).not.toBe('');
    }
  });

  it('setiap peran dan izin di katalog kontrak punya terjemahan', async () => {
    const { PERMISSIONS, SYSTEM_ROLES } = await import('@edusync/contracts');
    for (const catalog of Object.values(catalogs)) {
      for (const role of Object.keys(SYSTEM_ROLES)) expect(catalog[`roles.${role}`], role).toBeTruthy();
      for (const p of PERMISSIONS) expect(catalog[`permissions.${p.replace(':', '_')}`], p).toBeTruthy();
    }
  });
});

describe('pemilihan bahasa', () => {
  it('mengenali bahasa yang didukung', () => {
    expect(isLocale('su')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('mencocokkan Accept-Language berdasarkan bagian bahasa', () => {
    expect(matchAcceptLanguage('id-ID,id;q=0.9,en;q=0.8')).toBe('id');
    expect(matchAcceptLanguage('fr-FR,en-US;q=0.8')).toBe('en');
    expect(matchAcceptLanguage('su-ID')).toBe('su');
  });

  it('mengembalikan null bila tidak ada yang cocok sehingga bahasa bawaan dipakai', () => {
    expect(matchAcceptLanguage('fr,de')).toBeNull();
    expect(matchAcceptLanguage(null)).toBeNull();
    expect(defaultLocale).toBe('id');
  });
});
