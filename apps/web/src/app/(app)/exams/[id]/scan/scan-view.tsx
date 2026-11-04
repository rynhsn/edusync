'use client';

import { OMR_MAX_OPTIONS, OMR_MAX_QUESTIONS, omrFits, omrParseQr } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, ScanLine, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { loadScan } from '@/lib/omr/load';
import { scanSheet } from '@/lib/omr/scan';
import type { CellFlag, OverlayBubble, ScanResult } from '@/lib/omr/types';
import { cn } from '@/lib/utils';

const BATCH = 50;

type Problem = 'unreadable' | 'noStudent' | 'duplicate' | 'unresolved';

interface Sheet {
  id: string;
  fileName: string;
  status: 'scanning' | 'done' | 'error';
  result: ScanResult | null;
  preview: HTMLCanvasElement | null;
  /** Pratinjau / gambar yang dipindai. */
  previewScale: number;
  studentId: string;
  qrNote: 'ok' | 'missing' | 'otherExam' | 'unknown';
  answers: (string | null)[];
  /** Soal yang sudah ditinjau/diubah guru (menghapus tanda `multiple`). */
  edited: number[];
  applied: boolean;
}

const FLAG_STYLE: Record<CellFlag, string> = {
  ok: 'bg-muted/40',
  faint: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100',
  multiple: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100',
  blank: 'bg-muted/40 text-muted-foreground',
};

/** Foto lembar dengan lingkaran hijau (terisi) atau kuning (perlu dicek) di atas gelembung yang terdeteksi. */
function SheetCanvas({
  preview,
  scale,
  overlay,
  flags,
}: {
  preview: HTMLCanvasElement;
  scale: number;
  overlay: OverlayBubble[];
  flags: CellFlag[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = preview.width;
    canvas.height = preview.height;
    ctx.drawImage(preview, 0, 0);
    for (const b of overlay) {
      if (!b.marked) continue;
      const ok = (flags[b.question] ?? 'ok') === 'ok';
      ctx.beginPath();
      ctx.arc(b.x * scale, b.y * scale, Math.max(3, b.r * scale * 1.1), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, b.r * scale * 0.3);
      ctx.strokeStyle = ok ? '#16a34a' : '#f59e0b';
      ctx.stroke();
    }
  }, [preview, scale, overlay, flags]);
  return <canvas ref={ref} className="h-auto w-full rounded-lg border" />;
}

