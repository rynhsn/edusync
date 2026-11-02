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
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { EmptyPanel, IconTile, ToneBadge } from '@/components/ui-kit';
import type { DocArticle, DocIcon, DocLocale } from '@/lib/docs-types';

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

export function DocsIndex({ articles, base, labels, hasModule }: Props) {
  const locale = useLocale() as DocLocale;
  return (
    <PageBody>
      <PageHeader icon={BookOpen} tone="violet" title={labels.title} description={labels.subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((a, i) => (
          <Link
            key={a.slug}
            href={`${base}/${a.slug}`}
            className="bg-card hover:border-primary/40 group flex items-start gap-3.5 rounded-2xl border p-4 transition-all hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: 'backwards' }}
          >
            <IconTile icon={ICONS[a.icon]} tone={a.tone} />
            <span className="min-w-0 flex-1">
              <span className="font-heading flex flex-wrap items-center gap-2 font-semibold">
                {a.text[locale].title}
                {hasModule && a.module && !hasModule(a.module) && (
                  <ToneBadge tone="slate" dot={false}>
                    {labels.moduleOff}
                  </ToneBadge>
                )}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-sm">{a.text[locale].summary}</span>
            </span>
            <ArrowRight
              className="text-muted-foreground mt-1 size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </PageBody>
  );
}

export function DocsArticle({ articles, slug, base, labels }: Props & { slug: string }) {
  const locale = useLocale() as DocLocale;
  const index = articles.findIndex((a) => a.slug === slug);
  const article = articles[index];

  if (!article) {
    return (
      <PageBody>
        <PageHeader icon={BookOpen} tone="violet" title={labels.title} actions={<BackLink href={base} />} />
        <EmptyPanel icon={BookOpen} tone="slate" title={labels.notFound} />
      </PageBody>
    );
  }
  const text = article.text[locale];
  const prev = articles[index - 1];
  const next = articles[index + 1];

  return (
    <PageBody>
      <PageHeader
        icon={ICONS[article.icon]}
        tone={article.tone}
        title={text.title}
        description={text.summary}
        actions={<BackLink href={base} label={labels.allDocs} />}
      />
      <article className="grid max-w-3xl gap-6">
        {text.sections.map((s, i) => (
          <section key={s.heading} className="bg-card grid gap-3 rounded-2xl border p-5">
            <h2 className="font-heading flex items-center gap-2.5 text-lg font-semibold">
              <span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              {s.heading}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
            {s.steps && (
              <ol className="grid gap-2 text-sm">
                {s.steps.map((step, n) => (
                  <li key={step} className="flex gap-3">
                    <span className="bg-muted text-muted-foreground mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-medium tabular-nums">
                      {n + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
            {s.href && (
              <div>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={s.href} />}>
                  <ExternalLink className="size-3.5" aria-hidden /> {labels.openPage}
                </Button>
              </div>
            )}
          </section>
        ))}
      </article>
      <nav aria-label={labels.pager} className="grid max-w-3xl gap-3 sm:grid-cols-2">
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
    </PageBody>
  );
}
