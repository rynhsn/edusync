'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

const CONCURRENCY = 4;
const PAGE = 100;

/** Hanya lembar kartu yang tercetak: semua yang lain (menu, kepala halaman) disembunyikan. */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .qr-print-sheet, .qr-print-sheet * { visibility: visible !important; }
  .qr-print-sheet { position: absolute; left: 0; top: 0; width: 100%; }
  @page { margin: 10mm; }
}`;

function QrImage({ code, label }: { code: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(code, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [code]);
  if (!src) return <div className="bg-muted size-28 animate-pulse" />;
  // biome-ignore lint/performance/noImgElement: data URL lokal, tidak perlu optimasi gambar
  return <img src={src} alt={label} className="size-28" />;
}

export function PrintCardsView() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [classId, setClassId] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'class-all', classId],
    enabled: !!classId,
    queryFn: async () => {
      const all: NonNullable<Awaited<ReturnType<typeof fetchPage>>>['items'] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await fetchPage(offset);
        all.push(...page.items);
        if (all.length >= page.total || page.items.length === 0) break;
      }
      return all.filter((s) => s.status === 'active');
    },
  });
  async function fetchPage(offset: number) {
    return unwrap(
      await api.GET('/v1/students', { params: { ...header, query: { classId, limit: PAGE, offset } } }),
    );
  }
  const cards = useQuery({
    queryKey: ['attendance-cards', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/cards', { params: { ...header, query: {} } })),
  });

  const qrByStudent = new Map<string, string>();
  for (const c of cards.data ?? []) if (c.kind === 'qr' && c.active) qrByStudent.set(c.studentId, c.code);
  const missing = (students.data ?? []).filter((s) => !qrByStudent.has(s.id));
  const sheet = (students.data ?? []).filter((s) => qrByStudent.has(s.id));
  const className = classes.data?.find((c) => c.id === classId)?.name ?? '';

  const generate = useMutation({
    mutationFn: async () => {
      const queue = [...missing];
      let done = 0;
      let failed = 0;
      setProgress({ done: 0, total: queue.length });
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          try {
            unwrap(
              await api.POST('/v1/attendance/cards', {
                params: header,
                body: { studentId: s.id, kind: 'qr' },
              }),
            );
          } catch {
            failed++;
          }
          done++;
          setProgress({ done, total: done + queue.length });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      if (failed > 0) toast.error(t('printQr.partial', { failed, count: done }));
      else toast.success(t('printQr.created', { count: done }));
    },
    onError: (e) => toast.error(te(errorKey(e))),
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });
    },
  });

  if (!can('attendance:configure')) {
    return (
      <PageBody>
        <PageHeader title={t('printQr.title')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title={t('printQr.title')}
        description={t('printQr.subtitle')}
        actions={
          <Link href="/attendance-settings" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeft className="size-4" /> {t('back')}
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2 sm:w-56">
          <Label htmlFor="print-class">{t('class')}</Label>
          <SelectField id="print-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('printQr.chooseClass')}</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Button
          variant="outline"
          disabled={!classId || missing.length === 0 || generate.isPending || students.isPending}
          onClick={() => generate.mutate()}
        >
          <QrCode className="size-4" />
          {progress
            ? t('printQr.progress', { done: progress.done, total: progress.total })
            : t('printQr.generate')}
        </Button>
        <Button disabled={sheet.length === 0} onClick={() => window.print()}>
          <Printer className="size-4" /> {t('printQr.print')}
        </Button>
      </div>

      {classId && missing.length > 0 && !generate.isPending && (
        <p className="text-muted-foreground text-sm">{t('printQr.missing', { count: missing.length })}</p>
      )}
      {!classId && <p className="text-muted-foreground text-sm">{t('printQr.pickHint')}</p>}
      {classId && (students.isPending || cards.isPending) && <Skeleton className="h-48 w-full" />}
      {classId && students.data && cards.data && sheet.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('printQr.empty')}</p>
      )}

      {sheet.length > 0 && (
        <div className="qr-print-sheet grid grid-cols-2 gap-3 md:grid-cols-3">
          {sheet.map((s) => (
            <div
              key={s.id}
              className="grid break-inside-avoid justify-items-center gap-1 rounded-lg border bg-white p-3 text-center text-black"
            >
              <div className="text-xs font-semibold">{school.schoolName}</div>
              <QrImage code={qrByStudent.get(s.id) ?? ''} label={s.name} />
              <div className="text-sm leading-tight font-semibold">{s.name}</div>
              <div className="text-xs">
                {s.className ?? className}
                {s.nis ? ` · ${s.nis}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageBody>
  );
}
