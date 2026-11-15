'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useMessagingCtx } from './shared';

const LIMIT = 100;

/** Tab "Opt-out siaran": staf menandai wali yang menolak siaran pengumuman (izin message:manage). */
export function OptOutPanel() {
  const t = useTranslations('messaging.optout');
  const tm = useTranslations('messaging');
  const te = useTranslations();
  const { school, header, canSend } = useMessagingCtx();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const key = ['messaging-optouts', school.schoolId];

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/messaging/opt-outs', { params: { ...header, query: { limit: LIMIT } } })),
  });
  const found = useQuery({
    queryKey: ['messaging-guardian-search', school.schoolId, deferred],
    enabled: canSend && deferred.length >= 2,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/messaging/recipients/search', {
          params: { ...header, query: { kind: 'guardian', q: deferred } },
        }),
      ),
  });
  const add = useMutation({
    mutationFn: async (guardianId: string) =>
      unwrap(await api.PUT('/v1/messaging/opt-outs', { params: header, body: { guardianId } })),
    onSuccess: () => {
      toast.success(t('added'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/messaging/opt-outs/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('removed'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const data = list.data;
  return (
    <div className="grid gap-4">
      <Alert>
        <AlertDescription>{t('intro')}</AlertDescription>
      </Alert>

      <Card className="grid gap-3 p-4 sm:p-5">
        <h3 className="font-medium">{t('title')}</h3>
        {canSend ? (
          <div className="grid gap-2">
            <Label htmlFor="optout-search">{t('searchLabel')}</Label>
            <Input
              id="optout-search"
              className={TOUCH_INPUT}
              value={q}
              autoComplete="off"
              onChange={(e) => setQ(e.target.value)}
            />
            {found.data?.length === 0 && deferred.length >= 2 && (
              <p className="text-muted-foreground text-sm">{t('noResults')}</p>
            )}
            <ul className="grid gap-1.5">
              {found.data?.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">
                    {g.label} {g.hint && <span className="text-muted-foreground text-xs">({g.hint})</span>}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 md:min-h-8"
                    disabled={add.isPending}
                    onClick={() => add.mutate(g.id)}
                  >
                    {t('add')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('needSend')}</p>
        )}
      </Card>

      <Card className="grid gap-3 p-4 sm:p-5" aria-live="polite">
        <h3 className="font-medium">{t('listTitle', { total: data?.total ?? 0 })}</h3>
        {list.isPending && <Skeleton className="h-24 w-full" />}
        {list.isError && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
          </Alert>
        )}
        {data?.items.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colGuardian')}</TableHead>
                  <TableHead>{tm('colPhone')}</TableHead>
                  <TableHead>{t('colSince')}</TableHead>
                  <TableHead>{t('colBy')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.guardianName ?? t('guardianDeleted')}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{r.phone}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.createdBy ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 md:min-h-8"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(r.id)}
                      >
                        {t('remove')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data && data.total > data.items.length && (
          <p className="text-muted-foreground text-xs">
            {t('shown', { shown: data.items.length, total: data.total })}
          </p>
        )}
      </Card>
    </div>
  );
}
