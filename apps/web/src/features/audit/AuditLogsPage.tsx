import { useMemo, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import type { PlatformAuditLog } from '@edusync/contracts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Loading, formatDate } from '@/features/shared';
import { useTranslation } from '@/i18n';

function formatAuditDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return '—';
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

export function AuditLogsPage({ logs, loading }: { logs: PlatformAuditLog[]; loading: boolean }) {
  const [query, setQuery] = useState('');
  const { locale, t } = useTranslation();

  const filtered = useMemo(
    () => logs.filter((entry) =>
      `${entry.action} ${entry.entityType} ${entry.entityId ?? ''} ${entry.actorName ?? ''} ${entry.actorEmail ?? ''} ${JSON.stringify(entry.details)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ),
    [logs, query],
  );

  return <Card>
    <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle>{t('audit.title')}</CardTitle>
        <CardDescription>{t('audit.count', { count: logs.length })}</CardDescription>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="w-full pl-9 sm:w-72"
          aria-label={t('audit.searchLabel')}
          placeholder={t('audit.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
    </CardHeader>
    <CardContent>
      {loading && logs.length === 0 ? (
        <Loading label={t('audit.loading')} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={21} />}
          title={query ? t('audit.emptyQueryTitle') : t('audit.emptyTitle')}
          description={query ? t('audit.emptyQueryDescription') : t('audit.emptyDescription')}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4">{t('audit.colAction')}</th>
                  <th className="pb-3 pr-4">{t('audit.colActor')}</th>
                  <th className="pb-3 pr-4">{t('audit.colEntity')}</th>
                  <th className="pb-3 pr-4">{t('audit.colDetails')}</th>
                  <th className="pb-3">{t('audit.colTimestamp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="py-3.5 pr-4">
                      <Badge variant="secondary" className="font-mono text-xs">{entry.action}</Badge>
                    </td>
                    <td className="py-3.5 pr-4 text-xs">
                      {entry.actorName || entry.actorEmail ? (
                        <div>
                          {entry.actorName && <p className="font-semibold text-foreground">{entry.actorName}</p>}
                          {entry.actorEmail && <p className="text-muted-foreground">{entry.actorEmail}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('audit.systemActor')}</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{entry.entityType}</span>
                      {entry.entityId && <span className="block truncate font-mono text-[11px]">{entry.entityId}</span>}
                    </td>
                    <td className="max-w-xs py-3.5 pr-4 text-xs text-muted-foreground">
                      {formatAuditDetails(entry.details)}
                    </td>
                    <td className="py-3.5 text-xs text-muted-foreground">
                      {formatDate(entry.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {filtered.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">{entry.action}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt, locale)}</span>
                </div>
                <p className="mt-2 text-xs font-semibold">
                  {entry.actorName || entry.actorEmail
                    ? [entry.actorName, entry.actorEmail].filter(Boolean).join(' · ')
                    : t('audit.systemActor')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ''}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{formatAuditDetails(entry.details)}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </CardContent>
  </Card>;
}
