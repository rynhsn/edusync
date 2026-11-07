import { localParts, zonedTimeToDate } from '@edusync/contracts';
import {
  academicYear,
  and,
  classRoom,
  currentTimezone,
  dailyAttendance,
  enrollment,
  eq,
  inArray,
  isNull,
  student,
  type Tx,
  tapEvent,
  teacher,
} from '@edusync/db';
import { closureOn } from './attendance-lib';
import { isOnDuty, jakarta, type Policy } from './gate';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';
import { notifyTap } from './messaging-lib';

/** Status yang berarti siswa tidak hadir hari itu; tidak ditimpa catatan datang/pulang tanpa `overwrite`. */
const AWAY = ['excused', 'sick', 'absent'] as const;
const isAway = (status: string | null | undefined) =>
  !!status && (AWAY as readonly string[]).includes(status);

export type ManualResult =
  | 'in'
  | 'out'
  | 'already_in'
  | 'already_out'
  | 'skipped_status'
  | 'not_found'
  | 'invalid_time';

export interface ManualEntryResult {
  studentId: string;
  name: string | null;
  className: string | null;
  result: ManualResult;
  at: string | null;
  status: 'present' | 'late' | 'excused' | 'sick' | 'absent' | null;
  late: boolean;
  /** `no_check_in`: pulang dicatat padahal belum ada catatan datang hari itu. */
  warning: 'no_check_in' | null;
}

/** Kelas yang boleh dicatat pengguna: `all` (pengurus atau guru piket hari ini) atau hanya kelas yang ia walikan. */
export interface ManualScope {
  kind: 'all' | 'duty' | 'homeroom';
  classIds: Set<string> | null;
  teacherId: string | null;
}

/**
 * Aturan pencatatan datang/pulang manual (cadangan saat kiosk mati):
 * - pengguna dengan `attendance:configure` boleh untuk semua kelas;
 * - guru yang bertugas piket pada hari itu (hanya untuk hari ini) boleh untuk semua kelas;
 * - guru lain hanya boleh untuk kelas yang ia menjadi wali kelasnya di tahun ajaran aktif;
 * - akun tanpa data guru tidak dapat mencatat apa pun.
 */
export async function manualScope(tx: Tx, ctx: TenantContext, date: string): Promise<ManualScope> {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  if (ctx.permissions.has('attendance:configure')) {
    return { kind: 'all', classIds: null, teacherId: mine?.id ?? null };
  }
  if (!mine) return { kind: 'homeroom', classIds: new Set(), teacherId: null };
  if (date === jakarta(new Date()).date && (await isOnDuty(tx, ctx, date))) {
    return { kind: 'duty', classIds: null, teacherId: mine.id };
  }
  const own = await tx
    .select({ id: classRoom.id })
    .from(classRoom)
    .innerJoin(
      academicYear,
      and(eq(academicYear.id, classRoom.academicYearId), eq(academicYear.isActive, true)),
    )
    .where(eq(classRoom.homeroomTeacherId, mine.id));
  return { kind: 'homeroom', classIds: new Set(own.map((c) => c.id)), teacherId: mine.id };
}

export const canRecordClass = (scope: ManualScope, classId: string | null) =>
  scope.classIds === null || (!!classId && scope.classIds.has(classId));

/**
 * Mengubah masukan waktu menjadi instan. `HH:MM` dibaca sebagai jam dinding sekolah pada `date`; selain itu harus
 * ISO 8601 dengan zona dan jatuh pada `date` menurut zona sekolah. Tanpa masukan: sekarang, hanya bila `date` hari ini.
 * Tidak boleh di masa depan.
 */
