'use client';

import { SAMPLE_DOCUMENT_VARS } from '@edusync/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { DocumentTemplateCard } from '@/components/document-template-card';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import type { GraduationStudent, PrintMeta, SklLabels } from '@/lib/graduation';

/** Templat SKL di halaman kelulusan; pratinjau = PDF SKL contoh dengan data fiktif. */
export function TemplateCard() {
  const t = useTranslations('graduation.print');
  const tr = useTranslations('graduation.results');
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const v = SAMPLE_DOCUMENT_VARS.skl;
  const name = school.schoolName;

  return (
    <DocumentTemplateCard
      kind="skl"
      manage={can('graduation:manage')}
      defaults={{
        title: t('sklTitle'),
        intro: t('sklIntro', { school: name }),
        body: t('sklStatement', { school: name }),
      }}
      onPreview={async (config) => {
        const date = formatCalendarDate(locale, '2027-05-02');
        // Murid contoh: hanya kolom yang dibaca SklDocument yang diisi.
        const student = {
          name: v.nama_murid,
          nis: v.nis,
          nisn: v.nisn,
          className: v.kelas,
          decision: {
            status: 'final',
            result: 'graduated',
            sklNumber: v.nomor_skl,
            graduatedOn: '2027-05-02',
          },
          transcript: { average: 86.5, policy: { criteriaText: null } },
        } as unknown as GraduationStudent;
        const meta: PrintMeta = {
          school: {
            name,
            npsn: null,
            address: null,
            city: v.tempat ?? null,
            principal: { name: v.kepala_sekolah ?? '', nip: v.nip_kepala_sekolah ?? null },
          },
          yearName: v.tahun_ajaran ?? '',
          locale,
          graduatedOnText: date,
          printedOnText: t('printedOn', { date }),
        };
        const labels: SklLabels = {
          title: t('sklTitle'),
          number: t('sklNumber'),
          intro: t('sklIntro', { school: name }),
          name: t('name'),
          nis: t('nis'),
          nisn: t('nisn'),
          className: t('className'),
          year: t('year'),
          statement: t('sklStatement', { school: name }),
          criteria: t('criteria'),
          principal: t('principal'),
          nip: t('nip'),
          npsn: t('npsn'),
          draftNote: t('draftNote'),
          numberMissing: t('numberMissing'),
          signPlace: [v.tempat, date].filter(Boolean).join(', '),
          placeText: v.tempat,
          dateText: date,
          results: {
            graduated: tr('graduated'),
            not_graduated: tr('not_graduated'),
            deferred: tr('deferred'),
          },
        };
        const { downloadSklPdf } = await import('./pdf/download');
        await downloadSklPdf(student, labels, meta, config);
      }}
    />
  );
}
