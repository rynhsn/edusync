'use client';

import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Composer } from '../composer';

/** Halaman penyusun surat keluar baru; hanya pengelola surat. */
export function NewLetterView() {
  const t = useTranslations('letters');
  const { can } = useSchool();
  if (!can('letter:manage')) {
    return (
      <PageBody>
        <PageHeader title={t('composeTitle')} />
        <Alert>
          <AlertDescription>{t('noManage')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  return <Composer />;
}
