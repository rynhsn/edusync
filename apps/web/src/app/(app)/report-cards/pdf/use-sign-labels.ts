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
    internship: {
      title: t('pdfInternshipTitle'),
      time: t('pdfInternshipTime'),
      present: t('pdfInternshipPresent'),
      schoolSup: t('pdfInternshipSchoolSup'),
      industrySup: t('pdfInternshipIndustrySup'),
      aspect: t('pdfInternshipAspect'),
      final: t('pdfInternshipFinal'),
      certificate: t('pdfInternshipCertificate'),
    },
    ukk: {
      title: t('pdfUkkTitle'),
      pattern: t('pdfUkkPattern'),
      concentration: t('pdfUkkConcentration'),
      attempt: t('pdfUkkAttempt'),
      score: t('pdfUkkScore'),
      band: t('pdfUkkBand'),
      certificate: t('pdfUkkCertificate'),
      statement: t('pdfUkkStatement'),
      patterns: {
        lsp: t('pdfUkkPatternLsp'),
        industry: t('pdfUkkPatternIndustry'),
        independent: t('pdfUkkPatternIndependent'),
      },
    },
  };
}
