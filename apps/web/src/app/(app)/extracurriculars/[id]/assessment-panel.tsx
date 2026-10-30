'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { PREDICATES, type Predicate } from '../shared';

interface Row {
  predicate: Predicate | '';
  note: string;
}

export function AssessmentPanel({ id, canWrite }: { id: string; canWrite: boolean }) {
  const t = useTranslations('extracurricular');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [semesterChoice, setSemesterChoice] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dirty, setDirty] = useState(false);

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const semesterId =
    semesterChoice || semesters.data?.find((s) => s.isActive)?.id || semesters.data?.[0]?.id || '';

  const key = ['extracurricular-assessment', school.schoolId, id, semesterId];
  const assessment = useQuery({
    queryKey: key,
    enabled: !!semesterId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/extracurriculars/{id}/assessments', {
          params: { ...header, path: { id }, query: { semesterId } },
        }),
      ),
  });
  useEffect(() => {
    if (!assessment.data) return;
    setRows(
      Object.fromEntries(
        assessment.data.map((r) => [r.studentId, { predicate: r.predicate ?? '', note: r.note ?? '' }]),
      ),
    );
    setDirty(false);
  }, [assessment.data]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/extracurriculars/{id}/assessments', {
          params: { ...header, path: { id } },
          body: {
            semesterId,
            // Hanya anggota yang sudah diberi predikat yang dikirim.
            records: Object.entries(rows)
              .filter((entry): entry is [string, Row & { predicate: Predicate }] => entry[1].predicate !== '')
              .map(([studentId, r]) => ({ studentId, predicate: r.predicate, note: r.note.trim() || null })),
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('assessmentSaved'));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const patch = (sid: string, p: Partial<Row>) => {
    setRows((r) => ({ ...r, [sid]: { ...(r[sid] ?? { predicate: '', note: '' }), ...p } }));
    setDirty(true);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectField
          aria-label={t('semester')}
          className="sm:w-64"
          value={semesterId}
          onChange={(e) => setSemesterChoice(e.target.value)}
        >
          {semesters.data?.length === 0 && <option value="">{t('chooseSemester')}</option>}
          {semesters.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        {canWrite && (
          <Button disabled={!dirty || save.isPending || !semesterId} onClick={() => save.mutate()}>
            {t('saveAssessment')}
          </Button>
        )}
      </div>
      {semesters.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noSemesters')}</Card>
      )}
      {semesterId && assessment.isPending && <Skeleton className="h-40 w-full" />}
      {assessment.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noMembers')}</Card>
      )}
      {assessment.data && assessment.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('student')}</TableHead>
                <TableHead className="w-44">{t('predicate')}</TableHead>
                <TableHead>{t('note')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessment.data.map((r) => (
                <TableRow key={r.studentId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <SelectField
                      disabled={!canWrite}
                      aria-label={`${t('predicate')} ${r.name}`}
                      value={rows[r.studentId]?.predicate ?? ''}
                      onChange={(e) => patch(r.studentId, { predicate: e.target.value as Predicate | '' })}
                    >
                      <option value="">{t('noPredicate')}</option>
                      {PREDICATES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </SelectField>
                  </TableCell>
                  <TableCell>
                    <Input
                      disabled={!canWrite}
                      aria-label={`${t('note')} ${r.name}`}
                      maxLength={200}
                      value={rows[r.studentId]?.note ?? ''}
                      onChange={(e) => patch(r.studentId, { note: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {dirty && <p className="text-muted-foreground text-sm">{t('unsaved')}</p>}
    </div>
  );
}
