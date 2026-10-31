/** Status pendaftar SPMB (penerimaan murid baru). */
export const ADMISSION_STATUSES = [
  'submitted',
  'verified',
  'accepted',
  'rejected',
  'enrolled',
  'withdrawn',
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

/**
 * Peralihan status yang sah. `enrolled` dan `withdrawn` terminal. `rejected` boleh dibuka kembali lewat
 * verifikasi ulang (banding). Peralihan ke `enrolled` hanya lewat endpoint daftar ulang, bukan pengubah status biasa.
 */
export const ADMISSION_TRANSITIONS: Record<AdmissionStatus, readonly AdmissionStatus[]> = {
  submitted: ['verified', 'rejected', 'withdrawn'],
  verified: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['enrolled', 'withdrawn', 'rejected'],
  rejected: ['verified'],
  enrolled: [],
  withdrawn: [],
};

export function canTransition(from: AdmissionStatus, to: AdmissionStatus): boolean {
  return ADMISSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Ukuran maksimum satu dokumen pendaftar (byte asli, sebelum base64). */
export const MAX_DOC_BYTES = 2 * 1024 * 1024;
/** Jumlah maksimum dokumen per pendaftaran. */
export const MAX_DOCS_PER_APPLICATION = 8;

export type DocMime = 'application/pdf' | 'image/jpeg' | 'image/png';

/**
 * Tentukan jenis berkas dari isi (magic bytes), bukan dari nama atau tipe yang diklaim pengunggah.
 * Mengembalikan null bila bukan PDF, JPEG, atau PNG.
 */
export function detectMime(bytes: Uint8Array): DocMime | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 4 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return 'image/png';
  }
  return null;
}

/** Nama pendaftar: spasi di tepi dibuang dan spasi berulang (termasuk tab/baris baru) dipadatkan menjadi satu. */
export function normalizeApplicantName(input: string): string {
  return input.normalize('NFC').replace(/\s+/g, ' ').trim();
}
