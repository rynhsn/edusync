'use client';

import { useQuery } from '@tanstack/react-query';
import { FileBadge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { documentOf, type UkkEvent, ukkKey } from '../lib';

/** Nomor sertifikat (kompeten) dan surat keterangan (belum kompeten) per murid, dari percobaan terakhir yang bernilai. */
export function DocumentsPanel({ event }: { event: UkkEvent }) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school } = useSchool();
  const results = useQuery({
    queryKey: ukkKey(school.schoolId, 'results', event.id),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/ukk/events/{id}/results', {
          params: { header: schoolHeader(school.schoolId), path: { id: event.id } },
        }),
      ),
  });

  if (results.isPending) return <Skeleton className="h-40 rounded-xl" aria-busy />;
  if (results.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{te(errorKey(results.error))}</AlertDescription>
      </Alert>
    );
  }
  const scored = results.data.students.filter((s) => s.latestAttemptNo !== null);
  if (scored.length === 0) {
    return (
      <EmptyPanel
        icon={FileBadge}
        tone="violet"
        title={t('documents.emptyTitle')}
        body={t('documents.emptyBody')}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">{t('documents.hint')}</p>
      <ul className="grid gap-2 md:grid-cols-2">
        {scored.map((s) => {
          const doc = documentOf(s);
          const a = s.attempts.find((x) => x.attemptNo === s.latestAttemptNo);
          return (
            <li key={s.studentId} className="bg-card grid gap-1.5 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium break-words">{s.name}</p>
                {a?.bandLabel && <ToneBadge tone={a.competent ? 'emerald' : 'rose'}>{a.bandLabel}</ToneBadge>}
              </div>
              {doc ? (
                <p className="text-sm break-all">
                  <span className="text-muted-foreground text-xs">
                    {t(doc.kind === 'certificate' ? 'documents.certificate' : 'documents.statement')}:{' '}
                  </span>
                  <span className="font-medium tabular-nums">{doc.number}</span>
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">{t('documents.notNumbered')}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
