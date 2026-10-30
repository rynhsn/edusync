import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BoardView } from './board-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pkl');
  return { title: t('title') };
}

export default function Page() {
  return <BoardView />;
}
