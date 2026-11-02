'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Download, FileWarning, ListChecks, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ImportDropzone, ImportStepper } from '@/components/import-parts';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
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
  const k = useTranslations('importKit');
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
    if (!file) {
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
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
        <PageHeader
          title={t('cardImport.title')}
          actions={<BackLink href="/attendance/cards" label={t('cardImport.back')} />}
        />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const step = result ? 2 : rows.length > 0 ? 1 : 0;

  return (
    <PageBody>
      <PageHeader
        icon={CreditCard}
        tone="sky"
        title={t('cardImport.title')}
        description={t('cardImport.subtitle')}
        actions={<BackLink href="/attendance/cards" label={t('cardImport.back')} />}
      />
      <ImportStepper step={step} />

      {step === 0 && (
        <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="font-heading font-semibold">{k('templateTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('cardImport.step1Hint')}</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => saveBlob(await buildCardTemplate(), 'templat-kartu.xlsx')}
            >
              <Download className="size-4" aria-hidden />
              {t('cardImport.download')}
            </Button>
          </div>
          <ImportDropzone
            inputId="card-import-file"
            inputRef={fileInput}
            onFile={onFile}
            disabled={run.isPending}
          />
          <p className="text-muted-foreground -mt-2 text-center text-xs">{t('cardImport.step2Hint')}</p>
          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatGrid className="lg:grid-cols-2">
            <StatCard icon={Rows3} tone="slate" label={k('rowsTotal')} value={rows.length} />
            <StatCard icon={ListChecks} tone="emerald" label={k('rowsReady')} value={rows.length} />
          </StatGrid>
          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          <div className="bg-card overflow-x-auto rounded-2xl border">
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
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={run.isPending} onClick={() => run.mutate(rows)}>
              {run.isPending ? t('cardImport.importing') : t('cardImport.import', { count: rows.length })}
            </Button>
            <Button size="lg" variant="outline" disabled={run.isPending} onClick={() => onFile(undefined)}>
              {k('chooseOther')}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && result && (
        <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatGrid className="lg:grid-cols-2">
            <StatCard icon={CheckCircle2} tone="emerald" label={k('registered')} value={result.created} />
            <StatCard
              icon={FileWarning}
              tone={result.failed.length ? 'rose' : 'slate'}
              label={k('rowsFailed')}
              value={result.failed.length}
            />
          </StatGrid>
          {result.failed.length > 0 && (
            <>
              <div className="bg-card overflow-x-auto rounded-2xl border">
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
                        <TableCell>
                          <ToneBadge tone="rose" className="whitespace-normal">
                            {t(`cardImport.reasons.${f.reason}`)}
                          </ToneBadge>
                        </TableCell>
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
            <Button size="lg" nativeButton={false} render={<Link href="/attendance/cards" />}>
              {t('cardImport.back')}
            </Button>
            {result.failed.length > 0 && (
              <Button size="lg" variant="outline" onClick={exportFailed}>
                {t('cardImport.exportFailed')}
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={() => onFile(undefined)}>
              {k('chooseOther')}
            </Button>
          </div>
        </div>
      )}
    </PageBody>
  );
}
