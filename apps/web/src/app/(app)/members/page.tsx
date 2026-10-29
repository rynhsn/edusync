import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MembersView } from './members-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members');
  return { title: t('title') };
}

export default function MembersPage() {
  return <MembersView />;
}
