import { z } from 'zod';
import { placeholdersIn, renderTemplate } from './messaging';

/**
 * Templat dokumen yang dapat disesuaikan sekolah (SKL dan sertifikat PKL). Fungsi murni dan skema bersama API dan web.
 * Teks bernilai `null` berarti "bawaan": dokumen memakai teks lamanya (SKL mengikuti bahasa pengguna), sehingga sekolah
 * yang tidak mengubah apa pun mendapat keluaran yang sama seperti sebelum fitur ini. Tanda tangan HANYA ruang kosong
 * untuk tanda tangan basah (tidak ada gambar tanda tangan dari sistem).
 */

export const DOCUMENT_TEMPLATE_KINDS = ['skl', 'pkl_certificate'] as const;
export type DocumentTemplateKind = (typeof DOCUMENT_TEMPLATE_KINDS)[number];

/** Variabel `{{...}}` yang dikenal per jenis dokumen. */
export const DOCUMENT_VARIABLES = {
  skl: [
    'nama_murid',
    'nis',
    'nisn',
    'kelas',
    'tahun_ajaran',
    'nomor_skl',
    'status_lulus',
    'nilai_rata',
    'tanggal_lulus',
    'sekolah',
    'kepala_sekolah',
    'nip_kepala_sekolah',
    'tempat',
    'tanggal',
  ],
  pkl_certificate: [
    'nama_murid',
    'kelas',
    'sekolah',
    'mitra',
    'periode',
    'nama_periode',
    'nilai_akhir',
    'predikat',
    'kata_predikat',
    'nomor_sertifikat',
    'pembimbing_industri',
    'kepala_sekolah',
    'nip_kepala_sekolah',
    'tempat',
    'tanggal',
  ],
} as const satisfies Record<DocumentTemplateKind, readonly string[]>;

/** Bagian yang dapat ditampilkan atau disembunyikan per jenis (tidak diisi = tampil). */
export const DOCUMENT_SECTIONS = {
  skl: ['letterhead', 'number', 'identity', 'criteria'],
  pkl_certificate: ['schoolName', 'number', 'className', 'score', 'aspects'],
} as const satisfies Record<DocumentTemplateKind, readonly string[]>;

export const MAX_SIGNATURE_SLOTS = 4;

export const signatureSlotSchema = z.object({
  /** Jabatan di atas ruang tanda tangan, mis. "Kepala Sekolah" (boleh memuat variabel). */
  label: z.string().trim().max(80),
  /** Nama di bawah ruang tanda tangan (boleh variabel); kosong = garis kosong untuk ditulis tangan. */
  name: z.string().trim().max(120),
  /** Baris di bawah nama (mis. NIP); disembunyikan bila semua variabelnya kosong. */
  note: z.string().trim().max(120),
  /** Cetak "{tempat}, {tanggal}" di atas jabatan ini. */
  placeDate: z.boolean(),
});
export type SignatureSlot = z.infer<typeof signatureSlotSchema>;

const text = (max: number) => z.string().trim().max(max).nullable();

export const documentTemplateConfigSchema = z.object({
  title: text(120),
  subtitle: text(120),
  intro: text(500),
  body: text(2000),
  sections: z.record(z.string(), z.boolean()),
  signatures: z.array(signatureSlotSchema).max(MAX_SIGNATURE_SLOTS).nullable(),
});
export type DocumentTemplateConfig = z.infer<typeof documentTemplateConfigSchema>;

/** Templat bawaan: semua teks bawaan, semua bagian tampil, tanda tangan bawaan. */
export const DEFAULT_DOCUMENT_TEMPLATE: DocumentTemplateConfig = {
  title: null,
  subtitle: null,
  intro: null,
  body: null,
  sections: {},
  signatures: null,
};

/** Susunan awal slot tanda tangan saat sekolah mulai menyesuaikan (sama dengan tata letak bawaan). */
export const DEFAULT_SIGNATURE_SLOTS: Record<DocumentTemplateKind, SignatureSlot[]> = {
  skl: [
    {
      label: 'Kepala Sekolah',
      name: '{{kepala_sekolah}}',
      note: 'NIP {{nip_kepala_sekolah}}',
      placeDate: true,
    },
  ],
  pkl_certificate: [
    { label: 'Pembimbing Industri', name: '{{pembimbing_industri}}', note: '{{mitra}}', placeDate: false },
    { label: 'Kepala Sekolah', name: '{{kepala_sekolah}}', note: '{{sekolah}}', placeDate: true },
  ],
};

