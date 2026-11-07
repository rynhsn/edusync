'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  CalendarRange,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  History,
  Layers,
  Lightbulb,
  ListTree,
  Lock,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Package,
  Rocket,
  ScanLine,
  School,
  Send,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Trophy,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '@/components/back-link';
import { SearchBox } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { EmptyPanel, IconTile, ToneBadge } from '@/components/ui-kit';
import type { DocArticle, DocGroup, DocIcon, DocLocale, DocText } from '@/lib/docs-types';
import { cn } from '@/lib/utils';

const ICONS: Record<DocIcon, LucideIcon> = {
  rocket: Rocket,
  users: Users,
  scan: ScanLine,
  graduation: GraduationCap,
  wallet: Wallet,
  clipboard: ClipboardList,
  message: MessageCircle,
  shield: ShieldCheck,
  credit: CreditCard,
  lock: Lock,
  building: Building2,
  package: Package,
  history: History,
  globe: Globe,
  file: FileText,
  megaphone: Megaphone,
  briefcase: Briefcase,
  trophy: Trophy,
  calendar: CalendarRange,
  book: BookOpen,
  settings: Settings,
  send: Send,
  layers: Layers,
  school: School,
};

const GROUP_ORDER: (DocGroup | 'other')[] = [
  'master',
  'attendance',
  'academic',
  'finance',
  'services',
  'access',
  'ops',
  'config',
  'watch',
  'start',
  'school_ops',
  'billing',
  'safety',
  'other',
];

/** Teks tetap halaman dokumentasi; diberikan pemanggil agar tiap area (akun, platform, sekolah) memakai namespace i18n-nya. */
export interface DocsLabels {
  title: string;
  subtitle: string;
  allDocs: string;
  notFound: string;
  pager: string;
  openPage: string;
  moduleOff: string;
}

interface Props {
  articles: DocArticle[];
  /** Awalan alamat halaman dokumentasi, mis. `/docs` atau `/platform/docs`. */
  base: string;
  labels: DocsLabels;
  /** Mengembalikan false bila modul sekolah tidak aktif; tanpa fungsi ini tanda "modul belum aktif" tidak ditampilkan. */
  hasModule?: (key: string) => boolean;
}

/** Seluruh teks artikel dalam satu string huruf kecil, untuk pencarian. */
function haystack(text: DocText) {
  return [
    text.title,
    text.summary,
    text.forWho ?? '',
    ...text.sections.flatMap((s) => [s.heading, s.body, ...(s.steps ?? []), s.tip ?? '', s.warning ?? '']),
    ...(text.faq ?? []).flatMap((f) => [f.q, f.a]),
  ]
    .join(' ')
    .toLowerCase();
}

