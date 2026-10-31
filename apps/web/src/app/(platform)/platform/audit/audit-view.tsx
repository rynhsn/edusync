'use client';

import { useQuery } from '@tanstack/react-query';
import { History, Search } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, type Tone, ToneBadge, Toolbar } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { QueryError } from '../platform-kit';

/** Warna lencana menurut area aksi (awalan sebelum titik pertama, mis. `catalog.item.update`). */
const AREA_TONE: Record<string, Tone> = {
  school: 'rose',
  registration: 'sky',
  catalog: 'violet',
  payment: 'amber',
  billing: 'amber',
  messaging: 'emerald',
  reference: 'teal',
};
const area = (action: string) => action.split('.')[0] ?? action;

export function AuditView() {
  const t = useTranslations('platform');
  const format = useFormatter();
  const [q, setQ] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');

  const list = useQuery({
    queryKey: ['platform-audit'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/audit', { params: { query: { limit: 200 } } })),
  });

  const areas = [...new Set((list.data ?? []).map((a) => area(a.action)))].sort();
  const needle = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (a) =>
      (areaFilter === 'all' || area(a.action) === areaFilter) &&
      (needle === '' ||
        a.action.toLowerCase().includes(needle) ||
        JSON.stringify(a.details).toLowerCase().includes(needle)),
  );

  return (
    <PageBody>
      <PageHeader icon={History} tone="slate" title={t('audit')} description={t('auditSubtitle')} />
      <Toolbar>
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Label htmlFor="audit-q" className="sr-only">
            {t('auditSearch')}
          </Label>
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="audit-q"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('auditSearch')}
          />
        </div>
        <div className="w-full sm:w-48">
          <SelectField
            aria-label={t('auditArea')}
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
          >
            <option value="all">{t('filterAll')}</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="text-muted-foreground ml-auto px-2 text-xs tabular-nums" aria-live="polite">
          {t('auditCount', { count: rows.length })}
        </p>
      </Toolbar>

      {list.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        <EmptyPanel
          icon={History}
          tone="slate"
          title={list.data.length === 0 ? t('auditEmpty') : t('emptyFiltered')}
          body={list.data.length === 0 ? t('auditEmptyHint') : t('emptyFilteredHint')}
        />
      )}
      {rows.length > 0 && (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('time')}</TableHead>
                <TableHead>{t('action')}</TableHead>
                <TableHead>{t('detail')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className="align-top">
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {format.dateTime(new Date(a.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={AREA_TONE[area(a.action)] ?? 'slate'} className="font-mono">
                      {a.action}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md font-mono text-xs break-all whitespace-normal">
                    {JSON.stringify(a.details)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageBody>
  );
}
