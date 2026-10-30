'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CardsSkeleton, EmptyState } from '../../ui-bits';

/** Keadaan muat/galat seragam untuk tab rincian anak. Mengembalikan null bila data siap. */
export function TabState({
  query,
  available = true,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  /** false bila modul sekolah untuk bagian ini tidak aktif. */
  available?: boolean;
}) {
  const t = useTranslations('portal');
  if (query.isPending) return <CardsSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        title={t('loadErrorTitle')}
        body={t('loadErrorBody')}
        action={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (!available) return <EmptyState title={t('unavailableTitle')} body={t('unavailableBody')} />;
  return null;
}
