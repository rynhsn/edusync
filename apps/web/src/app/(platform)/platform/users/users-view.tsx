'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SearchBox } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, PersonCell, ToneBadge } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';
import { QueryError, ReasonDialog } from '../platform-kit';

export function UsersView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const searching = q.length >= 2;
  const list = useQuery({
    queryKey: ['platform-users', q],
    enabled: searching,
    placeholderData: keepPreviousData,
    queryFn: async () => unwrap(await api.GET('/v1/platform/users', { params: { query: { q } } })),
  });

  const revoke = useMutation({
    mutationFn: async (v: { id: string; reason: string }) =>
      unwrap(
        await api.POST('/v1/platform/users/{id}/revoke-sessions', {
          params: { path: { id: v.id } },
          body: { reason: v.reason },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('usersRevoked', { count: r.revoked }));
      setError(null);
      setActing(null);
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-audit'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader icon={Users} tone="amber" title={t('users')} description={t('usersSubtitle')} />
      <SearchBox value={input} onChange={setInput} placeholder={t('usersSearch')} className="sm:w-96" />

      {!searching && (
        <EmptyPanel icon={Search} tone="slate" title={t('usersStart')} body={t('usersStartHint')} />
      )}
      {searching && list.isPending && <Skeleton className="h-32 w-full rounded-2xl" />}
      {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}
      {searching && list.data?.length === 0 && (
        <EmptyPanel icon={Users} tone="slate" title={t('usersEmpty')} body={t('usersEmptyHint')} />
      )}
      {searching && list.data && list.data.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.data.map((u) => (
            <li key={u.id} className="bg-card grid gap-3 rounded-2xl border p-4">
              <PersonCell name={u.name} sub={u.email} />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <ToneBadge tone="sky">{t('usersSchools', { count: u.schools })}</ToneBadge>
                <ToneBadge tone={u.activeSessions > 0 ? 'emerald' : 'slate'}>
                  {t('usersDevices', { count: u.activeSessions })}
                </ToneBadge>
                {u.isStaff && <ToneBadge tone="violet">{t('usersStaff')}</ToneBadge>}
              </div>
              {role === 'admin' && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={u.activeSessions === 0}
                    onClick={() => {
                      setError(null);
                      setActing({ id: u.id, name: u.name });
                    }}
                  >
                    <LogOut /> {t('usersRevoke')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {role === 'read_only' && <p className="text-muted-foreground text-sm">{t('readOnly')}</p>}

      <ReasonDialog
        open={!!acting}
        onOpenChange={(next) => !next && setActing(null)}
        title={acting ? t('usersRevokeTitle', { name: acting.name }) : ''}
        description={t('usersRevokeHelp')}
        submitLabel={t('usersRevoke')}
        error={error}
        onConfirm={(reason) => (acting ? revoke.mutateAsync({ id: acting.id, reason }) : Promise.resolve())}
      />
    </PageBody>
  );
}
