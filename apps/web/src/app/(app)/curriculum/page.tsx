import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CurriculumView } from './curriculum-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('curriculum');
  return { title: t('title') };
}

export default function CurriculumPage() {
  return (
    <Suspense>
      <CurriculumView />
    </Suspense>
  );
}
