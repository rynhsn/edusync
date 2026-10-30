import { HomePage, homeMetadata } from '../pages';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return homeMetadata('slug', (await params).slug);
}

/** Situs sekolah yang dibuka dari host mana pun lewat /site/<slug>. */
export default async function Page({ params }: Props) {
  return <HomePage mode="slug" slug={(await params).slug} />;
}
