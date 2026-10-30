import { getTranslations } from 'next-intl/server';
import { SiteNotice } from './site-ui';

export default async function SiteNotFound() {
  const t = await getTranslations('site');
  return <SiteNotice title={t('notFoundTitle')} body={t('notFoundBody')} />;
}
