import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { excerpt } from '@/lib/announcements';
import {
  currentLinks,
  getSiteAnnouncement,
  getSiteAnnouncements,
  getSiteHome,
  hostSlug,
  type PublicCategory,
  type SiteHome,
} from '@/lib/site-public';
import {
  AnnouncementDetailView,
  AnnouncementListView,
  metaDescription,
  SchoolJsonLd,
  SiteHomeView,
  SiteNotice,
  type SiteSections,
  SiteShell,
} from './site-ui';

/** "host": situs dibuka dari host sekolah (/site); "slug": dari host mana pun (/site/<slug>). */
export type SiteMode = 'host' | 'slug';

const PAGE_SIZE = 12;
const CATEGORY_SET = ['news', 'agenda', 'notice'];

const sectionsOf = (d: SiteHome): SiteSections => ({
  news: d.announcements.length > 0,
  agenda: d.agenda.length > 0,
  about: !!(d.profile.about || d.profile.vision || d.profile.mission),
  contact: !!(
    d.profile.address ||
    d.profile.phone ||
    d.profile.email ||
    d.profile.whatsapp ||
    d.profile.mapUrl
  ),
});

/** Slug yang dipakai: dari alamat URL (mode slug) atau dari host permintaan (mode host); null di alamat utama. */
async function resolveSlug(mode: SiteMode, slug?: string) {
  return mode === 'slug' ? (slug ?? null) : hostSlug();
}

async function WrongHost() {
  const t = await getTranslations('site');
  return <SiteNotice title={t('wrongHostTitle')} body={t('wrongHostBody')} />;
}

/* ---------- Beranda ---------- */

export async function homeMetadata(mode: SiteMode, slug?: string): Promise<Metadata> {
  const t = await getTranslations('site');
  const s = await resolveSlug(mode, slug);
  const data = s ? await getSiteHome(s) : null;
  if (!data) return { title: { absolute: t('notFoundTitle') }, robots: { index: false } };
  const description = metaDescription(data, t('metaDescription', { name: data.school.name }));
  const locale = await getLocale();
  return {
    title: { absolute: data.school.name },
    description,
    openGraph: { type: 'website', siteName: data.school.name, title: data.school.name, description, locale },
    twitter: { card: 'summary', title: data.school.name, description },
  };
}

export async function HomePage({ mode, slug }: { mode: SiteMode; slug?: string }) {
  const s = await resolveSlug(mode, slug);
  if (!s) return <WrongHost />;
  const data = await getSiteHome(s);
  if (!data) notFound();
  const links = await currentLinks(data.school.slug, mode);
  return (
    <SiteShell
      name={data.school.name}
      accent={data.profile.accentColor}
      links={links}
      sections={sectionsOf(data)}
    >
      <SchoolJsonLd data={data} url={null} />
      <SiteHomeView data={data} links={links} />
    </SiteShell>
  );
}

/* ---------- Daftar ---------- */

type Search = { category?: string | string[]; page?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const parseSearch = (sp: Search) => {
  const cat = first(sp.category);
  const category = (CATEGORY_SET.includes(cat ?? '') ? cat : '') as PublicCategory | '';
  const page = Math.max(1, Math.min(500, Number.parseInt(first(sp.page) ?? '1', 10) || 1));
  return { category, page };
};

export async function listMetadata(mode: SiteMode, slug?: string): Promise<Metadata> {
  const t = await getTranslations('site');
  const s = await resolveSlug(mode, slug);
  const data = s ? await getSiteHome(s) : null;
  if (!data) return { title: { absolute: t('notFoundTitle') }, robots: { index: false } };
  const title = `${t('metaList')} · ${data.school.name}`;
  const description = t('listSubtitle', { name: data.school.name });
  return {
    title: { absolute: title },
    description,
    openGraph: { type: 'website', siteName: data.school.name, title, description, locale: await getLocale() },
  };
}

export async function ListPage({
  mode,
  slug,
  searchParams,
}: {
  mode: SiteMode;
  slug?: string;
  searchParams: Search;
}) {
  const s = await resolveSlug(mode, slug);
  if (!s) return <WrongHost />;
  const { category, page } = parseSearch(searchParams);
  const [data, list] = await Promise.all([
    getSiteHome(s),
    getSiteAnnouncements(s, category, (page - 1) * PAGE_SIZE),
  ]);
  if (!data || !list) notFound();
  const links = await currentLinks(data.school.slug, mode);
  return (
    <SiteShell
      name={data.school.name}
      accent={data.profile.accentColor}
      links={links}
      sections={sectionsOf(data)}
    >
      <AnnouncementListView
        name={data.school.name}
        links={links}
        items={list.items}
        total={list.total}
        page={page}
        pageSize={PAGE_SIZE}
        category={category}
      />
    </SiteShell>
  );
}

/* ---------- Detail ---------- */

export async function detailMetadata(mode: SiteMode, id: string, slug?: string): Promise<Metadata> {
  const t = await getTranslations('site');
  const s = await resolveSlug(mode, slug);
  const [data, item] = s ? await Promise.all([getSiteHome(s), getSiteAnnouncement(s, id)]) : [null, null];
  if (!data || !item) return { title: { absolute: t('announcementGone') }, robots: { index: false } };
  const description = excerpt(item.body, 155);
  const title = `${item.title} · ${data.school.name}`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: 'article',
      siteName: data.school.name,
      title: item.title,
      description,
      locale: await getLocale(),
      ...(item.publishedAt ? { publishedTime: item.publishedAt } : {}),
    },
    twitter: { card: 'summary', title: item.title, description },
  };
}

export async function DetailPage({ mode, id, slug }: { mode: SiteMode; id: string; slug?: string }) {
  const s = await resolveSlug(mode, slug);
  if (!s) return <WrongHost />;
  const [data, item] = await Promise.all([getSiteHome(s), getSiteAnnouncement(s, id)]);
  if (!data || !item) notFound();
  const links = await currentLinks(data.school.slug, mode);
  return (
    <SiteShell
      name={data.school.name}
      accent={data.profile.accentColor}
      links={links}
      sections={sectionsOf(data)}
    >
      <AnnouncementDetailView item={item} links={links} />
    </SiteShell>
  );
}
