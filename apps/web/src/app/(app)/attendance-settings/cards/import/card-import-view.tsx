'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildCardTemplate, type CardImportRow, parseCardSheet } from '@/lib/card-sheet';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';

const CHUNK = 500;
const SHOWN = 100;
type Reason = 'student_not_found' | 'code_taken' | 'student_has_card' | 'invalid_code';

interface Failure {
  /** Nomor baris di berkas Excel. */
  row: number;
  nis: string;
  code: string;
  reason: Reason;
}
interface Result {
  created: number;
  failed: Failure[];
}

/** Impor kartu RFID dari Excel (kolom NIS dan Kode kartu); dikirim per potongan dan hasilnya sebagian. */
export function CardImportView() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CardImportRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = useMutation({
    mutationFn: async (list: CardImportRow[]): Promise<Result> => {
      const total: Result = { created: 0, failed: [] };
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        const res = unwrap(
          await api.POST('/v1/attendance/cards/bulk', {
            params: { header: schoolHeader(school.schoolId) },
            body: { items: part.map((r) => ({ nis: r.nis, code: r.code })) },
          }),
        );
        total.created += res.created;
        // `row` dari server berurutan mulai 1 di dalam potongan; petakan kembali ke baris Excel.
        for (const f of res.failed) {
          total.failed.push({ ...f, row: part[f.row - 1]?.row ?? f.row });
        }
      }
      return total;
    },
    onSuccess: (r) => {
      setResult(r);
      setRows([]);
      if (fileInput.current) fileInput.current.value = '';
      if (r.created > 0) toast.success(t('cardImport.done', { count: r.created }));
      queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });
    },
    onError: (e) => setProblem(te(errorKey(e))),
  });

  async function onFile(file: File | undefined) {
    setProblem(null);
    setResult(null);
    setRows([]);
    if (!file) return;
    try {
      const parsed = await parseCardSheet(await file.arrayBuffer());
      if (parsed.fatal === 'missing_columns') {
        return setProblem(t('cardImport.missingColumns', { columns: parsed.missing.join(', ') }));
      }
      if (parsed.fatal === 'too_many_rows') return setProblem(t('cardImport.tooMany'));
      if (parsed.fatal === 'no_rows') return setProblem(t('cardImport.noRows'));
      if (parsed.fatal) return setProblem(t('cardImport.noSheet'));
      setRows(parsed.rows);
    } catch {
      setProblem(t('cardImport.readError'));
    }
  }

  async function exportFailed() {
    if (!result) return;
    const blob = await buildExport(
      'Gagal',
      [t('cardImport.row'), 'NIS', t('cardCode'), t('cardImport.reason')],
      result.failed.map((f) => [f.row, f.nis, f.code, t(`cardImport.reasons.${f.reason}`)]),
      { textColumns: [2, 3], widths: [10, 20, 28, 40] },
    );
    saveBlob(blob, 'kartu-gagal.xlsx');
  }

  if (!can('attendance:configure')) {
    return (
      <PageBody>
        <PageHeader title={t('cardImport.title')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader title={t('cardImport.title')} description={t('cardImport.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('cardImport.step1')}</CardTitle>
          <CardDescription>{t('cardImport.step1Hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => saveBlob(await buildCardTemplate(), 'templat-kartu.xlsx')}
          >
            {t('cardImport.download')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('cardImport.step2')}</CardTitle>
          <CardDescription>{t('cardImport.step2Hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-w-sm gap-2">
            <Label htmlFor="card-import-file">{t('cardImport.file')}</Label>
            <input
              id="card-import-file"
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={run.isPending}
              onChange={(e) => onFile(e.target.files?.[0])}
              className="border-input file:bg-muted file:text-foreground block w-full cursor-pointer rounded-lg border p-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="grid gap-3">
              <p className="text-sm font-medium">{t('cardImport.preview', { count: rows.length })}</p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{t('cardImport.row')}</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>{t('cardCode')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, SHOWN).map((r) => (
                      <TableRow key={r.row}>
                        <TableCell className="font-mono">{r.row}</TableCell>
                        <TableCell className="font-mono">{r.nis}</TableCell>
                        <TableCell className="font-mono">{r.code}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > SHOWN && (
                <p className="text-muted-foreground text-xs">
                  {t('cardImport.showing', { shown: SHOWN, count: rows.length })}
                </p>
              )}
              <div>
                <Button disabled={run.isPending} onClick={() => run.mutate(rows)}>
                  {run.isPending ? t('cardImport.importing') : t('cardImport.import', { count: rows.length })}
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div className="grid gap-3">
              <p className="text-sm font-medium">
                {t('cardImport.result', { created: result.created, failed: result.failed.length })}
              </p>
              {result.failed.length > 0 && (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">{t('cardImport.row')}</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>{t('cardCode')}</TableHead>
                          <TableHead>{t('cardImport.reason')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.failed.slice(0, SHOWN).map((f) => (
                          <TableRow key={`${f.row}-${f.nis}-${f.code}`}>
                            <TableCell className="font-mono">{f.row}</TableCell>
                            <TableCell className="font-mono">{f.nis}</TableCell>
                            <TableCell className="font-mono">{f.code}</TableCell>
                            <TableCell>{t(`cardImport.reasons.${f.reason}`)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {result.failed.length > SHOWN && (
                    <p className="text-muted-foreground text-xs">
                      {t('cardImport.showing', { shown: SHOWN, count: result.failed.length })}
                    </p>
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button nativeButton={false} render={<Link href="/attendance-settings?tab=cards" />}>
                  {t('cardImport.back')}
                </Button>
                {result.failed.length > 0 && (
                  <Button variant="outline" onClick={exportFailed}>
                    {t('cardImport.exportFailed')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageBody>
  );
}
