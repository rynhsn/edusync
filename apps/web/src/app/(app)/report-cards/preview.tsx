'use client';

import { useTranslations } from 'next-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TONES, ToneBadge, UserAvatar } from '@/components/ui-kit';
import { formatKkm } from '@/lib/kktp';
import { cn } from '@/lib/utils';
import { PredicateBadge, ScoreChip } from '../grades/grade-ui';
import { formatGrade } from './pdf/format';
import type { ReportCardDoc } from './pdf/types';

/** Isi pratinjau rapor: identitas, tabel nilai, ekstrakurikuler, ketidakhadiran, catatan wali kelas, dan peringkat. */
export function ReportCardPreview({ doc }: { doc: ReportCardDoc }) {
  const t = useTranslations('reportCards');
  const { student, semester } = doc;

  return (
    <div className="grid gap-5 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-violet-50 p-4 dark:bg-violet-500/10">
        <div className="flex min-w-0 items-center gap-3.5">
          <UserAvatar name={student.name} size="lg" />
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold">{student.name}</p>
            <p className="text-muted-foreground">
              {[student.nis && `${t('nis')} ${student.nis}`, student.className].filter(Boolean).join(' · ')}
            </p>
            <p className="text-muted-foreground">
              {semester.name} · {semester.academicYear}
            </p>
          </div>
        </div>
        <ToneBadge tone={doc.status === 'final' ? 'emerald' : 'amber'}>
          {t(doc.status === 'final' ? 'statusFinal' : 'statusDraft')}
        </ToneBadge>
      </div>

      <section className="grid content-start gap-2">
        <h3 className="font-medium">{t('subjectsTitle')}</h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table className="max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden">
            <TableHeader>
              <TableRow>
                <TableHead>{t('subject')}</TableHead>
                <TableHead className="text-right">{t('kkm')}</TableHead>
                <TableHead className="text-right">{t('finalScore')}</TableHead>
                <TableHead>{t('predicate')}</TableHead>
                <TableHead>{t('description')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.subjects.map((s) => (
                <TableRow
                  key={s.subjectId}
                  className="max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-3"
                >
                  <TableCell className="font-medium max-md:col-start-1 max-md:row-start-1 max-md:p-0 max-md:whitespace-normal">
                    {s.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:text-left max-md:text-muted-foreground">
                    <span className="md:hidden">{t('kkm')}: </span>
                    {formatKkm(s.kkm)}
                  </TableCell>
                  <TableCell className="text-right max-md:col-start-2 max-md:row-start-1 max-md:p-0">
                    <ScoreChip predicate={s.predicate} below={s.belowKkm}>
                      {formatGrade(s.final)}
                    </ScoreChip>
                  </TableCell>
                  <TableCell className="max-md:col-start-2 max-md:row-start-2 max-md:p-0 max-md:text-right">
                    {s.predicate ? <PredicateBadge predicate={s.predicate} /> : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground min-w-48 whitespace-normal max-md:col-span-2 max-md:min-w-0 max-md:p-0 max-md:text-xs">
                    {s.description ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid content-start gap-2">
        <h3 className="font-medium">{t('extracurriculars')}</h3>
        {doc.extracurriculars.length === 0 ? (
          <p className="text-muted-foreground">{t('noExtracurriculars')}</p>
        ) : (
          <ul className="grid content-start gap-1">
            {doc.extracurriculars.map((x) => (
              <li key={x.name}>
                <span className="font-medium">{x.name}</span>
                {x.predicate && <span> · {x.predicate}</span>}
                {x.note && <span className="text-muted-foreground"> · {x.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid content-start gap-2">
        <h3 className="font-medium">{t('attendance')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['sick', 'excused', 'absent'] as const).map((k) => (
            <div
              key={k}
              className={cn(
                'rounded-xl p-3',
                TONES[k === 'sick' ? 'amber' : k === 'excused' ? 'sky' : 'rose'].soft,
              )}
            >
              <p className="text-xs opacity-80">{t(`att_${k}`)}</p>
              <p className="font-heading text-xl font-semibold tabular-nums">{doc.attendance[k]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid content-start gap-2">
        <h3 className="font-medium">{t('homeroomNote')}</h3>
        <p className={doc.homeroomNote ? 'whitespace-pre-wrap' : 'text-muted-foreground'}>
          {doc.homeroomNote ?? t('noteEmpty')}
        </p>
      </section>

      {doc.rank && (
        <p className="font-medium">{t('rank', { position: doc.rank.position, of: doc.rank.of })}</p>
      )}

      <div className="text-muted-foreground grid gap-1 sm:grid-cols-2">
        <p>
          {t('homeroomTeacher')}: {doc.homeroomTeacher?.name ?? '-'}
        </p>
        <p>
          {t('principal')}: {doc.principal?.name ?? '-'}
        </p>
      </div>
    </div>
  );
}
