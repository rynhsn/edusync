const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/**
 * Uang disimpan sebagai rupiah bilangan bulat. Hasil selalu "Rp 1.250.000" (pemisah ribuan titik, tanpa desimal)
 * di semua bahasa antarmuka, karena ini mata uang sekolah, bukan format tanggal. Nilai negatif jadi "-Rp 5.000".
 */
export function formatRupiah(n: number): string {
  const rounded = Math.round(n);
  return `${rounded < 0 ? '-' : ''}Rp ${nf.format(Math.abs(rounded))}`;
}
