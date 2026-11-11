'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Versi rilis aplikasi yang sedang berjalan (dari API), ditaruh di dasar menu samping. */
export function AppVersion({ className }: { className?: string }) {
  const t = useTranslations('shell');
  const version = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => unwrap(await api.GET('/v1/version')),
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!version.data) return null;
  const { version: v, commit } = version.data;
  return (
    <p
      className={cn('text-muted-foreground px-4 pt-2 pb-4 text-xs', className)}
      title={commit ? t('versionCommit', { commit }) : undefined}
    >
      {t('version', { version: v })}
    </p>
  );
}
