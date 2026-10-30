import { DetailPage, detailMetadata } from '../../../pages';

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  return detailMetadata('slug', id, slug);
}

export default async function Page({ params }: Props) {
  const { slug, id } = await params;
  return <DetailPage mode="slug" id={id} slug={slug} />;
}
