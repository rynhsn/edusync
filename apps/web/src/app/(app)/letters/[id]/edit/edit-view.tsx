'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { Composer } from '../../composer';
import { useHeader } from '../../shared';

/** Ubah draf surat keluar; surat yang sudah ditandatangani tidak dapat diubah. */
export function EditLetterView({ id }: { id: string }) {
  const t = useTranslations('letters');
  const { school, can } = useSchool();
  const { header } = useHeader();
  const letter = useQuery({
    queryKey: ['letters', school.schoolId, 'detail', id],
    queryFn: async () => unwrap(await api.GET('/v1/letters/{id}', { params: { header, path: { id } } })),
  });

  if (!can('letter:manage')) {
    return (
      <PageBody>
        <PageHeader title={t('editTitle')} />
        <Alert>
          <AlertDescription>{t('noManage')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  if (letter.isPending) return <Skeleton className="h-64 w-full" />;
  if (letter.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  const l = letter.data;
  if (l.direction !== 'outgoing' || l.status !== 'draft') {
    return (
      <PageBody>
        <PageHeader title={t('editTitle')} />
        <Alert>
          <AlertDescription>{t('onlyDraftEditable')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  return (
    <Composer
      initial={{
        id: l.id,
        number: l.number,
        subject: l.subject,
        party: l.party,
        letterDate: l.letterDate,
        body: l.body,
        templateId: l.templateId,
        studentId: l.studentId,
        studentName: l.studentName,
      }}
    />
  );
}
