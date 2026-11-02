import { PlatformDocsArticle } from '../docs-views';

export default async function PlatformDocPage({ params }: PageProps<'/platform/docs/[slug]'>) {
  const { slug } = await params;
  return <PlatformDocsArticle slug={slug} />;
}
