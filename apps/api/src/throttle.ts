import { createHash } from 'node:crypto';

/**
 * Batas laju alur masuk dan pemulihan. Di tes, batas per IP dilonggarkan karena semua permintaan berasal dari
 * satu alamat; batas per isian tetap sama agar bisa diuji.
 */
export function authLimits(nodeEnv: string | undefined) {
  const test = nodeEnv === 'test';
  return {
    /** Percobaan masuk per IP per menit. */
    signInIpPerMinute: test ? 5000 : 20,
    /** Percobaan masuk GAGAL per isian per 15 menit. */
    signInFailuresPer15Min: 10,
    /** Pencarian akun untuk pemulihan: per IP dan per isian per jam. */
    lookupIpPerHour: test ? 5000 : 10,
    lookupIdentifierPerHour: 5,
    /** Pengiriman kode pemulihan: per IP dan per isian per jam. */
    sendIpPerHour: test ? 5000 : 10,
    sendIdentifierPerHour: 5,
    /** Pemeriksaan kode dan reset: per IP per jam (kode sendiri dibatasi 5 kali salah). */
    checkIpPerHour: test ? 5000 : 30,
  } as const;
}

export type AuthLimits = ReturnType<typeof authLimits>;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Pembatas laju sederhana di memori (jendela tetap) untuk alur masuk dan pemulihan akun. Kunci berupa hash,
 * jadi isian pengguna (email, NIK) tidak pernah tersimpan atau tercatat apa adanya. Hitungan hanya berlaku
 * per proses API; kode pemulihan sendiri dijaga tabel database (jeda kirim dan batas salah).
 */
export class Throttle {
  private readonly buckets = new Map<string, Bucket>();

  /** Kunci aman-catat dari isian pengguna. */
  static key(scope: string, value: string): string {
    return `${scope}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
  }

  private live(key: string, now: number): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  private sweep(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }

  /** Sisa detik sampai boleh lagi bila kunci sudah mencapai batas; 0 bila masih boleh. */
  blockedFor(key: string, max: number, now = Date.now()): number {
    const bucket = this.live(key, now);
    return bucket && bucket.count >= max ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
  }

  /** Catat satu kejadian. */
  record(key: string, windowMs: number, now = Date.now()) {
    this.sweep(now);
    const bucket = this.live(key, now);
    if (bucket) bucket.count += 1;
    else this.buckets.set(key, { count: 1, resetAt: now + windowMs });
  }

  /** Periksa lalu catat sekaligus; mengembalikan sisa detik bila ditolak, 0 bila diizinkan. */
  hit(key: string, max: number, windowMs: number, now = Date.now()): number {
    const wait = this.blockedFor(key, max, now);
    if (wait > 0) return wait;
    this.record(key, windowMs, now);
    return 0;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  clear() {
    this.buckets.clear();
  }
}
