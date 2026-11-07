'use client';

import type { CardField } from '@edusync/contracts';
import { useTranslations } from 'next-intl';

/** Nama kolom terikat sesuai bahasa pengguna. */
export function useFieldLabel(): (field: CardField) => string {
  const t = useTranslations('cards.fields');
  return (field) => t(field);
}
