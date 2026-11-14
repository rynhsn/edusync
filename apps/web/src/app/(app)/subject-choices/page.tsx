import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { SubjectChoicesView } from './subject-choices-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('subjectChoices');
  return { title: t('title') };
}

export default function SubjectChoicesPage() {
  return (
    <Suspense>
      <SubjectChoicesView />
    </Suspense>
  );
}
