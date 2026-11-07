'use client';

import type { CardData, CardKind, CardLayout } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Download, Printer, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { hasAttendanceQr, sampleCardData } from '@/lib/cards/elements';
import { cardsFileName, MAX_CARDS_PER_PDF, percent } from '@/lib/cards/print-model';
import {
  bestSheetGrid,
  DEFAULT_SHEET,
  pagesNeeded,
  type SheetOptions,
  type SheetPaper,
} from '@/lib/cards/sheet-layout';
import { errorKey } from '@/lib/errors';
import { CheckField } from './check-field';
import { NumberField } from './editor/number-field';
import { CardPreview } from './element-preview';
import { type CardSource, type PrintProgress, renderCardsPdf, saveCardsPdf } from './pdf/download';
import { useFieldLabel } from './use-field-label';

/** Templat yang siap dicetak (tersimpan, atau bawaan sistem bila sekolah belum menyimpan apa pun). */
export interface PrintTemplate {
  id: string;
  name: string;
  layout: CardLayout;
  backgroundPath: string | null;
  isSystem: boolean;
}

interface Props {
  kind: CardKind;
  templates: PrintTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Cetak: pilih templat dan kelas (atau semester untuk kartu ujian), lihat pratinjau, lalu unduh PDF. */
export function PrintPanel({ kind, templates, selectedId, onSelect }: Props) {
  const t = useTranslations('cards.print');
  const tc = useTranslations('cards');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const fieldLabel = useFieldLabel();

  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [classId, setClassId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [mode, setMode] = useState<'single' | 'sheet'>('sheet');
  const [sheet, setSheet] = useState<SheetOptions>(DEFAULT_SHEET);
  const [progress, setProgress] = useState<PrintProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const year =
    years.data?.find((y) => y.id === yearId) ?? years.data?.find((y) => y.isActive) ?? years.data?.[0];

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, year?.id],
    enabled: !!year,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: year?.id } } })),
  });

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, year?.id],
    enabled: kind === 'exam' && !!year,
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: year?.id } } })),
  });
  const semester =
    semesters.data?.find((s) => s.id === semesterId) ??
    semesters.data?.find((s) => s.isActive) ??
    semesters.data?.[0];

  const types = useQuery({
    queryKey: ['exam-types', school.schoolId],
    enabled: kind === 'exam',
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });

  const template = templates.find((x) => x.id === selectedId) ?? templates[0];
  const klass = classes.data?.find((c) => c.id === classId);

  const data = useQuery({
    queryKey: ['card-data', school.schoolId, kind, classId, semester?.id, typeId],
    enabled: !!classId && (kind === 'student' || !!semester),
    queryFn: async () => {
      if (kind === 'student') {
        return unwrap(await api.GET('/v1/cards/students', { params: { ...header, query: { classId } } }));
      }
      return unwrap(
        await api.GET('/v1/cards/exam-participants', {
          params: {
            ...header,
            query: { semesterId: semester?.id as string, classId, ...(typeId ? { examTypeId: typeId } : {}) },
          },
        }),
      );
    },
  });

  const items = (data.data?.items ?? []).slice(0, MAX_CARDS_PER_PDF);
  const withoutPhoto = items.filter((i) => !i.photoUrl).length;
  const grid = template ? bestSheetGrid(template.layout.widthMm, template.layout.heightMm, sheet) : null;
  const fits = !!grid && grid.perPage > 0;
  const sheets = grid ? pagesNeeded(items.length, grid.perPage) : 0;
  const busy = progress !== null;
  const canDownload = !!template && items.length > 0 && !busy && (mode === 'single' || fits);

  async function download() {
    if (!template) return;
    setError(null);
    const cards: CardSource[] = items.map((i) => ({
      data: i as unknown as CardData,
      photoPath: i.photoUrl,
    }));
    try {
      setProgress({ phase: 'assets', done: 0, total: 0 });
      const blob = await renderCardsPdf(
        {
          schoolId: school.schoolId,
          kind,
          title: template.name,
          layout: template.layout,
          backgroundPath: template.backgroundPath,
          cards,
          mode,
          sheet,
        },
        setProgress,
      );
      const label = kind === 'exam' ? `${klass?.name ?? ''} ${semester?.name ?? ''}` : (klass?.name ?? '');
      saveCardsPdf(blob, cardsFileName(kind, label, new Date().toISOString().slice(0, 10)));
      toast.success(t('done', { n: cards.length }));
    } catch (e) {
      setError(te(errorKey(e)));
    } finally {
      setProgress(null);
    }
  }

  const first = items[0];
  const sheetNumber = (key: 'margin' | 'gap') => (
    <NumberField
      aria-label={t(key)}
      value={sheet[key]}
      min={0}
      max={50}
      step={1}
      onChange={(v) => setSheet((s) => ({ ...s, [key]: v }))}
    />
  );

  return (
    <Card className="gap-5 px-4">
      <div>
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <Printer className="size-4" aria-hidden /> {t('title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t(kind === 'student' ? 'descStudent' : 'descExam')}
        </p>
      </div>

      {kind === 'student' && template && !hasAttendanceQr(template.layout) && (
        <Alert>
          <QrCode aria-hidden />
          <AlertDescription>{t('noQrNotice')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={t('template')} htmlFor="print-template">
          <SelectField
            id="print-template"
            value={template?.id ?? ''}
            onChange={(e) => onSelect(e.target.value)}
          >
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.isSystem ? `${x.name} (${tc('systemDefault')})` : x.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label={t('year')} htmlFor="print-year">
          <SelectField
            id="print-year"
            value={year?.id ?? ''}
            onChange={(e) => {
              setYearId(e.target.value);
              setSemesterId('');
              setClassId('');
            }}
          >
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </SelectField>
        </Field>
        {kind === 'exam' && (
          <Field label={t('semester')} htmlFor="print-semester">
            <SelectField
              id="print-semester"
              value={semester?.id ?? ''}
              onChange={(e) => setSemesterId(e.target.value)}
            >
              {(semesters.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </Field>
        )}
        <Field label={t('class')} htmlFor="print-class">
          <SelectField
            id="print-class"
            value={classId}
            placeholder={t('pickClass')}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">{t('pickClass')}</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </Field>
        {kind === 'exam' && (
          <Field label={t('examType')} htmlFor="print-type">
            <SelectField id="print-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t('allTypes')}</option>
              {(types.data ?? [])
                .filter((x) => x.active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </SelectField>
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={t('layoutMode')} htmlFor="print-mode">
          <SelectField
            id="print-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'single' | 'sheet')}
          >
            <option value="sheet">{t('modeSheet')}</option>
            <option value="single">{t('modeSingle')}</option>
          </SelectField>
        </Field>
        {mode === 'sheet' && (
          <>
            <Field label={t('paper')} htmlFor="print-paper">
              <SelectField
                id="print-paper"
                value={sheet.paper}
                onChange={(e) => setSheet((s) => ({ ...s, paper: e.target.value as SheetPaper }))}
              >
                {(['A4', 'F4', 'Letter', 'A3'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t('margin')}>{sheetNumber('margin')}</Field>
            <Field label={t('gap')}>{sheetNumber('gap')}</Field>
            <CheckField
              className="sm:col-span-2"
              checked={sheet.cropMarks}
              onChange={(c) => setSheet((s) => ({ ...s, cropMarks: c }))}
            >
              {t('cropMarks')} <span className="text-muted-foreground text-xs">{t('cropHint')}</span>
            </CheckField>
          </>
        )}
      </div>

      {mode === 'sheet' && grid && (
        <p className={`text-sm ${fits ? 'text-muted-foreground' : 'text-destructive'}`}>
          {fits
            ? t('gridInfo', { cols: grid.cols, rows: grid.rows, per: grid.perPage, sheets })
            : t('gridNoFit')}
        </p>
      )}

      {data.isError && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" aria-hidden />
          <AlertDescription>{te(errorKey(data.error))}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {classId && data.isLoading && <p className="text-muted-foreground text-sm">{t('loading')}</p>}

      {data.data && (
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          {template && (
            <CardPreview
              layout={template.layout}
              backgroundUrl={template.backgroundPath}
              data={(first as unknown as CardData | undefined) ?? sampleCardData(kind)}
              width={Math.min(300, template.layout.widthMm * 3.2)}
              fieldLabel={fieldLabel}
              className="rounded-md shadow ring-1 ring-black/15"
            />
          )}
          <div className="grid content-start gap-2 text-sm">
            <p className="font-medium">{t('count', { n: items.length })}</p>
            {first && 'participantNo' in first && (
              <p className="text-muted-foreground">{t('firstNo', { no: first.participantNo })}</p>
            )}
            {items.length === 0 && <p className="text-muted-foreground">{t('empty')}</p>}
            {withoutPhoto > 0 && <p className="text-muted-foreground">{t('noPhoto', { n: withoutPhoto })}</p>}
            {data.data.truncated && (
              <p className="text-amber-700 dark:text-amber-400">
                {t('truncated', { max: MAX_CARDS_PER_PDF })}
              </p>
            )}
            {kind === 'exam' && first && 'date' in first && !first.date && (
              <p className="text-amber-700 dark:text-amber-400">{t('noSchedule')}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={download} disabled={!canDownload}>
          <Download className="size-4" /> {busy ? t('working') : t('download')}
        </Button>
        {busy && progress && (
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <div
              role="progressbar"
              aria-label={t('progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.phase === 'assets' ? percent(progress.done, progress.total) : undefined}
              className="bg-muted h-2 max-w-xs flex-1 overflow-hidden rounded-full"
            >
              <div
                className={`bg-primary h-full rounded-full transition-all ${progress.phase === 'render' ? 'w-full animate-pulse' : ''}`}
                style={
                  progress.phase === 'assets'
                    ? { width: `${percent(progress.done, progress.total)}%` }
                    : undefined
                }
              />
            </div>
            <span className="text-muted-foreground text-xs">
              {progress.phase === 'assets'
                ? t('loadingImages', { done: progress.done, total: progress.total })
                : t('rendering')}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
