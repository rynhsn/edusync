'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatGrade } from './pdf/format';
import type { ReportCardDoc } from './pdf/types';

/** Isi pratinjau rapor: identitas, tabel nilai, ekstrakurikuler, ketidakhadiran, catatan wali kelas, dan peringkat. */
export function ReportCardPreview({ doc }: { doc: ReportCardDoc }) {
  const t = useTranslations('reportCards');
  const { student, semester } = doc;

  return (
    <div className="grid gap-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-lg font-semibold">{student.name}</p>
          <p className="text-muted-foreground">
            {[student.nis && `${t('nis')} ${student.nis}`, student.className].filter(Boolean).join(' · ')}
          </p>
          <p className="text-muted-foreground">
            {semester.name} · {semester.academicYear}
          </p>
        </div>
        <Badge variant={doc.status === 'final' ? 'secondary' : 'outline'}>
          {t(doc.status === 'final' ? 'statusFinal' : 'statusDraft')}
        </Badge>
      </div>

      <section className="grid gap-2">
        <h3 className="font-medium">{t('subjectsTitle')}</h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
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
                <TableRow key={s.subjectId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.kkm}</TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${s.belowKkm ? 'text-red-600' : ''}`}
                  >
                    {formatGrade(s.final)}
                  </TableCell>
                  <TableCell>{s.predicate ?? '-'}</TableCell>
                  <TableCell className="text-muted-foreground min-w-48 whitespace-normal">
                    {s.description ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="font-medium">{t('extracurriculars')}</h3>
        {doc.extracurriculars.length === 0 ? (
          <p className="text-muted-foreground">{t('noExtracurriculars')}</p>
        ) : (
          <ul className="grid gap-1">
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

      <section className="grid gap-2">
        <h3 className="font-medium">{t('attendance')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['sick', 'excused', 'absent'] as const).map((k) => (
            <div key={k} className="bg-card rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{t(`att_${k}`)}</p>
              <p className="font-heading text-xl font-semibold tabular-nums">{doc.attendance[k]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
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
