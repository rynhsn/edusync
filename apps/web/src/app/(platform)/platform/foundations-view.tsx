'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { useStaff } from '../platform-shell';
import { ReasonForm } from './reason-form';

const STATUS_KEY = {
  active: 'statusActive',
  past_due: 'statusPastDue',
  suspended: 'statusSuspended',
  canceled: 'statusCanceled',
  pending_payment: 'statusPending',
} as const;

const STATUS_TONE: Record<keyof typeof STATUS_KEY, 'secondary' | 'outline' | 'destructive'> = {
  active: 'secondary',
  past_due: 'outline',
  suspended: 'destructive',
  canceled: 'outline',
  pending_payment: 'outline',
};

export function FoundationsView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [acting, setActing] = useState<{ schoolId: string; action: 'suspend' | 'reactivate' } | null>(null);

  const list = useQuery({
    queryKey: ['platform-foundations', q],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/platform/foundations', { params: { query: q.trim() ? { q: q.trim() } : {} } }),
      ),
  });

  const change = useMutation({
    mutationFn: async (v: { schoolId: string; action: 'suspend' | 'reactivate'; reason: string }) =>
      unwrap(
        v.action === 'suspend'
          ? await api.POST('/v1/platform/schools/{id}/suspend', {
              params: { path: { id: v.schoolId } },
              body: { reason: v.reason },
            })
          : await api.POST('/v1/platform/schools/{id}/reactivate', {
              params: { path: { id: v.schoolId } },
              body: { reason: v.reason },
            }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      setActing(null);
      queryClient.invalidateQueries({ queryKey: ['platform-foundations'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader title={t('foundations')} />
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="q" className="sr-only">
          {t('search')}
        </Label>
        <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} />
      </div>
      {role === 'read_only' && <p className="text-muted-foreground text-sm">{t('readOnly')}</p>}

      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}

      <div className="grid gap-4">
        {list.data?.map((f) => (
          <Card key={f.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-lg">{f.name}</CardTitle>
                <p className="text-muted-foreground font-mono text-xs">{f.slug}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {f.subscription ? (
                  <>
                    <Badge variant={STATUS_TONE[f.subscription.status]}>
                      {t(STATUS_KEY[f.subscription.status])}
                    </Badge>
                    <span className="text-muted-foreground">
                      {t('periodEnd', {
                        date: formatCalendarDate(locale, f.subscription.currentPeriodEnd.slice(0, 10)),
                      })}
                    </span>
                  </>
                ) : (
                  <Badge variant="outline">{t('noSubscription')}</Badge>
                )}
                {f.openInvoices > 0 && (
                  <Badge variant="outline">{t('openInvoices', { count: f.openInvoices })}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-2 text-xs">
                {t('unitsCount', { count: f.schools.length })}
              </p>
              <ul className="divide-y">
                {f.schools.map((s) => {
                  const open = acting?.schoolId === s.id;
                  return (
                    <li key={s.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium">{s.name}</span>{' '}
                          <span className="text-muted-foreground font-mono text-xs">{s.slug}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.status === 'active' ? 'secondary' : 'destructive'}>
                            {s.status === 'active' ? t('unitActive') : t('unitSuspended')}
                            {s.suspendedReason === 'billing' && ` · ${t('byBilling')}`}
                            {s.suspendedReason === 'staff' && ` · ${t('byStaff')}`}
                          </Badge>
                          {role === 'admin' && !open && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setActing({
                                  schoolId: s.id,
                                  action: s.status === 'active' ? 'suspend' : 'reactivate',
                                })
                              }
                            >
                              {s.status === 'active' ? t('suspend') : t('reactivate')}
                            </Button>
                          )}
                        </div>
                      </div>
                      {open && acting && (
                        <ReasonForm
                          id={`reason-${s.id}`}
                          pending={change.isPending}
                          confirmLabel={t('confirm')}
                          onCancel={() => setActing(null)}
                          onConfirm={(reason) =>
                            change.mutate({ schoolId: s.id, action: acting.action, reason })
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageBody>
  );
}
