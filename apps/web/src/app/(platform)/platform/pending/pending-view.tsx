'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { useStaff } from '../../platform-shell';
import { ReasonForm } from '../reason-form';

export function PendingView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['platform-pending'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/registrations/pending')),
  });

  const activate = useMutation({
    mutationFn: async (v: { id: string; reason: string }) =>
      unwrap(
        await api.POST('/v1/platform/registrations/{id}/complimentary', {
          params: { path: { id: v.id } },
          body: { reason: v.reason },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      setActing(null);
      queryClient.invalidateQueries({ queryKey: ['platform-pending'] });
      queryClient.invalidateQueries({ queryKey: ['platform-foundations'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader title={t('pending')} />
      {list.isPending && <Skeleton className="h-24 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('pendingEmpty')}</p>}
      {list.data?.map((r) => (
        <Card key={r.id}>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{r.foundationName}</p>
                <p className="text-muted-foreground text-xs">
                  {t('unitsCount', { count: r.units })} ·{' '}
                  {t('expires', { date: formatCalendarDate(locale, r.expiresAt.slice(0, 10)) })}
                </p>
              </div>
              {role === 'admin' && acting !== r.id && (
                <Button size="sm" variant="outline" onClick={() => setActing(r.id)}>
                  {t('complimentary')}
                </Button>
              )}
            </div>
            {acting === r.id && (
              <>
                <p className="text-muted-foreground mt-2 text-xs">{t('complimentaryHelp')}</p>
                <ReasonForm
                  id={`comp-${r.id}`}
                  pending={activate.isPending}
                  confirmLabel={t('confirm')}
                  onCancel={() => setActing(null)}
                  onConfirm={(reason) => activate.mutate({ id: r.id, reason })}
                />
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </PageBody>
  );
}