export function parseWhen(date: string, raw: string | undefined | null, now = new Date()): Date {
  const tz = currentTimezone();
  const today = localParts(now, tz).date;
  if (date > today) throw new HttpError(400, 'future_date', 'Tanggal tidak boleh di masa depan.');
  let at: Date;
  if (raw === undefined || raw === null || raw === '') {
    if (date !== today) {
      throw new HttpError(400, 'time_required', 'Jam wajib diisi untuk tanggal selain hari ini.');
    }
    at = now;
  } else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    at = zonedTimeToDate(date, raw, tz);
  } else {
    at = new Date(raw);
    if (Number.isNaN(at.getTime()) || !/(Z|[+-]\d\d:?\d\d)$/i.test(raw)) {
      throw new HttpError(400, 'invalid_time', 'Format jam harus HH:MM atau ISO 8601 dengan zona waktu.');
    }
    if (localParts(at, tz).date !== date) {
      throw new HttpError(400, 'invalid_time', 'Jam harus berada pada tanggal yang dipilih.');
    }
  }
  if (at.getTime() > now.getTime() + 60_000) {
    throw new HttpError(400, 'invalid_time', 'Jam tidak boleh di masa depan.');
  }
  return at;
}

/** Kelas (tahun ajaran aktif) tiap siswa. */
export async function classesOf(tx: Tx, studentIds: string[]) {
  const map = new Map<string, { id: string; name: string }>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({ studentId: enrollment.studentId, classId: classRoom.id, className: classRoom.name })
    .from(enrollment)
    .innerJoin(
      academicYear,
      and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
    )
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .where(inArray(enrollment.studentId, studentIds));
  for (const r of rows) map.set(r.studentId, { id: r.classId, name: r.className });
  return map;
}

export function forbiddenClass() {
  return new HttpError(
    403,
    'forbidden_class',
    'Anda hanya dapat mencatat untuk kelas yang Anda walikan, atau semua kelas saat bertugas piket.',
  );
}

export interface ManualInput {
  date: string;
  direction: 'in' | 'out';
  entries: {
    studentId: string;
    at: Date;
    status?: 'present' | 'late' | undefined;
    /** Kunci idempoten per entri (pindai QR); disimpan di `tap_event.client_id`. */
    clientId?: string | undefined;
  }[];
  overwrite: boolean;
  force: boolean;
  /** Asal catatan pada `tap_event`; bawaan `manual`. Pindai QR memakai `qr`. */
  source?: 'manual' | 'qr';
}

/**
 * Inti pencatatan datang/pulang manual untuk banyak siswa. Meniru tap: menulis `tap_event` bersumber `manual`
 * (dengan `recordedBy` pencatat), memperbarui absensi harian, dan memberi tahu wali. Aman diulang: catatan yang sudah
 * ada tidak ditimpa tanpa `overwrite`. Siswa berstatus izin/sakit/alpa dilewati tanpa `overwrite`.
 */
