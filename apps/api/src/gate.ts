import {
  and,
  attendancePolicy,
  classRoom,
  dailyAttendance,
  desc,
  dutyRoster,
  enrollment,
  eq,
  gte,
  lte,
  student,
  type Tx,
  tapEvent,
  teacher,
} from '@edusync/db';
import { closureOn } from './attendance-lib';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

export const DEFAULT_POLICY = {
  lateAfter: '07:15',
  departureFrom: '12:00',
  debounceSeconds: 30,
  notifyParents: false,
};
export type Policy = typeof DEFAULT_POLICY;

/** Tanggal (TTTT-BB-HH) dan jam (HH:MM) menurut zona waktu sekolah (Asia/Jakarta). */
export function jakarta(at: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** 1 = Senin … 7 = Minggu, untuk tanggal TTTT-BB-HH. */
export function weekdayOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export async function loadPolicy(tx: Tx): Promise<Policy> {
  const [row] = await tx.select().from(attendancePolicy);
  if (!row) return DEFAULT_POLICY;
  return {
    lateAfter: row.lateAfter,
    departureFrom: row.departureFrom,
    debounceSeconds: row.debounceSeconds,
    notifyParents: row.notifyParents,
  };
}

export type TapResult = 'in' | 'out' | 'already_in' | 'duplicate' | 'replayed';

export interface TapInput {
  studentId: string;
  at: Date;
  deviceId?: string;
  clientId?: string;
}

/**
 * Mencatat satu tap gerbang. Arah (masuk/pulang) ditentukan jam tap terhadap kebijakan sekolah. Tap kembali dalam
 * rentang debounce diabaikan, tap masuk kedua pada hari yang sama tidak mengubah jam masuk, dan clientId yang sama
 * (kirim ulang dari perangkat offline) tidak dicatat dua kali. Hasilnya langsung memperbarui absensi harian.
 */
export async function recordTap(tx: Tx, ctx: { schoolId: string }, input: TapInput, policy: Policy) {
  const { date, time } = jakarta(input.at);
  const closed = await closureOn(tx, date);
  if (closed) throw new HttpError(409, 'school_closed', `Tanggal itu ${closed.title}.`);

  const [stu] = await tx
    .select({ id: student.id, name: student.name, status: student.status, deletedAt: student.deletedAt })
    .from(student)
    .where(eq(student.id, input.studentId));
  if (!stu) throw new HttpError(404, 'not_found', 'Siswa tidak ditemukan.');
  if (stu.status !== 'active' || stu.deletedAt) {
    throw new HttpError(409, 'student_inactive', 'Siswa ini tidak aktif.');
  }
  const [cls] = await tx
    .select({ name: classRoom.name })
    .from(enrollment)
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .where(eq(enrollment.studentId, stu.id))
    .orderBy(desc(enrollment.createdAt))
    .limit(1);
  const info = { id: stu.id, name: stu.name, className: cls?.name ?? null };
  const direction: 'in' | 'out' = time < policy.departureFrom ? 'in' : 'out';
  const done = (result: TapResult, late = false) => ({
    result,
    direction,
    late,
    at: input.at.toISOString(),
    student: info,
  });

  if (input.clientId) {
    const [seen] = await tx
      .select({ id: tapEvent.id })
      .from(tapEvent)
      .where(eq(tapEvent.clientId, input.clientId));
    if (seen) return done('replayed');
  }
  const windowMs = policy.debounceSeconds * 1000;
  const [near] = await tx
    .select({ id: tapEvent.id })
    .from(tapEvent)
    .where(
      and(
        eq(tapEvent.studentId, stu.id),
        gte(tapEvent.at, new Date(input.at.getTime() - windowMs)),
        lte(tapEvent.at, new Date(input.at.getTime() + windowMs)),
      ),
    )
    .limit(1);
  if (near) return done('duplicate');

  const [row] = await tx
    .select()
    .from(dailyAttendance)
    .where(and(eq(dailyAttendance.studentId, stu.id), eq(dailyAttendance.date, date)));

  if (direction === 'in' && row?.checkInAt) return done('already_in', row.status === 'late');

  await tx.insert(tapEvent).values({
    schoolId: ctx.schoolId,
    studentId: stu.id,
    direction,
    source: 'rfid',
    at: input.at,
    deviceId: input.deviceId ?? null,
    recordedBy: null,
    clientId: input.clientId ?? null,
  });

  if (direction === 'in') {
    const late = time > policy.lateAfter;
    const status = late ? 'late' : 'present';
    await tx
      .insert(dailyAttendance)
      .values({ schoolId: ctx.schoolId, studentId: stu.id, date, checkInAt: input.at, status })
      .onConflictDoUpdate({
        target: [dailyAttendance.studentId, dailyAttendance.date],
        set: { checkInAt: input.at, status, updatedAt: new Date() },
      });
    return done('in', late);
  }
  const later = row?.checkOutAt && row.checkOutAt > input.at ? row.checkOutAt : input.at;
  await tx
    .insert(dailyAttendance)
    .values({ schoolId: ctx.schoolId, studentId: stu.id, date, checkOutAt: later, status: 'present' })
    .onConflictDoUpdate({
      target: [dailyAttendance.studentId, dailyAttendance.date],
      set: { checkOutAt: later, updatedAt: new Date() },
    });
  return done('out', row?.status === 'late');
}

/** Apakah anggota ini guru yang bertugas piket pada tanggal itu. */
export async function isOnDuty(tx: Tx, ctx: TenantContext, date: string) {
  const [row] = await tx
    .select({ teacherId: dutyRoster.teacherId })
    .from(dutyRoster)
    .innerJoin(teacher, eq(teacher.id, dutyRoster.teacherId))
    .where(and(eq(dutyRoster.date, date), eq(teacher.memberId, ctx.memberId)))
    .limit(1);
  return !!row;
}
