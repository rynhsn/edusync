import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TemplateEditor } from '../editor/template-editor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cards');
  return { title: t('editor.title') };
}

export default async function Page({ searchParams }: PageProps<'/cards/new'>) {
  const { kind } = await searchParams;
  return <TemplateEditor kind={kind === 'exam' ? 'exam' : 'student'} />;
}