export async function applyManual(
  tx: Tx,
  ctx: TenantContext,
  input: ManualInput,
  scope: ManualScope,
  policy: Policy,
) {
  const { date, direction, overwrite } = input;
  const source = input.source ?? 'manual';
  const closed = await closureOn(tx, date);
  if (closed && !input.force) {
    throw new HttpError(
      409,
      'school_closed',
      `Tanggal itu ${closed.title}. Kirim force untuk tetap mencatat.`,
    );
  }
  const tz = currentTimezone();
  const unique = new Map<string, ManualInput['entries'][number]>();
  for (const e of input.entries) if (!unique.has(e.studentId)) unique.set(e.studentId, e);
  const ids = [...unique.keys()];

  const students = new Map(
    (
      await tx
        .select({ id: student.id, name: student.name })
        .from(student)
        .where(and(inArray(student.id, ids), eq(student.status, 'active'), isNull(student.deletedAt)))
    ).map((s) => [s.id, s.name]),
  );
  const classes = await classesOf(tx, [...students.keys()]);
  for (const id of students.keys()) {
    if (!canRecordClass(scope, classes.get(id)?.id ?? null)) throw forbiddenClass();
  }
  const rows = new Map(
    (
      await tx
        .select()
        .from(dailyAttendance)
        .where(and(eq(dailyAttendance.date, date), inArray(dailyAttendance.studentId, [...students.keys()])))
    ).map((r) => [r.studentId, r]),
  );

  const results: ManualEntryResult[] = [];
  for (const [studentId, entry] of unique) {
    const name = students.get(studentId) ?? null;
    const className = classes.get(studentId)?.name ?? null;
    const row = rows.get(studentId);
    const base = {
      studentId,
      name,
      className,
      at: null as string | null,
      status: (row?.status ?? null) as ManualEntryResult['status'],
      late: row?.status === 'late',
      warning: null as ManualEntryResult['warning'],
    };
    const done = (result: ManualResult, extra: Partial<ManualEntryResult> = {}) => {
      results.push({ ...base, result, ...extra });
    };
    if (name === null) {
      done('not_found', { status: null, late: false });
      continue;
    }
    if (isAway(row?.status) && !overwrite) {
      done('skipped_status');
      continue;
    }
    const { at } = entry;
    if (direction === 'in') {
      if (row?.checkInAt && !overwrite) {
        done('already_in', { at: row.checkInAt.toISOString() });
        continue;
      }
      if (row?.checkOutAt && at > row.checkOutAt) {
        done('invalid_time');
        continue;
      }
      const late = entry.status ? entry.status === 'late' : localParts(at, tz).time > policy.lateAfter;
      const status = late ? 'late' : 'present';
      await tx.insert(tapEvent).values({
        schoolId: ctx.schoolId,
        studentId,
        direction: 'in',
        source,
        at,
        recordedBy: ctx.userId,
        clientId: entry.clientId ?? null,
      });
      await tx
        .insert(dailyAttendance)
        .values({ schoolId: ctx.schoolId, studentId, date, checkInAt: at, status })
        .onConflictDoUpdate({
          target: [dailyAttendance.studentId, dailyAttendance.date],
          set: { checkInAt: at, status, updatedAt: new Date() },
        });
      done('in', { at: at.toISOString(), status, late });
    } else {
      if (row?.checkOutAt && !overwrite) {
        done('already_out', { at: row.checkOutAt.toISOString() });
        continue;
      }
      if (row?.checkInAt && at < row.checkInAt) {
        done('invalid_time');
        continue;
      }
      const status = isAway(row?.status) ? 'present' : (row?.status ?? 'present');
      await tx.insert(tapEvent).values({
        schoolId: ctx.schoolId,
        studentId,
        direction: 'out',
        source,
        at,
        recordedBy: ctx.userId,
        clientId: entry.clientId ?? null,
      });
      await tx
        .insert(dailyAttendance)
        .values({ schoolId: ctx.schoolId, studentId, date, checkOutAt: at, status })
        .onConflictDoUpdate({
          target: [dailyAttendance.studentId, dailyAttendance.date],
          set: { checkOutAt: at, status, updatedAt: new Date() },
        });
      done('out', {
        at: at.toISOString(),
        status,
        late: status === 'late',
        warning: row?.checkInAt ? null : 'no_check_in',
      });
    }
    // Pemberitahuan ke wali sama seperti tap; kegagalan pengiriman tidak membatalkan catatan.
    try {
      await notifyTap(tx, ctx.schoolId, {
        result: direction,
        at: at.toISOString(),
        student: { id: studentId, name, className },
      });
    } catch {
      // diabaikan
    }
  }

  const count = (r: ManualResult) => results.filter((x) => x.result === r).length;
  return {
    date,
    direction,
    results,
    summary: {
      in: count('in'),
      out: count('out'),
      already_in: count('already_in'),
      already_out: count('already_out'),
      skipped_status: count('skipped_status'),
      not_found: count('not_found'),
      invalid_time: count('invalid_time'),
      warnings: results.filter((r) => r.warning).length,
    },
  };
}
