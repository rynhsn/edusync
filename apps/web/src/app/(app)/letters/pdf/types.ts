/** Masukan PDF surat bertanda tangan. */
export interface LetterPdfDoc {
  schoolName: string;
  address: string | null;
  number: string;
  /** Isi surat yang sudah terisi (tanpa {{...}}). */
  text: string;
  /** Tanggal surat dalam kata, dipakai bila ekor surat tidak memuat tanggal. */
  dateText: string;
  /** Tanggal surat ISO; dipakai sebagai tanggal dokumen PDF agar hasil cetak ulang konsisten. */
  dateIso: string;
  signer: { name: string; title: string; nip: string | null; signatureData: string | null };
  /** Data URL QR yang memuat tautan verifikasi. */
  qrDataUrl: string;
  /** Tautan verifikasi (dicetak kecil di bawah QR). */
  verifyUrl: string;
  subject: string;
}