function ArticleCard({
  article,
  base,
  locale,
  labels,
  hasModule,
  index,
}: {
  article: DocArticle;
  base: string;
  locale: DocLocale;
  labels: DocsLabels;
  hasModule?: (key: string) => boolean;
  index: number;
}) {
  const text = article.text[locale];
  return (
    <Link
      href={`${base}/${article.slug}`}
      className="bg-card hover:border-primary/40 group flex items-start gap-3.5 rounded-2xl border p-4 transition-all hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms`, animationFillMode: 'backwards' }}
    >
      <IconTile icon={ICONS[article.icon]} tone={article.tone} />
      <span className="min-w-0 flex-1">
        <span className="font-heading flex flex-wrap items-center gap-2 font-semibold">
          {text.title}
          {hasModule && article.module && !hasModule(article.module) && (
            <ToneBadge tone="slate" dot={false}>
              {labels.moduleOff}
            </ToneBadge>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 line-clamp-3 block text-sm">{text.summary}</span>
      </span>
      <ArrowRight
        className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}

/** Kelompokkan artikel menurut grup, berurutan menurut GROUP_ORDER. */
function groupArticles(list: DocArticle[]) {
  const order: (DocGroup | 'other')[] = [];
  for (const a of list) {
    const g = a.group ?? 'other';
    if (!order.includes(g)) order.push(g);
  }
  order.sort((x, y) => GROUP_ORDER.indexOf(x) - GROUP_ORDER.indexOf(y));
  return order.map((g) => ({ key: g, items: list.filter((a) => (a.group ?? 'other') === g) }));
}

/** Kisi kartu indeks: 1 kolom di ponsel, 2 di layar sedang, 3 di layar lebar. */
const CARD_GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';

export function DocsIndex({ articles, base, labels, hasModule }: Props) {
  const t = useTranslations('docs');
  const locale = useLocale() as DocLocale;
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const found = useMemo(
    () => (query ? articles.filter((a) => haystack(a.text[locale]).includes(query)) : articles),
    [articles, locale, query],
  );
  const grouped = !query && articles.some((a) => a.group);
  const groups = useMemo(() => groupArticles(found), [found]);

  return (
    <PageBody>
      <PageHeader
        icon={BookOpen}
        tone="violet"
        title={labels.title}
        description={labels.subtitle}
        actions={<SearchBox value={q} onChange={setQ} placeholder={t('searchPlaceholder')} />}
      />
      {found.length === 0 && (
        <EmptyPanel
          icon={BookOpen}
          tone="slate"
          title={t('noResults')}
          body={t('noResultsBody')}
          action={
            <Button variant="outline" onClick={() => setQ('')}>
              {t('clearSearch')}
            </Button>
          }
        />
      )}
      {grouped ? (
        <div className="grid gap-8">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`docs-group-${g.key}`} className="grid gap-3">
              <h2
                id={`docs-group-${g.key}`}
                className="font-heading text-muted-foreground text-sm font-semibold"
              >
                {g.key === 'other' ? t('groups.other') : t(`groups.${g.key}`)}
              </h2>
              <div className={CARD_GRID}>
                {g.items.map((a, i) => (
                  <ArticleCard
                    key={a.slug}
                    article={a}
                    base={base}
                    locale={locale}
                    labels={labels}
                    hasModule={hasModule}
                    index={i}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {found.map((a, i) => (
            <ArticleCard
              key={a.slug}
              article={a}
              base={base}
              locale={locale}
              labels={labels}
              hasModule={hasModule}
              index={i}
            />
          ))}
        </div>
      )}
    </PageBody>
  );
}

/** Bagian yang sedang terlihat di layar, untuk menyorot daftar isi. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` mewakili isi `ids`
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [key]);
  return [active, setActive] as const;
}

/** Lompat ke bagian artikel: halus kecuali pengguna meminta gerak dikurangi; tetap berfungsi tanpa JavaScript lewat href. */
function jumpTo(event: React.MouseEvent<HTMLAnchorElement>, id: string, onJump: (id: string) => void) {
  const el = document.getElementById(id);
  if (!el) return;
  event.preventDefault();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
  try {
    window.history.replaceState(null, '', `#${id}`);
  } catch {
    // Riwayat tidak bisa diubah (mis. iframe terbatas); lompat tetap berjalan.
  }
  onJump(id);
}

function Callout({ kind, children }: { kind: 'tip' | 'warning'; children: React.ReactNode }) {
  const t = useTranslations('docs');
  const warn = kind === 'warning';
  const Icon = warn ? TriangleAlert : Lightbulb;
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3.5 text-sm',
        warn
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
          : 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        <strong className="font-semibold">{warn ? t('warning') : t('tip')}: </strong>
        {children}
      </p>
    </div>
  );
}

export function DocsArticle({ articles, slug, base, labels }: Props & { slug: string }) {
  const t = useTranslations('docs');
  const locale = useLocale() as DocLocale;
  const index = articles.findIndex((a) => a.slug === slug);
  const article = articles[index];
  const text = article?.text[locale];
  const ids = useMemo(
    () => [...(text?.sections ?? []).map((_, i) => `s-${i}`), ...(text?.faq?.length ? ['faq'] : [])],
    [text],
  );
  const [active, setActive] = useActiveSection(ids);

  if (!article || !text) {
    return (
      <PageBody>
        <PageHeader icon={BookOpen} tone="violet" title={labels.title} actions={<BackLink href={base} />} />
        <EmptyPanel icon={BookOpen} tone="slate" title={labels.notFound} />
      </PageBody>
    );
  }
  const prev = articles[index - 1];
  const next = articles[index + 1];
  const toc = [
    ...text.sections.map((s, i) => ({ id: `s-${i}`, label: s.heading })),
    ...(text.faq?.length ? [{ id: 'faq', label: t('faqTitle') }] : []),
  ];

  return (
    <PageBody>
      <PageHeader
        icon={ICONS[article.icon]}
        tone={article.tone}
        title={text.title}
        description={text.summary}
        actions={<BackLink href={base} label={labels.allDocs} />}
      />
      {text.forWho && (
        <p className="text-muted-foreground -mt-2 flex max-w-[46rem] items-center gap-2 text-sm">
          <UserRound className="size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-foreground font-medium">{t('forWho')}:</strong> {text.forWho}
          </span>
        </p>
      )}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,46rem)_15rem] xl:justify-center 2xl:grid-cols-[15rem_minmax(0,46rem)_15rem]">
        <aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto 2xl:block">
          <nav aria-label={labels.allDocs}>
            <p className="font-heading text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <BookOpen className="size-3.5" aria-hidden /> {labels.allDocs}
            </p>
            <div className="grid gap-4 pr-1">
              {groupArticles(articles).map((g) => (
                <div key={g.key} className="grid gap-0.5">
                  {articles.some((a) => a.group) && (
                    <p className="text-muted-foreground px-2 pb-0.5 text-[11px] font-semibold">
                      {g.key === 'other' ? t('groups.other') : t(`groups.${g.key}`)}
                    </p>
                  )}
                  {g.items.map((a) => (
                    <Link
                      key={a.slug}
                      href={`${base}/${a.slug}`}
                      aria-current={a.slug === slug ? 'page' : undefined}
                      className={cn(
                        'block rounded-lg px-2 py-1.5 text-sm transition-colors',
                        a.slug === slug
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {a.text[locale].title}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="grid min-w-0 gap-6">
          <nav aria-label={t('onThisPage')} className="bg-card rounded-2xl border p-4 xl:hidden">
            <p className="font-heading mb-2 flex items-center gap-2 text-sm font-semibold">
              <ListTree className="size-4" aria-hidden /> {t('onThisPage')}
            </p>
            <ol className="grid content-start gap-1 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => jumpTo(e, item.id, setActive)}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="grid gap-5">
            {text.sections.map((s, i) => (
              <section
                key={s.heading}
                id={`s-${i}`}
                tabIndex={-1}
                className="bg-card grid scroll-mt-20 outline-none gap-3.5 rounded-2xl border p-5"
              >
                <h2 className="font-heading flex items-center gap-2.5 text-lg font-semibold">
                  <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  {s.heading}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
                {s.steps && (
                  <ol className="relative grid gap-3 text-sm">
                    {s.steps.map((step, n) => (
                      <li key={step} className="relative flex gap-3">
                        {n < (s.steps?.length ?? 0) - 1 && (
                          <span
                            aria-hidden
                            className="bg-border absolute top-6 bottom-[-0.75rem] left-[0.6rem] w-px"
                          />
                        )}
                        <span className="bg-primary text-primary-foreground relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums">
                          {n + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {s.tip && <Callout kind="tip">{s.tip}</Callout>}
                {s.warning && <Callout kind="warning">{s.warning}</Callout>}
                {s.href && (
                  <div>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={s.href} />}>
                      <ExternalLink className="size-3.5" aria-hidden /> {labels.openPage}
                    </Button>
                  </div>
                )}
              </section>
            ))}

            {text.faq && text.faq.length > 0 && (
              <section
                id="faq"
                tabIndex={-1}
                className="bg-card grid scroll-mt-20 outline-none gap-4 rounded-2xl border p-5"
              >
                <h2 className="font-heading text-lg font-semibold">{t('faqTitle')}</h2>
                <dl className="grid gap-4">
                  {text.faq.map((f) => (
                    <div key={f.q} className="grid content-start gap-1">
                      <dt className="text-sm font-medium">{f.q}</dt>
                      <dd className="text-muted-foreground text-sm leading-relaxed">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </article>

          <nav aria-label={labels.pager} className="grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`${base}/${prev.slug}`}
                className="hover:bg-muted flex items-center gap-2 rounded-xl border p-3 text-sm"
              >
                <ArrowLeft className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{prev.text[locale].title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={`${base}/${next.slug}`}
                className="hover:bg-muted flex items-center justify-end gap-2 rounded-xl border p-3 text-sm"
              >
                <span className="truncate">{next.text[locale].title}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            )}
          </nav>
        </div>

        <aside className="sticky top-20 hidden xl:block">
          <nav aria-label={t('onThisPage')}>
            <p className="font-heading text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <ListTree className="size-3.5" aria-hidden /> {t('onThisPage')}
            </p>
            <ol className="border-border grid gap-0.5 border-l text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => jumpTo(e, item.id, setActive)}
                    aria-current={active === item.id ? 'true' : undefined}
                    className={cn(
                      '-ml-px block border-l py-1 pl-3 transition-colors',
                      active === item.id
                        ? 'border-primary text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </PageBody>
  );
}
