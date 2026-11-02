'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Globe, Info, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, type Tone, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { paths } from '@/lib/api-types';
import { errorKey } from '@/lib/errors';

const MAX_DOMAINS = 3;

type DomainItem = paths['/v1/school/domains']['get']['responses'][200]['content']['application/json'][number];
type DnsCheck = {
  kind: 'txt' | 'cname';
  name: string;
  ok: boolean;
  expected: string;
  found: string[];
};

const STATUS_TONE: Record<DomainItem['status'], Tone> = {
  pending: 'amber',
  verified: 'emerald',
  failed: 'rose',
};

function CopyButton({ value }: { value: string }) {
  const t = useTranslations('siteDomains');
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(t('copied'));
      setTimeout(() => setDone(false), 2000);
    } catch {
      // Clipboard tidak tersedia (konteks tidak aman); nilai tetap bisa disalin manual.
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={t('copy')} onClick={copy}>
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </Button>
  );
}

function DomainCard({
  domain,
  checks,
  onVerify,
  verifying,
  onDelete,
}: {
  domain: DomainItem;
  checks: DnsCheck[] | undefined;
  onVerify: () => void;
  verifying: boolean;
  onDelete: () => Promise<unknown>;
}) {
  const t = useTranslations('siteDomains');
  const locale = useLocale();
  const verified = domain.status === 'verified';
  const label = { pending: t('statusPending'), verified: t('statusVerified'), failed: t('statusFailed') }[
    domain.status
  ];
  const checkedAt = domain.lastCheckedAt
    ? t('checkedAt', {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(domain.lastCheckedAt),
        ),
      })
    : t('neverChecked');

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <IconTile icon={verified ? ShieldCheck : Globe} tone={STATUS_TONE[domain.status]} />
          <div className="min-w-0 flex-1">
            <p className="font-heading truncate text-base font-semibold">{domain.hostname}</p>
            <p className="text-muted-foreground text-xs">{checkedAt}</p>
          </div>
          <ToneBadge tone={STATUS_TONE[domain.status]}>{label}</ToneBadge>
          <Button type="button" variant="outline" onClick={onVerify} disabled={verifying}>
            <RefreshCw className={verifying ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
            {t('checkNow')}
          </Button>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="icon" aria-label={t('delete')}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            }
            title={t('deleteTitle', { hostname: domain.hostname })}
            description={t('deleteBody')}
            confirmLabel={t('delete')}
            destructive
            onConfirm={onDelete}
          />
        </div>

        {verified ? (
          <p className="text-muted-foreground text-sm">{t('verifiedNote')}</p>
        ) : (
          <div className="grid gap-2">
            <p className="font-heading text-sm font-semibold">{t('dnsTitle')}</p>
            <p className="text-muted-foreground text-xs">{t('dnsHint')}</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('colType')}</th>
                    <th className="px-3 py-2 font-medium">{t('colName')}</th>
                    <th className="px-3 py-2 font-medium">{t('colValue')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {domain.records.map((r) => (
                    <tr key={r.type} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{r.type}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{r.value}</td>
                      <td className="px-1">
                        <CopyButton value={r.value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {checks && !verified && (
          <div className="grid gap-2" aria-live="polite">
            <p className="font-heading text-sm font-semibold">{t('resultTitle')}</p>
            <ul className="grid gap-2">
              {checks.map((c) => (
                <li key={c.kind} className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                  {c.ok ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <X className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.kind === 'txt' ? t('checkTxt') : t('checkCname')}</p>
                    {!c.ok && (
                      <dl className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
                        <div className="flex gap-1">
                          <dt className="shrink-0">{t('expected')}:</dt>
                          <dd className="font-mono break-all">{c.expected}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="shrink-0">{t('found')}:</dt>
                          <dd className="font-mono break-all">
                            {c.found.length > 0 ? c.found.join(', ') : t('notFound')}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DomainsView() {
  const t = useTranslations('siteDomains');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('school:manage');
  const key = ['school-domains', school.schoolId];

  const list = useQuery({
    queryKey: key,
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/v1/school/domains', { params: header })),
  });
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, DnsCheck[]>>({});

  const add = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/school/domains', { params: header, body: { hostname: hostname.trim() } })),
    onSuccess: () => {
      setHostname('');
      setError(null);
      toast.success(t('added'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const verify = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/v1/school/domains/{id}/verify', { params: { ...header, path: { id } } })),
    onSuccess: (data) => {
      setChecks((c) => ({ ...c, [data.domain.id]: data.checks }));
      if (data.domain.status === 'verified') toast.success(t('verifiedToast'));
      else toast.error(t('failedToast'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/school/domains/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const heading = (
    <PageHeader
      title={t('title')}
      description={t('subtitle')}
      actions={<BackLink href="/site-settings" label={t('back')} />}
    />
  );

  if (!manage) {
    return (
      <PageBody>
        {heading}
        <Alert variant="destructive">
          <AlertDescription>{te('errors.forbidden')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const count = list.data?.length ?? 0;

  return (
    <PageBody>
      {heading}

      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>{t('limitTitle')}</AlertTitle>
        <AlertDescription>{t('limitBody')}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t('countOf', { count, max: MAX_DOMAINS })}</p>
        <FormDialog
          trigger={
            <Button disabled={count >= MAX_DOMAINS}>
              <Plus className="size-4" aria-hidden /> {t('addTitle')}
            </Button>
          }
          title={t('addTitle')}
          submitLabel={t('addButton')}
          disabled={hostname.trim().length === 0 || add.isPending}
          error={error}
          onOpenChange={() => {
            setHostname('');
            setError(null);
          }}
          onSubmit={() => add.mutateAsync()}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="domain-hostname">{t('hostnameLabel')}</Label>
            <Input
              id="domain-hostname"
              value={hostname}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('hostnamePlaceholder')}
              onChange={(e) => setHostname(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t('hostnameHint')}</p>
          </div>
        </FormDialog>
      </div>

      {list.isPending && <Skeleton className="h-48 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data && list.data.length === 0 && (
        <EmptyPanel icon={Globe} tone="sky" title={t('emptyTitle')} body={t('emptyBody')} />
      )}
      <div className="grid gap-4">
        {list.data?.map((d) => (
          <DomainCard
            key={d.id}
            domain={d}
            checks={checks[d.id]}
            verifying={verify.isPending && verify.variables === d.id}
            onVerify={() => verify.mutate(d.id)}
            onDelete={() => remove.mutateAsync(d.id)}
          />
        ))}
      </div>
    </PageBody>
  );
}
