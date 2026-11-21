import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RoomsView } from './rooms-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exams');
  return { title: t('roomsTitle') };
}

export default function Page() {
  return <RoomsView />;
}
