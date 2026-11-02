'use client';

import { useTranslations } from 'next-intl';
import { DocsArticle, DocsIndex, type DocsLabels } from '@/components/docs-kit';
import { DOC_ARTICLES } from './content';

function useLabels(): DocsLabels {
  const t = useTranslations('account');
  return {
    title: t('nav.docs'),
    subtitle: t('docsSubtitle'),
    allDocs: t('allDocs'),
    notFound: t('docNotFound'),
    pager: t('docsPager'),
    openPage: t('docsOpenPage'),
    moduleOff: t('docsModuleOff'),
  };
}

export function DocsIndexView() {
  return <DocsIndex articles={DOC_ARTICLES} base="/account/docs" labels={useLabels()} />;
}

export function DocArticleView({ slug }: { slug: string }) {
  return <DocsArticle articles={DOC_ARTICLES} slug={slug} base="/account/docs" labels={useLabels()} />;
}
