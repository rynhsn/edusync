/**
 * Pembantu uji: NPSN 8 angka yang unik per proses uji. Rentang dipilih jauh dari NPSN contoh data demo (69999xxx)
 * supaya uji yang berjalan di database bersama tidak bertabrakan dengan data dev.
 */
let next = 10_000_000 + Math.floor(Math.random() * 40_000_000);
const memo = new Map<string, string>();

/** NPSN baru yang valid. Dengan `key`, panggilan berikutnya dengan kunci sama mengembalikan NPSN yang sama. */
export function testNpsn(key?: string): string {
  if (key !== undefined) {
    const known = memo.get(key);
    if (known) return known;
  }
  next += 1;
  const value = String(next);
  if (key !== undefined) memo.set(key, value);
  return value;
}
