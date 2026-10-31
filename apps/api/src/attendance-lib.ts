import { todayIn } from '@edusync/contracts';
import {
  and,
  asc,
  calendarEvent,
  classRoom,
  currentTimezone,
  enrollment,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  scheduleEntry,
  student,
  type Tx,
  teacher,
} from '@edusync/db';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

/** Tanggal hari ini menurut zona waktu sekolah (konteks tenant; di luar konteks Asia/Jakarta), TTTT-BB-HH. */
export function todayInSchool(tz: string = currentTimezone()) {
  return todayIn(tz);
}

/** @deprecated Nama lama; kini mengikuti zona waktu sekolah. Pakai `todayInSchool`. */
export const todayInJakarta = todayInSchool;

/** Libur atau jeda cakupan sekolah pada tanggal itu (bila ada). */
export async function closureOn(tx: Tx, date: string) {
  const [c] = await tx
    .select({ type: calendarEvent.type, title: calendarEvent.title })
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.scope, 'school'),
        inArray(calendarEvent.type, ['holiday', 'break']),
        lte(calendarEvent.startsOn, date),
        gte(calendarEvent.endsOn, date),
      ),
    )
    .limit(1);
  return c ?? null;
}

/** Siswa aktif yang terdaftar di kelas (pada tahun ajaran kelas itu), urut nama. */
export async function rosterOf(tx: Tx, classId: string) {
  const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
  if (!cls) throw new HttpError(404, 'not_found', 'Kelas tidak ditemukan.');
  const rows = await tx
    .select({ id: student.id, name: student.name, nis: student.nis })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(and(eq(enrollment.classId, classId), isNull(student.deletedAt), eq(student.status, 'active')))
    .orderBy(asc(student.name));
  return { cls, rows };
}

/** Peran yang melihat laporan semua kelas meskipun juga tercatat sebagai guru. */
const REPORT_WIDE_ROLES = ['principal', 'curriculum'];

/**
 * Cakupan kelas yang boleh dilihat pengguna pada laporan absensi.
 *
 * Pembatasan hanya berlaku bagi pengguna yang (1) tercatat sebagai guru (`teacher.memberId` = anggota ini), (2) tidak
 * punya `attendance:configure`, dan (3) perannya tidak memuat kepala sekolah (`principal`) atau kurikulum
 * (`curriculum`). Mereka hanya melihat kelas yang ia ajar, yaitu kelas yang punya sel jadwal dengan guru tersebut.
 * Pengguna lain (admin, operator, kepala sekolah, kurikulum, atau akun tanpa data guru) melihat semua kelas.
 *
 * Mengembalikan `null` bila tidak dibatasi, atau himpunan id kelas yang boleh dilihat.
 */
export async function reportClassScope(tx: Tx, ctx: TenantContext): Promise<Set<string> | null> {
  if (ctx.permissions.has('attendance:configure')) return null;
  if (ctx.roles.some((r) => REPORT_WIDE_ROLES.includes(r))) return null;
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  if (!mine) return null;
  const rows = await tx
    .selectDistinct({ classId: scheduleEntry.classId })
    .from(scheduleEntry)
    .where(eq(scheduleEntry.teacherId, mine.id));
  return new Set(rows.map((r) => r.classId));
}
