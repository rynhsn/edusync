import { startOfDayIn } from '@edusync/contracts';
import { currentTimezone } from '@edusync/db';

/** Jam pelajaran minimal yang dibutuhkan untuk menentukan keadaan "sekarang". Jam dalam format HH:MM (zona sekolah). */
export interface PeriodSlot {
  number: number;
  startsAt: string;
  endsAt: string;
}

export interface PeriodState {
  /** Nomor jam yang sedang berlangsung (mulai <= sekarang < selesai); null bila tidak ada. */
  currentPeriod: number | null;
  /** Jam mulai terdekat setelah sekarang (HH:MM); null bila tidak ada lagi hari ini. */
  nextPeriodStartsAt: string | null;
}

/**
 * Penentu jam pelajaran berjalan. Murni: waktu disuntik sebagai `time` (HH:MM, jam sekolah) sehingga bisa diuji tanpa
 * bergantung jam dinding. Batas awal inklusif, batas akhir eksklusif. Bila beberapa jam bertumpuk, nomor terkecil
 * dipilih.
 */
export function periodState(periods: PeriodSlot[], time: string): PeriodState {
  const running = periods
    .filter((p) => p.startsAt <= time && time < p.endsAt)
    .sort((a, b) => a.number - b.number);
  const upcoming = periods
    .map((p) => p.startsAt)
    .filter((s) => s > time)
    .sort();
  return {
    currentPeriod: running[0]?.number ?? null,
    nextPeriodStartsAt: upcoming[0] ?? null,
  };
}

/** Awal hari (00:00) tanggal TTTT-BB-HH menurut zona waktu sekolah (bawaan Asia/Jakarta). */
export function startOfSchoolDay(date: string, tz: string = currentTimezone()): Date {
  return startOfDayIn(date, tz);
}

/** @deprecated Nama lama; kini mengikuti zona waktu sekolah. Pakai `startOfSchoolDay`. */
export const startOfJakartaDay = startOfSchoolDay;
