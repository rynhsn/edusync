'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { SheetData } from '../../paper/exam-sheet';
import { OmrPages, OmrPrintPortal, omrCounts, omrPages, omrSupport } from '../../paper/omr-sheet';

/** Pratinjau + kendali tab "Lembar OMR"; mengabarkan induk lewat `onPrintable` apakah ada halaman yang boleh dicetak. */
export function OmrPanel({
  id,
  data,
  onPrintable,
}: {
  id: string;
  data: SheetData;
  onPrintable: (ok: boolean) => void;
}) {
  const t = useTranslations('examOmr');
  const { school } = useSchool();
  const [classId, setClassId] = useState('');
  const [withBlank, setWithBlank] = useState(false);
  const [blank, setBlank] = useState('5');

  const sheet = useQuery({
    queryKey: ['exam-scoresheet', school.schoolId, id],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exams/{id}/scoresheet', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
  });

  const students = sheet.data?.students ?? [];
  const { mcqCount, optionCount } = useMemo(() => omrCounts(sheet.data?.questions ?? []), [sheet.data]);
  const support = omrSupport(mcqCount, optionCount);
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) seen.set(s.classId, s.className);
    return [...seen.entries()];
  }, [students]);
  const pages = useMemo(
    () => omrPages(students, classId, withBlank ? Number(blank) || 0 : 0),
    [students, classId, withBlank, blank],
  );
  const printable = support.ok && mcqCount > 0 && pages.length > 0;
  useEffect(() => onPrintable(printable), [printable, onPrintable]);

  if (sheet.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  if (!sheet.data) return <Skeleton className="h-96 rounded-2xl" />;

  if (!support.ok) {
    return (
      <Alert>
        <AlertDescription>
          {support.reason === 'questions'
            ? t('unsupportedQuestions', { n: mcqCount, max: 100 })
            : t('unsupportedOptions', { max: 5 })}
        </AlertDescription>
      </Alert>
    );
  }
  if (mcqCount === 0) {
    return (
      <Alert>
        <AlertDescription>{t('noMcq')}</AlertDescription>
      </Alert>
    );
  }

  const shared = {
    examId: id,
    schoolName: data.school.officialName || data.school.name,
    examTitle: data.exam.title,
    subjectName: data.exam.subjectName,
    classNames: data.exam.classNames.join(', '),
    mcqCount,
    optionCount,
  };

  return (
    <>
      <div className="bg-card flex flex-wrap items-end gap-4 rounded-xl border p-3">
        <div className="grid w-48 gap-1.5">
          <Label htmlFor="omr-class">{t('classFilter')}</Label>
          <SelectField id="omr-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('allClasses')}</option>
            {classes.map(([cid, name]) => (
              <option key={cid} value={cid}>
                {name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            id="omr-blank"
            type="checkbox"
            className="size-4"
            checked={withBlank}
            onChange={(e) => setWithBlank(e.target.checked)}
          />
          <Label htmlFor="omr-blank">{t('includeBlank')}</Label>
        </div>
        {withBlank && (
          <div className="grid w-28 gap-1.5">
            <Label htmlFor="omr-blank-n">{t('blankCount')}</Label>
            <Input
              id="omr-blank-n"
              type="number"
              min={0}
              max={200}
              value={blank}
              onChange={(e) => setBlank(e.target.value)}
            />
          </div>
        )}
        <p className="ml-auto pb-2 text-sm font-medium tabular-nums">
          {t('sheetCount', { n: pages.length })}
        </p>
      </div>
      <p className="text-muted-foreground text-xs">{t('hint')}</p>
      {students.length === 0 && !withBlank && (
        <Alert>
          <AlertDescription>{t('noStudents')}</AlertDescription>
        </Alert>
      )}
      {pages[0] && (
        <div className="bg-muted/60 max-h-[80vh] overflow-auto rounded-xl border p-3">
          <div style={{ zoom: 0.6 }} className="mx-auto w-fit shadow-md">
            <OmrPages pages={[pages[0]]} {...shared} />
          </div>
        </div>
      )}
      {printable && <OmrPrintPortal pages={pages} {...shared} />}
    </>
  );
}