/** Pindai lembar jawaban pilihan ganda (foto atau hasil pindai), cek, lalu terapkan ke lembar nilai ujian. */
export function ScanView({ id }: { id: string }) {
  const t = useTranslations('examScan');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const author = can('exam:author');

  const sheet = useQuery({
    queryKey: ['exam-scoresheet', school.schoolId, id],
    queryFn: async () =>
      unwrap(await api.GET('/v1/exams/{id}/scoresheet', { params: { ...header, path: { id } } })),
  });

  const mcq = useMemo(() => (sheet.data?.questions ?? []).filter((q) => q.type === 'mcq'), [sheet.data]);
  const optionCount = Math.max(0, ...mcq.map((q) => q.optionKeys.length));
  const fits = omrFits(mcq.length, optionCount);
  const roster = sheet.data?.students ?? [];

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = (sid: string, fn: (s: Sheet) => Sheet) =>
    setSheets((prev) => prev.map((s) => (s.id === sid ? fn(s) : s)));

  async function processFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 || mcq.length === 0) return;
    setProgress({ done: 0, total: images.length });
    for (const [i, file] of images.entries()) {
      const sid = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      setSheets((prev) => [
        ...prev,
        {
          id: sid,
          fileName: file.name,
          status: 'scanning',
          result: null,
          preview: null,
          previewScale: 1,
          studentId: '',
          qrNote: 'missing',
          answers: [],
          edited: [],
          applied: false,
        },
      ]);
      try {
        const { gray, preview } = await loadScan(file);
        await new Promise((r) => setTimeout(r, 0)); // beri napas ke UI antara dua lembar
        const result = scanSheet(gray, { questions: mcq.length, options: optionCount });
        const qr = result.qr ? omrParseQr(result.qr) : null;
        let studentId = '';
        let qrNote: Sheet['qrNote'] = 'missing';
        if (qr) {
          if (qr.examId !== id.toLowerCase()) qrNote = 'otherExam';
          else if (roster.some((s) => s.studentId.toLowerCase() === qr.studentId)) {
            qrNote = 'ok';
            studentId = roster.find((s) => s.studentId.toLowerCase() === qr.studentId)?.studentId ?? '';
          } else qrNote = 'unknown';
        }
        patch(sid, (s) => ({
          ...s,
          status: 'done',
          result,
          preview,
          previewScale: preview.width / gray.width,
          studentId,
          qrNote,
          answers: result.answers,
        }));
      } catch {
        patch(sid, (s) => ({ ...s, status: 'error' }));
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
  }

  const dupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sheets) if (s.studentId && !s.applied) m.set(s.studentId, (m.get(s.studentId) ?? 0) + 1);
    return m;
  }, [sheets]);

  function problemOf(s: Sheet): Problem | null {
    if (s.status !== 'done' || !s.result || (!s.result.ok && s.result.reason !== 'blank'))
      return 'unreadable';
    if (!s.studentId) return 'noStudent';
    if ((dupCount.get(s.studentId) ?? 0) > 1) return 'duplicate';
    const flags = s.result.flags;
    if (flags.some((f, q) => f === 'multiple' && !s.edited.includes(q))) return 'unresolved';
    return null;
  }

  const pending = sheets.filter((s) => !s.applied && s.status !== 'scanning');
  const ready = pending.filter((s) => problemOf(s) === null);
  const attention = pending.filter((s) => problemOf(s) !== null);
  const matched = pending.filter((s) => s.studentId).length;

  const apply = useMutation({
    mutationFn: async () => {
      const records = ready.map((s) => ({
        studentId: s.studentId,
        absent: false,
        answers: mcq.map((q, i) => {
          const letter = s.answers[i] ?? null;
          const idx = letter ? letter.charCodeAt(0) - 65 : -1;
          return { questionId: q.id, answer: idx >= 0 ? (q.optionKeys[idx] ?? null) : null };
        }),
      }));
      for (let i = 0; i < records.length; i += BATCH) {
        await unwrap(
          await api.PUT('/v1/exams/{id}/scoresheet', {
            params: { ...header, path: { id } },
            body: { records: records.slice(i, i + BATCH) },
          }),
        );
      }
      return records.length;
    },
    onSuccess: (n) => {
      const done = new Set(ready.map((s) => s.id));
      setSheets((prev) => prev.map((s) => (done.has(s.id) ? { ...s, applied: true } : s)));
      queryClient.invalidateQueries({ queryKey: ['exam-scoresheet', school.schoolId, id] });
      toast.success(t('appliedToast', { n }));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const cycle = (sid: string, q: number) =>
    patch(sid, (s) => {
      const cur = s.answers[q] ?? null;
      const idx = cur ? cur.charCodeAt(0) - 65 : -1;
      const next = idx + 1 < optionCount ? String.fromCharCode(65 + idx + 1) : null;
      return {
        ...s,
        answers: s.answers.map((a, i) => (i === q ? next : a)),
        edited: s.edited.includes(q) ? s.edited : [...s.edited, q],
      };
    });

  const unsupported = sheet.data && (mcq.length === 0 || !fits.ok);
  const unsupportedText =
    mcq.length === 0
      ? t('noMcq')
      : !fits.ok && fits.reason === 'questions'
        ? t('tooManyQuestions', { max: OMR_MAX_QUESTIONS })
        : t('tooManyOptions', { max: OMR_MAX_OPTIONS });

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/scores`} />}>
              {t('goToScores')}
            </Button>
            <BackLink href={`/exams/${id}`} />
          </>
        }
      />

      {sheet.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {sheet.isPending && <Skeleton className="h-40 rounded-2xl" />}
      {unsupported && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{unsupportedText}</AlertDescription>
        </Alert>
      )}
      {!author && sheet.data && <p className="text-muted-foreground text-sm">{t('readOnly')}</p>}

      {sheet.data && !unsupported && author && (
        // biome-ignore lint/a11y/noStaticElementInteractions: area seret-lepas; tombol pilih berkas tersedia di dalamnya.
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            processFiles([...e.dataTransfer.files]);
          }}
          className={cn(
            'bg-card grid justify-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          <ImageUp className="text-muted-foreground size-9" aria-hidden />
          <p className="font-heading font-semibold">{t('dropTitle')}</p>
          <p className="text-muted-foreground max-w-md text-sm">{t('dropHint', { questions: mcq.length })}</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={t('choose')}
            onChange={(e) => {
              processFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={!!progress}>
            <ScanLine className="size-4" aria-hidden /> {t('choose')}
          </Button>
          {progress && (
            <p role="status" aria-live="polite" className="text-muted-foreground text-sm tabular-nums">
              {t('processing', { done: progress.done, total: progress.total })}
            </p>
          )}
        </div>
      )}

      {sheets.length > 0 && (
        <>
          <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border p-3 text-sm">
            <span>{t('summaryScanned', { n: sheets.length })}</span>
            <span>{t('summaryMatched', { n: matched })}</span>
            <span className={cn(attention.length > 0 && 'font-semibold text-amber-700 dark:text-amber-300')}>
              {t('summaryAttention', { n: attention.length })}
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                disabled={!author || ready.length === 0 || apply.isPending}
                onClick={() => apply.mutate()}
              >
                {apply.isPending ? t('applying') : t('apply', { n: ready.length })}
              </Button>
            </span>
          </div>

          {attention.length > 0 && (
            <Alert role="status">
              <AlertDescription>
                <p className="font-medium">{t('skippedTitle')}</p>
                <ul className="mt-1 list-disc pl-5">
                  {attention.map((s) => (
                    <li key={s.id}>
                      {s.fileName}: {t(`problem.${problemOf(s) as Problem}`)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <ul className="grid gap-3">
            {sheets.map((s) => {
              const problem = s.applied ? null : problemOf(s);
              return (
                <li
                  key={s.id}
                  className={cn(
                    'bg-card grid gap-3 rounded-2xl border p-3 md:grid-cols-[14rem_1fr]',
                    s.applied && 'opacity-60',
                  )}
                >
                  <div>
                    {s.preview && s.result ? (
                      <SheetCanvas
                        preview={s.preview}
                        scale={s.previewScale}
                        overlay={s.result.overlay}
                        flags={s.result.flags}
                      />
                    ) : (
                      <Skeleton className="aspect-[3/4] rounded-lg" />
                    )}
                  </div>
                  <div className="grid min-w-0 content-start gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.fileName}</span>
                      {s.applied && <ToneBadge tone="emerald">{t('appliedBadge')}</ToneBadge>}
                      {problem && <ToneBadge tone="amber">{t(`problem.${problem}`)}</ToneBadge>}
                      {s.status === 'scanning' && <ToneBadge tone="slate">{t('scanning')}</ToneBadge>}
                      {s.result?.reason === 'blank' && <ToneBadge tone="slate">{t('allBlank')}</ToneBadge>}
                      {s.qrNote === 'otherExam' && <ToneBadge tone="rose">{t('qrOtherExam')}</ToneBadge>}
                      {s.qrNote === 'unknown' && <ToneBadge tone="rose">{t('qrUnknown')}</ToneBadge>}
                      {s.status === 'done' && s.qrNote === 'missing' && (
                        <ToneBadge tone="slate">{t('qrMissing')}</ToneBadge>
                      )}
                      {!s.applied && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto"
                          aria-label={t('remove', { name: s.fileName })}
                          onClick={() => setSheets((prev) => prev.filter((x) => x.id !== s.id))}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>

                    {s.status === 'done' && s.result && (
                      <>
                        <div className="max-w-sm">
                          <SelectField
                            aria-label={t('student')}
                            value={s.studentId}
                            disabled={s.applied}
                            onChange={(e) => patch(s.id, (x) => ({ ...x, studentId: e.target.value }))}
                          >
                            <option value="">{t('pickStudent')}</option>
                            {roster.map((r) => (
                              <option key={r.studentId} value={r.studentId}>
                                {r.name} · {r.className}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        {!s.result.ok && s.result.reason === 'markers' ? (
                          <p className="text-muted-foreground text-sm">{t('notReadable')}</p>
                        ) : (
                          <div>
                            <p className="text-muted-foreground mb-1 text-xs">{t('tapToChange')}</p>
                            <ul className="flex flex-wrap gap-1">
                              {mcq.map((q, i) => {
                                const flag = s.result?.flags[i] ?? 'ok';
                                const edited = s.edited.includes(i);
                                const shown: CellFlag = edited ? 'ok' : flag;
                                return (
                                  <li key={q.id}>
                                    <button
                                      type="button"
                                      disabled={s.applied}
                                      onClick={() => cycle(s.id, i)}
                                      aria-label={t('cellLabel', { n: i + 1, answer: s.answers[i] ?? '-' })}
                                      className={cn(
                                        'focus-visible:ring-ring/50 flex h-8 min-w-[3.1rem] items-center justify-center gap-1 rounded-md px-1.5 text-xs outline-none focus-visible:ring-3',
                                        FLAG_STYLE[shown],
                                      )}
                                    >
                                      <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                                      <span className="font-semibold">{s.answers[i] ?? '·'}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="text-muted-foreground mt-2 text-xs">{t('legend')}</p>
                          </div>
                        )}
                      </>
                    )}
                    {s.status === 'error' && <p className="text-destructive text-sm">{t('loadFailed')}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sheets.length === 0 && sheet.data && !unsupported && !progress && (
        <EmptyPanel icon={ScanLine} tone="violet" title={t('emptyTitle')} body={t('emptyBody')} />
      )}
    </PageBody>
  );
}
