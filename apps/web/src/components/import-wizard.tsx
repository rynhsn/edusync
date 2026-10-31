'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileWarning, ListChecks, Rows3, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { BackLink } from '@/components/back-link';
import { ImportDropzone, ImportStepper } from '@/components/import-parts';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, StatCard, StatGrid, type Tone, ToneBadge } from '@/components/ui-kit';
import { errorKey } from '@/lib/errors';
import { type ParsedSheet, saveBlob } from '@/lib/sheet';

const SHOWN_ERRORS = 100;

export interface ImportCheck {
  total: number;
  valid: number;
  imported: number;
  errors: { row: number; field: string | null; message: string }[];
}

interface Props<Row> {
  /** Namespace teks (studentImport atau teacherImport); kuncinya sama. */
  namespace: 'studentImport' | 'teacherImport';
  parse: (
    buffer: ArrayBuffer,
  ) => Promise<{ fatal: ParsedSheet<string>['fatal']; missing: string[]; rows: Row[] }>;
  template: () => Promise<Blob>;
  templateFile: string;
  /** Kirim baris ke server; `dryRun` hanya memeriksa. */
  submit: (rows: Row[], dryRun: boolean) => Promise<ImportCheck>;
  canImport: boolean;
  /** Dipanggil setelah data tersimpan, mis. untuk menyegarkan daftar. */
  onSaved: () => void;
  listHref: string;
  tone?: Tone;
}

/**
 * Alur impor Excel yang sama untuk siswa dan guru: unduh templat, unggah berkas, pratinjau kesalahan per baris,
 * lalu simpan bila semua baris valid.
 */
export function ImportWizard<Row>({
  namespace,
  parse,
  template,
  templateFile,
  submit,
  canImport,
  onSaved,
  listHref,
  tone = 'teal',
}: Props<Row>) {
  const t = useTranslations(namespace);
  const k = useTranslations('importKit');
  const te = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (v: { rows: Row[]; dryRun: boolean }) => submit(v.rows, v.dryRun),
    onError: (e) => setProblem(te(errorKey(e))),
  });

  async function onFile(file: File | undefined) {
    setProblem(null);
    setCheck(null);
    setRows([]);
    setImported(null);
    setFileName(file?.name ?? null);
    if (!file) {
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    try {
      const parsed = await parse(await file.arrayBuffer());
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

  async function save() {
    const res = await run.mutateAsync({ rows, dryRun: false });
    if (res.errors.length > 0) return setCheck(res);
    setImported(res.imported);
    setRows([]);
    setCheck(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = '';
    toast.success(t('done', { count: res.imported }));
    onSaved();
  }

  const fieldLabel = (f: string | null) => (f ? t(`fields.${f}` as never) : '');
  const pending = run.isPending;
  const step = imported !== null ? 2 : check ? 1 : 0;

  return (
    <PageBody>
      <PageHeader
        icon={Upload}
        tone={tone}
        title={t('title')}
        description={t('subtitle')}
        actions={<BackLink href={listHref} />}
      />
      <ImportStepper step={step} />

      {step === 0 && (
        <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="font-heading font-semibold">{k('templateTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('step1Hint')}</p>
            </div>
            <Button variant="outline" onClick={async () => saveBlob(await template(), templateFile)}>
              <Download className="size-4" aria-hidden />
              {t('download')}
            </Button>
          </div>

          <ImportDropzone
            inputId="import-file"
            inputRef={fileInput}
            onFile={onFile}
            disabled={!canImport || pending}
            fileName={fileName}
          />
          <p className="text-muted-foreground -mt-2 text-center text-xs">{t('step2Hint')}</p>

          {pending && <p className="text-muted-foreground text-center text-sm">{t('checking')}</p>}
          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === 1 && check && (
        <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatGrid className="lg:grid-cols-3">
            <StatCard icon={Rows3} tone="slate" label={k('rowsTotal')} value={check.total} />
            <StatCard icon={ListChecks} tone="emerald" label={k('rowsValid')} value={check.valid} />
            <StatCard
              icon={FileWarning}
              tone={check.errors.length ? 'rose' : 'slate'}
              label={k('rowsErrors')}
              value={check.errors.length}
            />
          </StatGrid>

          {problem && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}

          {check.errors.length === 0 ? (
            <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div>
                  <p className="font-heading font-semibold">{t('allValid')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('summary', { valid: check.valid, total: check.total })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={pending} onClick={() => onFile(undefined)}>
                  {k('chooseOther')}
                </Button>
                <Button size="lg" disabled={pending} onClick={save}>
                  {pending ? t('importing') : t('import', { count: check.valid })}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertDescription>{t('hasErrors', { count: check.errors.length })}</AlertDescription>
              </Alert>
              <div className="bg-card overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{t('row')}</TableHead>
                      <TableHead>{t('field')}</TableHead>
                      <TableHead>{t('message')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {check.errors.slice(0, SHOWN_ERRORS).map((e) => (
                      <TableRow key={`${e.row}-${e.field}-${e.message}`}>
                        <TableCell className="font-mono">{e.row}</TableCell>
                        <TableCell>
                          {e.field && <ToneBadge tone="rose">{fieldLabel(e.field)}</ToneBadge>}
                        </TableCell>
                        <TableCell className="whitespace-normal">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {check.errors.length > SHOWN_ERRORS && (
                <p className="text-muted-foreground text-xs">
                  {t('showing', { shown: SHOWN_ERRORS, count: check.errors.length })}
                </p>
              )}
              <div>
                <Button size="lg" disabled={pending} onClick={() => onFile(undefined)}>
                  <Upload className="size-4" aria-hidden />
                  {k('uploadAgain')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <EmptyPanel
          icon={CheckCircle2}
          tone="emerald"
          title={t('done', { count: imported ?? 0 })}
          body={k('doneBody')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" nativeButton={false} render={<Link href={listHref} />}>
                {t('toList')}
              </Button>
              <Button size="lg" variant="outline" onClick={() => setImported(null)}>
                {t('another')}
              </Button>
            </div>
          }
        />
      )}
    </PageBody>
  );
}
