'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildStudentTemplate, type ImportRow, parseStudentSheet } from '@/lib/student-sheet';

const SHOWN_ERRORS = 100;
type FieldKey = 'name' | 'nis' | 'nisn' | 'gender' | 'birthDate' | 'className';

interface Check {
  total: number;
  valid: number;
  imported: number;
  errors: { row: number; field: string | null; message: string }[];
}

export function ImportView() {
  const t = useTranslations('studentImport');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [check, setCheck] = useState<Check | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const run = useMutation({
    mutationFn: async (v: { rows: ImportRow[]; dryRun: boolean }) =>
      unwrap(await api.POST('/v1/students/import', { params: header, body: v })),
    onError: (e) => setProblem(te(errorKey(e))),
  });

  async function onFile(file: File | undefined) {
    setProblem(null);
    setCheck(null);
    setRows([]);
    setImported(null);
    if (!file) return;
    try {
      const parsed = await parseStudentSheet(await file.arrayBuffer());
      if (parsed.fatal === 'missing_columns') {
        return setProblem(t('missingColumns', { columns: parsed.missing.join(', ') }));
      }
      if (parsed.fatal === 'too_many_rows') return setProblem(t('tooMany'));
      if (parsed.fatal === 'no_rows') return setProblem(t('noRows'));
      if (parsed.fatal) return setProblem(t('noSheet'));
      setRows(parsed.rows);
      setCheck(await run.mutateAsync({ rows: parsed.rows, dryRun: true }));
    } catch (e) {
      // Kesalahan API sudah ditampilkan oleh onError; yang tersisa adalah berkas yang tidak dapat dibaca.
      if (!(e instanceof Error && 'status' in e)) setProblem(t('readError'));
    }
  }

  async function downloadTemplate() {
    const url = URL.createObjectURL(await buildStudentTemplate());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'templat-siswa.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    const res = await run.mutateAsync({ rows, dryRun: false });
    if (res.errors.length > 0) return setCheck(res);
    setImported(res.imported);
    setRows([]);
    setCheck(null);
    if (fileInput.current) fileInput.current.value = '';
    toast.success(t('done', { count: res.imported }));
    queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
  }

  const fieldLabel = (f: string | null) => (f ? t(`fields.${f as FieldKey}`) : '');
  const pending = run.isPending;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('step1')}</CardTitle>
          <CardDescription>{t('step1Hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate}>
            {t('download')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('step2')}</CardTitle>
          <CardDescription>{t('step2Hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-w-sm gap-2">
            <Label htmlFor="student-file">{t('file')}</Label>
            <input
              id="student-file"
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!manage || pending}
              onChange={(e) => onFile(e.target.files?.[0])}
              className="border-input file:bg-muted file:text-foreground block w-full cursor-pointer rounded-lg border p-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {pending && !imported && <p className="text-muted-foreground text-sm">{t('checking')}</p>}

          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}

          {check && (
            <div className="grid gap-3">
              <p className="text-sm font-medium">
                {t('summary', { valid: check.valid, total: check.total })}
              </p>
              {check.errors.length === 0 ? (
                <>
                  <p className="text-sm">{t('allValid')}</p>
                  <div>
                    <Button disabled={pending} onClick={save}>
                      {pending ? t('importing') : t('import', { count: check.valid })}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Alert variant="destructive">
                    <AlertDescription>{t('hasErrors', { count: check.errors.length })}</AlertDescription>
                  </Alert>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50 text-muted-foreground text-xs">
                        <tr>
                          <th className="px-3 py-2 font-medium">{t('row')}</th>
                          <th className="px-3 py-2 font-medium">{t('field')}</th>
                          <th className="px-3 py-2 font-medium">{t('message')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {check.errors.slice(0, SHOWN_ERRORS).map((e) => (
                          <tr key={`${e.row}-${e.field}-${e.message}`}>
                            <td className="px-3 py-2 font-mono">{e.row}</td>
                            <td className="px-3 py-2">{fieldLabel(e.field)}</td>
                            <td className="px-3 py-2">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {check.errors.length > SHOWN_ERRORS && (
                    <p className="text-muted-foreground text-xs">
                      {t('showing', { shown: SHOWN_ERRORS, count: check.errors.length })}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {imported !== null && (
            <div className="grid gap-3">
              <p className="text-sm font-medium">{t('done', { count: imported })}</p>
              <div className="flex gap-2">
                <Button nativeButton={false} render={<Link href="/students" />}>
                  {t('toList')}
                </Button>
                <Button variant="outline" onClick={() => setImported(null)}>
                  {t('another')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
