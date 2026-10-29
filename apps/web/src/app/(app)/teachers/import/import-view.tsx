'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { ImportWizard } from '@/components/import-wizard';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildTeacherTemplate, parseTeacherSheet, type TeacherImportRow } from '@/lib/teacher-sheet';

export function TeacherImportView() {
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  return (
    <ImportWizard<TeacherImportRow>
      namespace="teacherImport"
      parse={parseTeacherSheet}
      template={buildTeacherTemplate}
      templateFile="templat-guru.xlsx"
      canImport={can('teacher:manage')}
      listHref="/teachers"
      submit={async (rows, dryRun) =>
        unwrap(
          await api.POST('/v1/teachers/import', {
            params: { header: schoolHeader(school.schoolId) },
            body: { rows, dryRun },
          }),
        )
      }
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['teachers', school.schoolId] })}
    />
  );
}
