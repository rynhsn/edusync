import { ListPage, listMetadata } from '../../pages';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export async function generateMetadata({ params }: Props) {
  return listMetadata('slug', (await params).slug);
}

export default async function Page({ params, searchParams }: Props) {
  return <ListPage mode="slug" slug={(await params).slug} searchParams={await searchParams} />;
}
