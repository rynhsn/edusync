import { useTranslations } from 'next-intl';
import type { SignLabels } from './report-card-pdf';

/** Teks tanda tangan rapor menurut bahasa pengguna; PDF dirender di klien tanpa akses hook, jadi diteruskan lewat props. */
export function useSignLabels(): SignLabels {
  const t = useTranslations('reportCards');
  return {
    parent: t('signParent'),
    homeroom: t('signHomeroom'),
    principal: t('signPrincipal'),
    title: t('pdfTitle'),
    docTitle: t('pdfDocTitle'),
    // Tempat nama diisi di PDF: teruskan "{name}" apa adanya supaya ICU tidak menganggapnya argumen yang hilang.
    docTitleStudent: t('pdfDocTitleStudent', { name: '{name}' }),
    nsm: t('nsm'),
    cocurricular: {
      title: t('pdfCocurricularTitle'),
      dimension: t('pdfColDimension'),
      achievement: t('pdfColAchievement'),
      remark: t('pdfColRemark'),
    },
    expertise: {
      field: t('pdfExpertiseField'),
      program: t('pdfExpertiseProgram'),
      concentration: t('pdfExpertiseConcentration'),
      groupOther: t('pdfGroupOther'),
    },
  };
}
