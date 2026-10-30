import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ChildView } from './child-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portal');
  return { title: t('title') };
}

export default async function ChildPage({ params }: PageProps<'/portal/children/[studentId]'>) {
  const { studentId } = await params;
  return (
    <Suspense>
      <ChildView studentId={studentId} />
    </Suspense>
  );
}