/** Variabel di teks yang tidak dikenal pada jenis dokumen itu. */
export function unknownDocumentVariables(kind: DocumentTemplateKind, value: string): string[] {
  const allowed = DOCUMENT_VARIABLES[kind] as readonly string[];
  return placeholdersIn(value).filter((p) => !allowed.includes(p));
}

/** Semua teks bertemplat pada config (untuk pemeriksaan variabel). */
function templatedTexts(c: DocumentTemplateConfig): string[] {
  return [
    c.title,
    c.subtitle,
    c.intro,
    c.body,
    ...(c.signatures ?? []).flatMap((s) => [s.label, s.name, s.note]),
  ].filter((v): v is string => typeof v === 'string');
}

/**
 * Periksa config untuk satu jenis: variabel tak dikenal dan kunci bagian tak dikenal. Mengembalikan daftar masalah
 * (kosong = sah); dipakai API (400) dan formulir web.
 */
export function validateDocumentTemplate(kind: DocumentTemplateKind, c: DocumentTemplateConfig) {
  const issues: { code: 'unknown_variable' | 'unknown_section'; names: string[] }[] = [];
  const unknown = [...new Set(templatedTexts(c).flatMap((t) => unknownDocumentVariables(kind, t)))];
  if (unknown.length > 0) issues.push({ code: 'unknown_variable', names: unknown });
  const sections = DOCUMENT_SECTIONS[kind] as readonly string[];
  const badSections = Object.keys(c.sections).filter((k) => !sections.includes(k));
  if (badSections.length > 0) issues.push({ code: 'unknown_section', names: badSections });
  return issues;
}

/** Bagian tampil kecuali dimatikan eksplisit. */
export const sectionShown = (c: DocumentTemplateConfig, name: string) => c.sections[name] !== false;

/** Isi teks bertemplat; variabel tanpa nilai dikosongkan. */
export const renderDocumentText = (value: string, vars: Record<string, string | number | null | undefined>) =>
  renderTemplate(value, vars);

/**
 * Slot tanda tangan yang sudah diisi variabelnya. `note` kosong bila teksnya memuat variabel tetapi semuanya
 * kosong (mis. NIP tidak ada), sehingga barisnya tidak dicetak.
 */
export function renderSignatureSlots(
  slots: readonly SignatureSlot[],
  vars: Record<string, string | number | null | undefined>,
) {
  const filled = (s: string) => placeholdersIn(s).some((n) => `${vars[n] ?? ''}`.trim() !== '');
  return slots.map((s) => ({
    label: renderTemplate(s.label, vars),
    name: renderTemplate(s.name, vars),
    note: placeholdersIn(s.note).length > 0 && !filled(s.note) ? '' : renderTemplate(s.note, vars),
    placeDate: s.placeDate,
  }));
}

/** Data contoh untuk pratinjau templat per jenis. */
export const SAMPLE_DOCUMENT_VARS: Record<DocumentTemplateKind, Record<string, string>> = {
  skl: {
    nama_murid: 'Ahmad Fauzan',
    nis: '2023001',
    nisn: '0081234567',
    kelas: 'IX A',
    tahun_ajaran: '2026/2027',
    nomor_skl: '001/SKL/2027',
    status_lulus: 'Lulus',
    nilai_rata: '86,5',
    tanggal_lulus: '2 Mei 2027',
    sekolah: 'SMP IT Contoh',
    kepala_sekolah: 'Drs. Hasan Basri, M.Pd.',
    nip_kepala_sekolah: '196501011990031002',
    tempat: 'Bandung',
    tanggal: '2 Mei 2027',
  },
  pkl_certificate: {
    nama_murid: 'Ahmad Fauzan',
    kelas: 'XI TKJ 1',
    sekolah: 'SMK Contoh',
    mitra: 'PT Maju Bersama',
    periode: '1 Oktober 2026 s.d. 30 November 2026',
    nama_periode: 'PKL Ganjil 2026',
    nilai_akhir: '88,5',
    predikat: 'A',
    kata_predikat: 'Sangat baik',
    nomor_sertifikat: '012/PKL/2026',
    pembimbing_industri: 'Budi Santoso',
    kepala_sekolah: 'Drs. Hasan Basri, M.Pd.',
    nip_kepala_sekolah: '196501011990031002',
    tempat: 'Bandung',
    tanggal: '30 November 2026',
  },
};
