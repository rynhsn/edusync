import { existsSync } from 'node:fs';
import { DEFAULT_CATALOG } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { SCHOOL_DOCS } from '../app/(app)/docs/content';
import { PLATFORM_DOCS } from '../app/(platform)/platform/docs/content';
import { DOC_ARTICLES } from '../app/account/docs/content';
import type { DocArticle, DocLocale } from './docs-types';

const LOCALES: DocLocale[] = ['id', 'en', 'su'];
const MODULES = new Set(DEFAULT_CATALOG.filter((c) => c.kind === 'module').map((c) => c.key));
const appRoot = new URL('../app/', import.meta.url);

/** Halaman ada bila folder rutenya punya page.tsx (rute dinamis seperti /x/[id] tidak dipakai sebagai tautan dokumentasi). */
function pageExists(group: '(app)' | '(platform)/platform', href: string) {
  const path =
    href
      .split('?')[0]
      ?.replace(/^\//, '')
      .replace(/^platform\/?/, '') ?? '';
  const rel =
    group === '(app)' ? `(app)/${path}/page.tsx` : `(platform)/platform/${path ? `${path}/` : ''}page.tsx`;
  // Halaman panel sekolah juga boleh menaut ke halaman publik di luar grup (mis. /kiosk).
  return (
    existsSync(new URL(rel, appRoot)) ||
    (group === '(app)' && existsSync(new URL(`${path}/page.tsx`, appRoot)))
  );
}

const SETS: { name: string; articles: DocArticle[]; group: '(app)' | '(platform)/platform' | null }[] = [
  { name: 'akun', articles: DOC_ARTICLES, group: null },
  { name: 'platform', articles: PLATFORM_DOCS, group: '(platform)/platform' },
  { name: 'sekolah', articles: SCHOOL_DOCS, group: '(app)' },
];

describe.each(SETS)('dokumentasi $name', ({ articles, group }) => {
  it('punya artikel dengan slug unik', () => {
    expect(articles.length).toBeGreaterThan(0);
    const slugs = articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('id, en, su berstruktur sama dan tidak ada teks kosong', () => {
    for (const a of articles) {
      const base = a.text.id;
      for (const loc of LOCALES) {
        const t = a.text[loc];
        expect(t.title.trim(), `${a.slug}/${loc} judul`).not.toBe('');
        expect(t.summary.trim(), `${a.slug}/${loc} ringkasan`).not.toBe('');
        expect(t.sections.length, `${a.slug}/${loc} jumlah section`).toBe(base.sections.length);
        expect(!!t.forWho, `${a.slug}/${loc} untuk siapa`).toBe(!!base.forWho);
        expect(t.faq?.length ?? 0, `${a.slug}/${loc} jumlah tanya-jawab`).toBe(base.faq?.length ?? 0);
        for (const f of t.faq ?? []) {
          expect(f.q.trim() && f.a.trim(), `${a.slug}/${loc} tanya-jawab kosong`).toBeTruthy();
        }
        t.sections.forEach((s, i) => {
          const b = base.sections[i];
          expect(s.heading.trim(), `${a.slug}/${loc}#${i} heading`).not.toBe('');
          expect(s.body.trim(), `${a.slug}/${loc}#${i} isi`).not.toBe('');
          expect(s.steps?.length ?? 0, `${a.slug}/${loc}#${i} langkah`).toBe(b?.steps?.length ?? 0);
          expect(s.href, `${a.slug}/${loc}#${i} href`).toBe(b?.href);
          expect(!!s.tip, `${a.slug}/${loc}#${i} tips`).toBe(!!b?.tip);
          expect(!!s.warning, `${a.slug}/${loc}#${i} perhatian`).toBe(!!b?.warning);
          for (const step of s.steps ?? [])
            expect(step.trim(), `${a.slug}/${loc}#${i} langkah kosong`).not.toBe('');
        });
      }
    }
  });

  it('artikel ditulis untuk pengguna awam: tanpa istilah teknis, ada "untuk siapa" dan tanya-jawab', () => {
    const banned =
      /\b(API|endpoint|webhook|JSON|payload|token|hash|UID|env|\.env|RLS|dry ?run|localhost|enum)\b|[a-z_]+:[a-z_]+/i;
    for (const a of articles) {
      if (group) expect(a.group, `${a.slug} kelompok`).toBeTruthy();
      for (const loc of LOCALES) {
        const t = a.text[loc];
        const all = [t.title, t.summary, t.forWho ?? '']
          .concat(
            t.sections.flatMap((s) => [s.heading, s.body, s.tip ?? '', s.warning ?? '', ...(s.steps ?? [])]),
          )
          .concat((t.faq ?? []).flatMap((f) => [f.q, f.a]))
          .join('\n');
        expect(all.match(banned)?.[0], `${a.slug}/${loc} memuat istilah teknis`).toBeUndefined();
        expect(t.faq?.length ?? 0, `${a.slug}/${loc} butuh tanya-jawab`).toBeGreaterThan(0);
        expect(t.forWho, `${a.slug}/${loc} butuh "untuk siapa"`).toBeTruthy();
      }
    }
  });

  it('modul yang disebut ada di katalog dan tautan halaman benar-benar ada', () => {
    for (const a of articles) {
      if (a.module) expect(MODULES.has(a.module), `${a.slug} modul ${a.module}`).toBe(true);
      if (!group) continue;
      for (const s of a.text.id.sections) {
        if (s.href) expect(pageExists(group, s.href), `${a.slug} href ${s.href}`).toBe(true);
      }
    }
  });
});
