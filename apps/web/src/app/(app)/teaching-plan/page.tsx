import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeachingPlanView } from './teaching-plan-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teachingPlan');
  return { title: t('title') };
}

export default function TeachingPlanPage() {
  return <TeachingPlanView />;
}
