'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

export function AuditView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const format = useFormatter();

  const list = useQuery({
    queryKey: ['platform-audit'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/audit', { params: { query: { limit: 100 } } })),
  });

  return (
    <div className="grid gap-4">
      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('auditEmpty')}</p>}
      {list.data && list.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">{t('time')}</th>
                <th className="px-4 py-2 font-medium">{t('action')}</th>
                <th className="px-4 py-2 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.data.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                    {format.dateTime(new Date(a.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs break-all">
                    {JSON.stringify(a.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
