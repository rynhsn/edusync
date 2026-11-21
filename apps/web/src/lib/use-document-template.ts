'use client';

import type { DocumentTemplateKind } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';

export const documentTemplateKey = (schoolId: string, kind: DocumentTemplateKind) =>
  ['document-template', schoolId, kind] as const;

/** Templat dokumen sekolah (bawaan bila belum disimpan). `enabled` false = tidak dimuat (tanpa izin baca). */
export function useDocumentTemplate(kind: DocumentTemplateKind, enabled = true) {
  const { school } = useSchool();
  const params = { header: schoolHeader(school.schoolId) };
  return useQuery({
    queryKey: documentTemplateKey(school.schoolId, kind),
    enabled,
    queryFn: async () =>
      unwrap(
        kind === 'skl'
          ? await api.GET('/v1/document-templates/skl', { params })
          : await api.GET('/v1/document-templates/pkl_certificate', { params }),
      ),
  });
}
