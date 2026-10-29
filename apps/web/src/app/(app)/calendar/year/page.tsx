import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { YearView } from './year-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calendar');
  return { title: t('yearTitle') };
}

export default function CalendarYearPage() {
  return <YearView />;
}
