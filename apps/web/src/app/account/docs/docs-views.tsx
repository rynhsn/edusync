'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Lock,
  type LucideIcon,
  MessageCircle,
  Rocket,
  ScanLine,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { EmptyPanel, IconTile } from '@/components/ui-kit';
import type { DocLocale } from './content';
import { DOC_ARTICLES, type DocIcon } from './content';

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
};

export function DocsIndexView() {
  const t = useTranslations('account');
  const locale = useLocale() as DocLocale;
  return (
    <PageBody>
      <PageHeader icon={BookOpen} tone="violet" title={t('nav.docs')} description={t('docsSubtitle')} />
      <div className="grid gap-3 sm:grid-cols-2">
        {DOC_ARTICLES.map((a, i) => (
          <Link
            key={a.slug}
            href={`/account/docs/${a.slug}`}
            className="bg-card hover:border-primary/40 group flex items-start gap-3.5 rounded-2xl border p-4 transition-all hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}
          >
            <IconTile icon={ICONS[a.icon]} tone={a.tone} />
            <span className="min-w-0 flex-1">
              <span className="font-heading block font-semibold">{a.text[locale].title}</span>
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

export function DocArticleView({ slug }: { slug: string }) {
  const t = useTranslations('account');
  const locale = useLocale() as DocLocale;
  const index = DOC_ARTICLES.findIndex((a) => a.slug === slug);
  const article = DOC_ARTICLES[index];

  if (!article) {
    return (
      <PageBody>
        <PageHeader
          icon={BookOpen}
          tone="violet"
          title={t('nav.docs')}
          actions={<BackLink href="/account/docs" />}
        />
        <EmptyPanel icon={BookOpen} tone="slate" title={t('docNotFound')} />
      </PageBody>
    );
  }
  const text = article.text[locale];
  const prev = DOC_ARTICLES[index - 1];
  const next = DOC_ARTICLES[index + 1];

  return (
    <PageBody>
      <PageHeader
        icon={ICONS[article.icon]}
        tone={article.tone}
        title={text.title}
        description={text.summary}
        actions={<BackLink href="/account/docs" label={t('allDocs')} />}
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
          </section>
        ))}
      </article>
      <nav aria-label={t('docsPager')} className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/account/docs/${prev.slug}`}
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
            href={`/account/docs/${next.slug}`}
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
