import { SchoolDocsArticle } from '../docs-views';

export default async function SchoolDocPage({ params }: PageProps<'/docs/[slug]'>) {
  const { slug } = await params;
  return <SchoolDocsArticle slug={slug} />;
}
