'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSchool } from '@/components/app-shell';
import { ImportWizard } from '@/components/import-wizard';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildStudentTemplate, type ImportRow, parseStudentSheet } from '@/lib/student-sheet';

export function ImportView() {
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  return (
    <ImportWizard<ImportRow>
      namespace="studentImport"
      parse={parseStudentSheet}
      template={buildStudentTemplate}
      templateFile="templat-siswa.xlsx"
      canImport={can('student:manage')}
      listHref="/students"
      submit={async (rows, dryRun) =>
        unwrap(
          await api.POST('/v1/students/import', {
            params: { header: schoolHeader(school.schoolId) },
            body: { rows, dryRun },
          }),
        )
      }
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
        queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
      }}
    />
  );
}
