'use client';

import { useTranslations } from 'next-intl';
import { DocsArticle, DocsIndex, type DocsLabels } from '@/components/docs-kit';
import { PLATFORM_DOCS } from './content';

function useLabels(): DocsLabels {
  const t = useTranslations('docs');
  return {
    title: t('title'),
    subtitle: t('platformSubtitle'),
    allDocs: t('allDocs'),
    notFound: t('notFound'),
    pager: t('pager'),
    openPage: t('openPage'),
    moduleOff: t('moduleOff'),
  };
}

export function PlatformDocsIndex() {
  return <DocsIndex articles={PLATFORM_DOCS} base="/platform/docs" labels={useLabels()} />;
}

export function PlatformDocsArticle({ slug }: { slug: string }) {
  return <DocsArticle articles={PLATFORM_DOCS} slug={slug} base="/platform/docs" labels={useLabels()} />;
}
