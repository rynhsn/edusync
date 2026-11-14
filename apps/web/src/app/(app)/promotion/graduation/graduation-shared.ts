'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { ApiError } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { graduationErrorCode } from '@/lib/graduation';

/** Kunci cache yang berubah setelah kebijakan, ujian, nilai, atau keputusan kelulusan disimpan. */
export function useRefreshGraduation() {
  const { school } = useSchool();
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['graduation', 'promotions'])
      queryClient.invalidateQueries({ queryKey: [key, school.schoolId] });
  };
}

/** Pesan galat untuk pengguna: kode khusus kelulusan lebih dulu (artinya berbeda di tempat lain), selain itu pesan umum. */
export function useGraduationError() {
  const te = useTranslations();
  return (error: unknown): string => {
    const own = error instanceof ApiError ? graduationErrorCode(error.code) : null;
    return te((own ?? errorKey(error)) as never);
  };
}
