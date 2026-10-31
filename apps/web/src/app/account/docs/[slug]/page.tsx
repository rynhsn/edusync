import { DocArticleView } from '../docs-views';

export default async function DocArticlePage({ params }: PageProps<'/account/docs/[slug]'>) {
  const { slug } = await params;
  return <DocArticleView slug={slug} />;
}
