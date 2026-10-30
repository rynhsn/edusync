import { ListPage, listMetadata } from '../pages';

export const generateMetadata = () => listMetadata('host');

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  return <ListPage mode="host" searchParams={await searchParams} />;
}
