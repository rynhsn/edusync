import type { Predicate } from '@edusync/contracts';

/** Bahan sertifikat PKL: semuanya sudah berupa teks atau angka siap tampil. */
export interface CertificateDoc {
  schoolName: string;
  studentName: string;
  className: string | null;
  partnerName: string;
  periodName: string;
  startsOn: string;
  endsOn: string;
  finalScore: number;
  predicate: Predicate;
  aspects: { name: string; weight: number; value: number | null }[];
  /** Kota penerbitan (boleh kosong) dan tanggal penerbitan TTTT-BB-HH. */
  place: string;
  dateIso: string;
  principalName: string;
  industrySupervisorName: string | null;
}
