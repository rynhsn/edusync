import { DetailPage, detailMetadata } from '../../pages';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  return detailMetadata('host', (await params).id);
}

export default async function Page({ params }: Props) {
  return <DetailPage mode="host" id={(await params).id} />;
}
