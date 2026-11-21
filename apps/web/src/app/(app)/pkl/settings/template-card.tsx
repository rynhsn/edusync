'use client';

import { SAMPLE_DOCUMENT_VARS } from '@edusync/contracts';
import { useSchool } from '@/components/app-shell';
import { DocumentTemplateCard } from '@/components/document-template-card';
import { CERTIFICATE_DEFAULT_TEXT } from '../pdf/format';
import type { CertificateDoc } from '../pdf/types';

/** Templat sertifikat PKL di pengaturan PKL; pratinjau = PDF contoh dengan data fiktif. */
export function TemplateCard() {
  const { can } = useSchool();
  return (
    <DocumentTemplateCard
      kind="pkl_certificate"
      manage={can('pkl:manage')}
      defaults={CERTIFICATE_DEFAULT_TEXT}
      onPreview={async (config) => {
        const v = SAMPLE_DOCUMENT_VARS.pkl_certificate;
        const sample: CertificateDoc = {
          schoolName: v.sekolah ?? '',
          studentName: v.nama_murid ?? '',
          className: v.kelas ?? null,
          partnerName: v.mitra ?? '',
          periodName: v.nama_periode ?? '',
          startsOn: '2026-10-01',
          endsOn: '2026-11-30',
          finalScore: 88.5,
          predicate: 'A',
          aspects: [
            { name: 'Disiplin', weight: 30, value: 90 },
            { name: 'Keterampilan', weight: 40, value: 88 },
            { name: 'Sikap kerja', weight: 30, value: 87 },
          ],
          place: v.tempat ?? '',
          dateIso: '2026-11-30',
          principalName: v.kepala_sekolah ?? '',
          principalNip: v.nip_kepala_sekolah ?? null,
          industrySupervisorName: v.pembimbing_industri ?? null,
          certificateNo: v.nomor_sertifikat ?? null,
        };
        const { downloadCertificatePdf } = await import('../pdf/download');
        await downloadCertificatePdf(sample, config);
      }}
    />
  );
}
