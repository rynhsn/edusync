'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/**
 * Galat langkah wizard. Kode `levels_not_configured` menaut ke pengaturan tingkat; `invalid_target` menaut ke
 * daftar tahun ajaran.
 */
export function StepError({ error }: { error: unknown }) {
  const t = useTranslations('promotion');
  const te = useTranslations();
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {te(errorKey(error))}
        {code === 'levels_not_configured' && (
          <>
            {' '}
            <Link href="/school-settings" className="font-medium underline underline-offset-2">
              {t('levelsLink')}
            </Link>
          </>
        )}
        {code === 'invalid_target' && (
          <>
            {' '}
            <Link href="/academic-years" className="font-medium underline underline-offset-2">
              {t('yearsLink')}
            </Link>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
