import { DEFAULT_TIMEZONE, localParts, normalizeTimezone, startOfDayIn } from '@edusync/contracts';

/**
 * Zona waktu sekolah yang sedang aktif di web. AppShell mengisinya dari `GET /v1/me` (`timezone`) setiap kali sekolah
 * aktif berganti; sebelum itu dan di luar AppShell berlaku Asia/Jakarta. Semua "hari ini" di layar memakai helper
 * ini, bukan `new Date()` mentah, supaya sekolah di WITA/WIT melihat tanggal yang benar.
 */
let current = DEFAULT_TIMEZONE;

export function setSchoolTimezone(tz: string | null | undefined) {
  current = normalizeTimezone(tz);
}

export const getSchoolTimezone = () => current;

/** Tanggal hari ini (TTTT-BB-HH) menurut zona waktu sekolah. */
export const todayIso = (now: Date = new Date()) => localParts(now, current).date;

/** Jam sekarang (HH:MM) menurut zona waktu sekolah. */
export const nowHm = (now: Date = new Date()) => localParts(now, current).time;

/** Hari dalam pekan sekarang menurut zona sekolah: 1 = Senin ... 7 = Minggu. */
export const todayWeekdayNumber = (now: Date = new Date()) => localParts(now, current).weekday;

/** Instan (ISO UTC) saat tanggal TTTT-BB-HH dimulai di zona sekolah. */
export const startOfSchoolDayIso = (date: string) => startOfDayIn(date, current).toISOString();
