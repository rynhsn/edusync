'use client';

import type { ExportDataset, ExportFormat } from '@edusync/contracts';
import { EXPORT_COLUMNS, EXPORT_DATASETS, EXPORT_FORMAT_NAME, EXPORT_FORMATS } from '@edusync/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, FileDown, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton, MonoText } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  cellText,
  datasetNeedsGrades,
  datasetNeedsSemester,
  downloadExport,
  exportReady,
  fetchExportJson,
  PREVIEW_ROWS,
} from '@/lib/export';

/** Ekspor akademik generik: pilih tahun ajaran, dataset, dan format; unduh berkas, lihat pratinjau dan kamus kolom. */
export function ExportsView() {
  const t = useTranslations('exports');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const allowed = can('data_export:run');

  const [yearChoice, setYearChoice] = useState('');
  const [semesterChoice, setSemesterChoice] = useState('');
  const [dataset, setDataset] = useState<ExportDataset>('rombel');
  const [format, setFormat] = useState<ExportFormat>('csv');

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed && can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearList = years.data ?? [];
  const yearId =
    yearList.find((y) => y.id === yearChoice)?.id ??
    yearList.find((y) => y.isActive)?.id ??
    yearList[0]?.id ??
    '';

  const needsSemester = datasetNeedsSemester(dataset);
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, yearId],
    enabled: allowed && !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const semesterList = semesters.data ?? [];
  const semesterId =
    semesterList.find((s) => s.id === semesterChoice)?.id ??
    semesterList.find((s) => s.isActive)?.id ??
    semesterList[0]?.id ??
    '';

  const request = { academicYearId: yearId, semesterId: needsSemester ? semesterId : undefined, dataset };
  const ready = exportReady(request);

  const preview = useQuery({
    queryKey: ['export-preview', school.schoolId, request.academicYearId, request.semesterId ?? '', dataset],
    enabled: allowed && ready,
    retry: false,
    queryFn: ({ signal }) => fetchExportJson(school.schoolId, request, signal),
  });

  const download = useMutation({
    mutationFn: () => downloadExport(school.schoolId, { ...request, format }),
    onSuccess: (name) => toast.success(t('downloaded', { name })),
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={FileDown}
          tone={MODULE_TONE.academic}
          title={t('title')}
          description={t('subtitle')}
        />
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  const columns = EXPORT_COLUMNS[dataset];
  const rows = preview.data?.rows ?? [];
  const shown = rows.slice(0, PREVIEW_ROWS);
  const noSemester = needsSemester && semesters.data !== undefined && semesterList.length === 0;

  return (
    <PageBody>
      <PageHeader
        icon={FileDown}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
      />

      <section
        aria-labelledby="ex-notice-title"
        className="rounded-xl border-2 border-amber-500/60 bg-amber-50 p-4 text-amber-950 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-100"
      >
        <h2 id="ex-notice-title" className="flex items-start gap-2 text-base font-semibold">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          {t('noticeTitle')}
        </h2>
        <p className="mt-2 text-sm">{t('noticeFormat', { format: EXPORT_FORMAT_NAME })}</p>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
          <li>{t('noticeNotOfficial')}</li>
          <li>{t('noticeNik')}</li>
          <li>{t('noticeFinalOnly')}</li>
        </ul>
      </section>

      {years.isPending && <ListSkeleton rows={2} stats={0} />}
      {years.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(years.error))}</AlertDescription>
        </Alert>
      )}
      {years.data && yearList.length === 0 && (
        <EmptyPanel
          icon={CalendarDays}
          tone={MODULE_TONE.academic}
          title={t('noYears')}
          body={t('noYearsBody')}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/academic-years" />}>
              {t('yearsLink')}
            </Button>
          }
        />
      )}

      {years.data && yearList.length > 0 && (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="ex-year">{t('year')}</Label>
              <SelectField
                id="ex-year"
                className={TOUCH_SELECT}
                value={yearId}
                onChange={(e) => {
                  setYearChoice(e.target.value);
                  setSemesterChoice('');
                }}
              >
                {yearList.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="ex-dataset">{t('dataset')}</Label>
              <SelectField
                id="ex-dataset"
                className={TOUCH_SELECT}
                value={dataset}
                onChange={(e) => setDataset(e.target.value as ExportDataset)}
              >
                {EXPORT_DATASETS.map((d) => (
                  <option key={d} value={d}>
                    {t(`datasets.${d}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            {needsSemester && (
              <div className="grid min-w-0 content-start gap-2">
                <Label htmlFor="ex-semester">{t('semester')}</Label>
                <SelectField
                  id="ex-semester"
                  className={TOUCH_SELECT}
                  value={semesterId}
                  disabled={semesterList.length === 0}
                  onChange={(e) => setSemesterChoice(e.target.value)}
                >
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="ex-format">{t('format')}</Label>
              <SelectField
                id="ex-format"
                className={TOUCH_SELECT}
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(`formats.${f}`)}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <div className="grid gap-1">
            <p className="text-sm">{t(`datasetHints.${dataset}`)}</p>
            {datasetNeedsGrades(dataset) && (
              <p className="text-muted-foreground text-sm">{t('needsGrades')}</p>
            )}
            {noSemester && <p className="text-destructive text-sm">{t('noSemester')}</p>}
          </div>

          <div>
            <Button
              className="max-sm:min-h-11 max-sm:w-full"
              disabled={!ready || download.isPending}
              onClick={() => download.mutate()}
            >
              <FileDown className="size-4" /> {download.isPending ? t('preparing') : t('download')}
            </Button>
          </div>

          {download.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(download.error))}</AlertDescription>
            </Alert>
          )}

          <section aria-labelledby="ex-preview-title" className="grid min-w-0 gap-2">
            <h2 id="ex-preview-title" className="font-heading text-lg font-semibold">
              {t('previewTitle')}
            </h2>
            {ready && preview.isPending && <ListSkeleton rows={3} stats={0} />}
            {preview.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(preview.error))}</AlertDescription>
              </Alert>
            )}
            {preview.data && shown.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('previewEmpty')}</p>
            )}
            {preview.data && shown.length > 0 && (
              <>
                <p className="text-muted-foreground text-sm">
                  {t('previewCount', { shown: shown.length, total: rows.length })}
                </p>
                <div className="bg-card max-w-full min-w-0 overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.data.columns.map((c) => (
                          <TableHead key={c.key} className="whitespace-nowrap">
                            <MonoText>{c.key}</MonoText>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((r, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: baris pratinjau tidak punya kunci unik
                        <TableRow key={i}>
                          {preview.data.columns.map((c) => (
                            <TableCell key={c.key} className="whitespace-nowrap">
                              {cellText(r[c.key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="ex-dict-title" className="grid min-w-0 gap-2">
            <h2 id="ex-dict-title" className="font-heading text-lg font-semibold">
              {t('dictTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('dictIntro', { format: EXPORT_FORMAT_NAME })}</p>
            <div className="bg-card max-w-full min-w-0 overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colKey')}</TableHead>
                    <TableHead>{t('colDescription')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="align-top break-all">
                        <MonoText>{c.key}</MonoText>
                      </TableCell>
                      <TableCell className="min-w-48 align-top whitespace-normal">{c.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground text-xs">{t('dictNote')}</p>
          </section>
        </>
      )}
    </PageBody>
  );
}
