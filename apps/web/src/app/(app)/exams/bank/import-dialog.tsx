'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { RichText } from '@/components/rich-text';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildTemplate, type ParsedImport, parseImportFile } from '@/lib/question-import';
import { cn } from '@/lib/utils';

const MAX_ROWS = 500;
const ACCEPT = '.xlsx,.docx,.txt';

interface Report {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  created: number;
  errors: { row: number; message: string }[];
}

const WORD_EXAMPLE = `1. Hasil dari $2 + 3 \\times 4$ adalah ...
A. 20
B. 14
C. 24
Kunci: B
Poin: 2
Pembahasan: Perkalian dikerjakan lebih dulu.

2. Jelaskan perbedaan IP publik dan IP privat.
Pedoman: IP publik unik secara global.`;

/** Impor soal dari Excel/Word/teks: dibaca di peramban, diperiksa server (dryRun), baru ditulis saat dikonfirmasi. */
export function ImportDialog({
  open,
  onOpenChange,
  subjects,
  levels,
  defaultSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: { id: string; name: string }[];
  levels: { id: string; code: string; label: string }[];
  defaultSubjectId: string;
}) {
  const t = useTranslations('questionImport');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const fileInput = useRef<HTMLInputElement>(null);

  const [subjectId, setSubjectId] = useState('');
  const [level, setLevel] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Setiap kali dialog dibuka: mulai bersih dengan mapel yang sedang disaring (hanya `open` yang memicu).
  // biome-ignore lint/correctness/useExhaustiveDependencies: daftar mapel boleh berganti identitas tanpa mengosongkan isian.
  useEffect(() => {
    if (!open) return;
    setSubjectId(defaultSubjectId || subjects[0]?.id || '');
    setLevel('');
    setParsed(null);
    setFileName('');
    setReport(null);
    setSkipInvalid(false);
    setError(null);
  }, [open]);

  const body = (rows: ParsedImport['rows'], dryRun: boolean) => ({
    subjectId,
    level: level || null,
    dryRun,
    rows,
  });

  const check = useMutation({
    mutationFn: async (rows: ParsedImport['rows']) =>
      unwrap(await api.POST('/v1/exam/questions/import', { params: header, body: body(rows, true) })),
    onSuccess: (r) => setReport(r),
    onError: (e) => {
      setReport(null);
      setError(te(errorKey(e)));
    },
  });

  // Periksa ulang ke server bila berkas atau mapel berganti (duplikat dihitung per mapel).
  const checkRun = check.mutate;
  useEffect(() => {
    if (!parsed || parsed.rows.length === 0 || parsed.rows.length > MAX_ROWS || !subjectId) return;
    setReport(null);
    checkRun(parsed.rows);
  }, [parsed, subjectId, checkRun]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReport(null);
    setParsed(null);
    setFileName(file.name);
    try {
      setParsed(await parseImportFile(file));
    } catch (e) {
      setError(e instanceof Error && e.message === 'unsupported' ? t('unsupported') : t('parseFailed'));
    }
  }

  async function downloadTemplate() {
    const url = URL.createObjectURL(await buildTemplate());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'templat-impor-soal.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const badRows = new Set((report?.errors ?? []).map((e) => e.row - 1));
  const sendable = parsed ? parsed.rows.filter((_, i) => !badRows.has(i)) : [];
  const toSend = skipInvalid ? sendable : (parsed?.rows ?? []);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/exam/questions/import', { params: header, body: body(toSend, false) })),
    onSuccess: (r) => {
      toast.success(t('imported', { n: r.created, duplicates: r.duplicates }));
      queryClient.invalidateQueries({ queryKey: ['exam-questions', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['exam-subjects', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const tooMany = !!parsed && parsed.rows.length > MAX_ROWS;
  const hasProblems = (report?.invalid ?? 0) > 0;
  const canSubmit =
    !!report && !check.isPending && !tooMany && toSend.length > 0 && (!hasProblems || skipInvalid);
  const rowWarnings = (line: number) => (parsed?.warnings ?? []).filter((w) => w.line === line);
  const general = (parsed?.warnings ?? []).filter((w) => w.line === 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      submitLabel={t('submit', { n: toSend.length })}
      size="wide"
      error={error}
      disabled={!canSubmit}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="imp-subject">{t('subject')}</Label>
            <SelectField id="imp-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="imp-level">{t('level')}</Label>
            <SelectField id="imp-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">{t('allLevels')}</option>
              {levels.map((l) => (
                <option key={l.id} value={l.code}>
                  {l.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: area lepas berkas; tombol pilih berkas ada di dalamnya. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            'grid justify-items-center gap-2 rounded-xl border border-dashed p-5 text-center',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          <FileUp aria-hidden className="text-muted-foreground size-6" />
          <p className="text-sm font-medium">{fileName || t('dropHere')}</p>
          <p className="text-muted-foreground text-xs">{t('formats', { max: MAX_ROWS })}</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label={t('pickFile')}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp /> {t('pickFile')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void downloadTemplate()}>
              <Download /> {t('downloadTemplate')}
            </Button>
          </div>
        </div>

        <details className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{t('wordHelp')}</summary>
          <ul className="text-muted-foreground mt-2 grid list-disc gap-1 pl-5 text-xs">
            <li>{t('helpNumbering')}</li>
            <li>{t('helpOptions')}</li>
            <li>{t('helpKey')}</li>
            <li>{t('helpEssay')}</li>
            <li>{t('helpImages')}</li>
          </ul>
          <pre className="bg-background mt-2 overflow-x-auto rounded-md border p-2 text-xs">
            {WORD_EXAMPLE}
          </pre>
        </details>

        {general.map((w) => (
          <Alert key={w.message}>
            <AlertTriangle aria-hidden className="size-4" />
            <AlertDescription>{w.message}</AlertDescription>
          </Alert>
        ))}
        {tooMany && (
          <Alert variant="destructive">
            <AlertDescription>{t('tooMany', { max: MAX_ROWS })}</AlertDescription>
          </Alert>
        )}
        {parsed && parsed.rows.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>{t('noRows')}</AlertDescription>
          </Alert>
        )}

        {parsed && parsed.rows.length > 0 && (
          <div className="grid gap-3">
            <p className="text-sm" aria-live="polite">
              {check.isPending || !report
                ? t('checking')
                : t('summary', {
                    valid: report.valid,
                    invalid: report.invalid,
                    duplicates: report.duplicates,
                  })}
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5">{t('colRow')}</th>
                    <th className="px-2 py-1.5">{t('colType')}</th>
                    <th className="px-2 py-1.5">{t('colQuestion')}</th>
                    <th className="px-2 py-1.5">{t('colOptions')}</th>
                    <th className="px-2 py-1.5">{t('colKey')}</th>
                    <th className="px-2 py-1.5">{t('colPoints')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r, i) => {
                    const line = parsed.lines[i] ?? i + 1;
                    const err = report?.errors.find((e) => e.row === i + 1);
                    const warns = rowWarnings(line);
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: baris hasil bacaan tak punya id; urutannya tetap.
                      <tr key={i} className={cn('border-t align-top', err && 'bg-destructive/5')}>
                        <td className="px-2 py-1.5 tabular-nums">{line}</td>
                        <td className="px-2 py-1.5">
                          <ToneBadge tone={r.type === 'mcq' ? 'sky' : 'amber'}>{t(r.type)}</ToneBadge>
                        </td>
                        <td className="max-w-80 px-2 py-1.5">
                          <RichText text={r.body} className="line-clamp-2" />
                          {err && <p className="text-destructive mt-1 font-medium">{err.message}</p>}
                          {warns.map((w) => (
                            <p key={w.message} className="mt-1 text-amber-700 dark:text-amber-300">
                              {w.message}
                            </p>
                          ))}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{r.options.length || '-'}</td>
                        <td className="max-w-32 truncate px-2 py-1.5">
                          {r.type === 'mcq' ? (r.answer ?? '-') : r.answer ? t('guide') : '-'}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {report && report.duplicates > 0 && (
              <p className="text-muted-foreground text-xs">{t('duplicatesNote', { n: report.duplicates })}</p>
            )}
            {hasProblems && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="imp-skip"
                  checked={skipInvalid}
                  onCheckedChange={(v) => setSkipInvalid(v === true)}
                />
                <Label htmlFor="imp-skip">{t('skipInvalid', { n: report?.invalid ?? 0 })}</Label>
              </div>
            )}
          </div>
        )}
      </div>
    </FormDialog>
  );
}
