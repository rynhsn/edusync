'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
}

/**
 * Alur impor Excel yang sama untuk siswa dan guru: unduh templat, pilih berkas, pratinjau kesalahan per baris,
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
}: Props<Row>) {
  const t = useTranslations(namespace);
  const te = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const run = useMutation({
    mutationFn: async (v: { rows: Row[]; dryRun: boolean }) => submit(v.rows, v.dryRun),
    onError: (e) => setProblem(te(errorKey(e))),
  });

  async function onFile(file: File | undefined) {
    setProblem(null);
    setCheck(null);
    setRows([]);
    setImported(null);
    if (!file) return;
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
    if (fileInput.current) fileInput.current.value = '';
    toast.success(t('done', { count: res.imported }));
    onSaved();
  }

  const fieldLabel = (f: string | null) => (f ? t(`fields.${f}` as never) : '');
  const pending = run.isPending;

  return (
    <PageBody>
      <PageHeader title={t('title')} description={t('subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('step1')}</CardTitle>
          <CardDescription>{t('step1Hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={async () => saveBlob(await template(), templateFile)}>
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
            <Label htmlFor="import-file">{t('file')}</Label>
            <input
              id="import-file"
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canImport || pending}
              onChange={(e) => onFile(e.target.files?.[0])}
              className="border-input file:bg-muted file:text-foreground block w-full cursor-pointer rounded-lg border p-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {pending && imported === null && <p className="text-muted-foreground text-sm">{t('checking')}</p>}

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
                <Button nativeButton={false} render={<Link href={listHref} />}>
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
    </PageBody>
  );
}
