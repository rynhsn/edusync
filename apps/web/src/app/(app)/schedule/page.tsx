import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScheduleView } from './schedule-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('schedule');
  return { title: t('title') };
}

export default function SchedulePage() {
  return <ScheduleView />;
}
