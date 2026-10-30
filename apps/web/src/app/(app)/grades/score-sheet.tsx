'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';

interface Row {
  value: string;
  note: string;
}

/** Nilai terketik menjadi angka; null bila kosong, NaN bila bukan angka. Koma desimal diterima. */
const parseValue = (text: string) => {
  const s = text.trim().replace(',', '.');
  return s === '' ? null : Number(s);
};

/** Lembar input nilai satu penilaian: satu baris per siswa, Enter atau panah bawah pindah ke baris berikutnya. */
export function ScoreSheet({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dirty, setDirty] = useState(false);

  const key = ['assessment-scores', school.schoolId, assessmentId];
  const sheet = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/assessments/{id}/scores', { params: { ...header, path: { id: assessmentId } } }),
      ),
  });
  useEffect(() => {
    if (!sheet.data) return;
    setRows(
      Object.fromEntries(
        sheet.data.students.map((s) => [
          s.studentId,
          { value: s.value === null ? '' : String(s.value), note: s.note ?? '' },
        ]),
      ),
    );
    setDirty(false);
  }, [sheet.data]);

  const max = sheet.data?.assessment.maxScore ?? 0;
  const invalid = (text: string) => {
    const v = parseValue(text);
    return v !== null && (!Number.isFinite(v) || v < 0 || v > max);
  };
  const anyInvalid = Object.values(rows).some((r) => invalid(r.value));

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/assessments/{id}/scores', {
          params: { ...header, path: { id: assessmentId } },
          body: {
            records: Object.entries(rows).map(([studentId, r]) => ({
              studentId,
              value: parseValue(r.value),
              note: r.note.trim() || null,
            })),
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('scoresSaved'));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['assessments', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-48 w-full" />;
  if (!sheet.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(sheet.error))}</AlertDescription>
      </Alert>
    );
  const { assessment, canInput, students } = sheet.data;

  const patch = (id: string, p: Partial<Row>) => {
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { value: '', note: '' }), ...p } }));
    setDirty(true);
  };
  /** Enter atau panah bawah/atas memindahkan fokus ke isian nilai di baris lain. */
  const move = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    const delta = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-score-row="${index + delta}"]`);
    next?.focus();
    next?.select();
  };
  const filled = Object.values(rows).filter((r) => r.value.trim() !== '').length;

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            ← {t('back')}
          </Button>
          <div>
            <div className="font-medium">{assessment.title}</div>
            <div className="text-muted-foreground text-sm">
              {formatCalendarDate(locale, assessment.date)} · {t('maxScore')}: {assessment.maxScore}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t('filledOf', { filled, total: students.length })}</Badge>
          {canInput && (
            <Button disabled={!dirty || anyInvalid || save.isPending} onClick={() => save.mutate()}>
              {t('save')}
            </Button>
          )}
        </div>
      </div>
      {!canInput && (
        <Alert>
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      )}
      {students.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">{t('noStudents')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{t('student')}</TableHead>
              <TableHead className="w-36">{t('score')}</TableHead>
              <TableHead>{t('note')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s, i) => {
              const row = rows[s.studentId] ?? { value: '', note: '' };
              const bad = invalid(row.value);
              return (
                <TableRow key={s.studentId}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.nis && <div className="text-muted-foreground font-mono text-xs">{s.nis}</div>}
                  </TableCell>
                  <TableCell>
                    <Input
                      data-score-row={i}
                      inputMode="decimal"
                      disabled={!canInput}
                      aria-label={`${t('score')} ${s.name}`}
                      aria-invalid={bad}
                      className={bad ? 'text-destructive' : ''}
                      value={row.value}
                      onChange={(e) => patch(s.studentId, { value: e.target.value })}
                      onKeyDown={(e) => move(e, i)}
                    />
                    {bad && <p className="text-destructive mt-1 text-xs">{t('outOfRange', { max })}</p>}
                  </TableCell>
                  <TableCell>
                    <Input
                      disabled={!canInput}
                      aria-label={`${t('note')} ${s.name}`}
                      maxLength={200}
                      value={row.note}
                      onChange={(e) => patch(s.studentId, { note: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {dirty && <p className="text-muted-foreground text-sm">{t('unsaved')}</p>}
    </Card>
  );
}
