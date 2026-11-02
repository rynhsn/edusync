'use client';

import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { DocsArticle, DocsIndex, type DocsLabels } from '@/components/docs-kit';
import { SCHOOL_DOCS } from './content';

function useLabels(): DocsLabels {
  const t = useTranslations('docs');
  return {
    title: t('title'),
    subtitle: t('schoolSubtitle'),
    allDocs: t('allDocs'),
    notFound: t('notFound'),
    pager: t('pager'),
    openPage: t('openPage'),
    moduleOff: t('moduleOff'),
  };
}

export function SchoolDocsIndex() {
  const { hasModule } = useSchool();
  return <DocsIndex articles={SCHOOL_DOCS} base="/docs" labels={useLabels()} hasModule={hasModule} />;
}

export function SchoolDocsArticle({ slug }: { slug: string }) {
  return <DocsArticle articles={SCHOOL_DOCS} slug={slug} base="/docs" labels={useLabels()} />;
}
