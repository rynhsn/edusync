import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  dailyAttendance,
  enrollment,
  eq,
  gte,
  inArray,
  isNull,
  lessonAttendance,
  lessonPeriod,
  lte,
  scheduleEntry,
  student,
  subject,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn, reportClassScope } from '../attendance-lib';
import { isOnDuty, weekdayOf } from '../gate';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { guarded, schoolHeader } from './helpers';

const dateField = z.iso.date();
const tag = ['Attendance report'];
const gate = [requirePermission('attendance:read'), requireModule('attendance')];
const MAX_STUDENTS = 3000;
const DAY_MS = 86_400_000;

const gateDays = z.object({
  present: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
  sick: z.number().int(),
  absent: z.number().int(),
  notRecorded: z.number().int().describe('Hari efektif yang belum tercatat untuk siswa ini'),
});
const lessonCounts = z.object({
  present: z.number().int(),
  excused: z.number().int(),
  sick: z.number().int(),
  absent: z.number().int(),
});

/**
 * Laporan absensi gabungan: gerbang harian (daily_attendance) dan per jam pelajaran (lesson_attendance), termasuk
 * "bolos kelas" (hadir di gerbang tetapi alpa di jam pelajaran). Modul `attendance`.
 */
export async function attendanceReportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/attendance/report',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Rekap absensi gerbang dan per jam pelajaran',
        description:
          'Izin: `attendance:read`; modul `attendance` harus aktif. Per siswa aktif di tahun ajaran aktif (satu kelas ' +
          'bila `classId` diisi, selain itu semua kelas yang boleh dilihat pengguna): jumlah hari gerbang ' +
          '(`days`: present, late, excused, sick, absent, dan `notRecorded`), jumlah jam pelajaran (`lessons`), dan ' +
          '`skipped` (bolos kelas) yaitu jam pelajaran berstatus alpa pada hari siswa hadir atau terlambat di gerbang. ' +
          '`effectiveDays` adalah jumlah tanggal berbeda yang punya catatan gerbang untuk kelas itu (hari libur/jeda ' +
          'tanpa catatan tidak dihitung). Rentang maksimal 366 hari (400 `invalid_period`). Guru yang tidak punya ' +
          '`attendance:configure` dan bukan kepala sekolah/kurikulum hanya boleh melihat kelas yang ia ajar; kelas ' +
          'lain 403 `forbidden`. Kelas tidak ada atau milik sekolah lain: 404 `not_found`.',
        headers: schoolHeader,
        querystring: z.object({ classId: z.uuid().optional(), from: dateField, to: dateField }),
        response: {
          200: z.object({
            from: z.string(),
            to: z.string(),
            classId: z.uuid().nullable(),
            effectiveDays: z
              .number()
              .int()
              .describe('Tanggal berbeda yang punya catatan gerbang pada pilihan ini'),
            summary: z.object({
              students: z.number().int(),
              days: gateDays,
              lessons: lessonCounts,
              skipped: z.number().int(),
            }),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                classId: z.uuid(),
                className: z.string(),
                effectiveDays: z.number().int(),
                days: gateDays,
                lessons: lessonCounts,
                skipped: z.number().int(),
              }),
            ),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId, from, to } = request.query;
      if (from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * DAY_MS) {
        throw new HttpError(400, 'invalid_period', 'Rentang tanggal tidak valid (maksimal 366 hari).');
      }
      return tenant(request, async (tx) => {
        const scope = await reportClassScope(tx, ctx);
        if (classId) {
          const [cls] = await tx
            .select({ id: classRoom.id })
            .from(classRoom)
            .where(eq(classRoom.id, classId));
          if (!cls) throw new HttpError(404, 'not_found', 'Kelas tidak ditemukan.');
          if (scope && !scope.has(classId))
            throw forbidden('Anda hanya boleh melihat laporan kelas yang Anda ajar.');
        }
        const classIds = classId ? [classId] : scope ? [...scope] : null;
        const empty = {
          from,
          to,
          classId: classId ?? null,
          effectiveDays: 0,
          summary: {
            students: 0,
            days: { present: 0, late: 0, excused: 0, sick: 0, absent: 0, notRecorded: 0 },
            lessons: { present: 0, excused: 0, sick: 0, absent: 0 },
            skipped: 0,
          },
          students: [],
        };
        if (classIds && classIds.length === 0) return empty;

        const roster = await tx
          .select({
            studentId: student.id,
            name: student.name,
            nis: student.nis,
            classId: enrollment.classId,
            className: classRoom.name,
          })
          .from(enrollment)
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
          )
          .innerJoin(student, eq(student.id, enrollment.studentId))
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(
            and(
              isNull(student.deletedAt),
              eq(student.status, 'active'),
              classIds ? inArray(enrollment.classId, classIds) : undefined,
            ),
          )
          .orderBy(asc(classRoom.name), asc(student.name))
          .limit(MAX_STUDENTS);
        if (roster.length === 0) return empty;
        const studentIds = roster.map((r) => r.studentId);

        // Hari gerbang per siswa per status.
        const gateRows = await tx
          .select({ studentId: dailyAttendance.studentId, status: dailyAttendance.status, n: count() })
          .from(dailyAttendance)
          .where(
            and(
              inArray(dailyAttendance.studentId, studentIds),
              gte(dailyAttendance.date, from),
              lte(dailyAttendance.date, to),
            ),
          )
          .groupBy(dailyAttendance.studentId, dailyAttendance.status);

        // Hari efektif: tanggal berbeda yang punya catatan gerbang untuk kelas itu.
        const dayRows = await tx
          .selectDistinct({ classId: enrollment.classId, date: dailyAttendance.date })
          .from(dailyAttendance)
          .innerJoin(enrollment, eq(enrollment.studentId, dailyAttendance.studentId))
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
          )
          .where(
            and(
              inArray(dailyAttendance.studentId, studentIds),
              gte(dailyAttendance.date, from),
              lte(dailyAttendance.date, to),
            ),
          );
        const daysByClass = new Map<string, number>();
        const allDates = new Set<string>();
        for (const d of dayRows) {
          daysByClass.set(d.classId, (daysByClass.get(d.classId) ?? 0) + 1);
          allDates.add(d.date);
        }

        // Jam pelajaran per siswa per status.
        const lessonRows = await tx
          .select({ studentId: lessonAttendance.studentId, status: lessonAttendance.status, n: count() })
          .from(lessonAttendance)
          .where(
            and(
              inArray(lessonAttendance.studentId, studentIds),
              gte(lessonAttendance.date, from),
              lte(lessonAttendance.date, to),
            ),
          )
          .groupBy(lessonAttendance.studentId, lessonAttendance.status);

        // Bolos kelas: alpa di jam pelajaran pada hari yang sama siswa hadir/terlambat di gerbang.
        const skipRows = await tx
          .select({ studentId: lessonAttendance.studentId, n: count() })
          .from(lessonAttendance)
          .innerJoin(
            dailyAttendance,
            and(
              eq(dailyAttendance.studentId, lessonAttendance.studentId),
              eq(dailyAttendance.date, lessonAttendance.date),
            ),
          )
          .where(
            and(
              inArray(lessonAttendance.studentId, studentIds),
              gte(lessonAttendance.date, from),
              lte(lessonAttendance.date, to),
              eq(lessonAttendance.status, 'absent'),
              inArray(dailyAttendance.status, ['present', 'late']),
            ),
          )
          .groupBy(lessonAttendance.studentId);

        const gateN = (id: string, status: string) =>
          gateRows.find((g) => g.studentId === id && g.status === status)?.n ?? 0;
        const lessonN = (id: string, status: string) =>
          lessonRows.find((g) => g.studentId === id && g.status === status)?.n ?? 0;

        const students = roster.map((r) => {
          const effectiveDays = daysByClass.get(r.classId) ?? 0;
          const days = {
            present: gateN(r.studentId, 'present'),
            late: gateN(r.studentId, 'late'),
            excused: gateN(r.studentId, 'excused'),
            sick: gateN(r.studentId, 'sick'),
            absent: gateN(r.studentId, 'absent'),
            notRecorded: 0,
          };
          const recorded = days.present + days.late + days.excused + days.sick + days.absent;
          days.notRecorded = Math.max(0, effectiveDays - recorded);
          return {
            ...r,
            effectiveDays,
            days,
            lessons: {
              present: lessonN(r.studentId, 'present'),
              excused: lessonN(r.studentId, 'excused'),
              sick: lessonN(r.studentId, 'sick'),
              absent: lessonN(r.studentId, 'absent'),
            },
            skipped: skipRows.find((s) => s.studentId === r.studentId)?.n ?? 0,
          };
        });

        const sum = <K extends 'present' | 'late' | 'excused' | 'sick' | 'absent' | 'notRecorded'>(key: K) =>
          students.reduce((t, s) => t + s.days[key], 0);
        const sumLessons = (key: 'present' | 'excused' | 'sick' | 'absent') =>
          students.reduce((t, s) => t + s.lessons[key], 0);
        return {
          from,
          to,
          classId: classId ?? null,
          effectiveDays: allDates.size,
          summary: {
            students: students.length,
            days: {
              present: sum('present'),
              late: sum('late'),
              excused: sum('excused'),
              sick: sum('sick'),
              absent: sum('absent'),
              notRecorded: sum('notRecorded'),
            },
            lessons: {
              present: sumLessons('present'),
              excused: sumLessons('excused'),
              sick: sumLessons('sick'),
              absent: sumLessons('absent'),
            },
            skipped: students.reduce((t, s) => t + s.skipped, 0),
          },
          students,
        };
      });
    },
  );

  app.get(
    '/v1/attendance/report/lessons-unfilled',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Jam pelajaran yang belum terisi absensinya',
        description:
          'Izin: `attendance:read`; modul `attendance` harus aktif. Sel jadwal pada tanggal itu (tahun ajaran aktif) ' +
          'yang absensi per jamnya belum lengkap (`filled` kurang dari `total`), untuk dipantau guru piket. ' +
          'Pengurus (`attendance:configure`), kepala sekolah, kurikulum, dan guru piket hari itu melihat semua kelas; ' +
          'guru lain hanya jam miliknya. Hari libur/jeda dan hari Minggu menghasilkan daftar kosong.',
        headers: schoolHeader,
        querystring: z.object({ date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            lessons: z.array(
              z.object({
                id: z.uuid(),
                classId: z.uuid(),
                className: z.string(),
                subjectName: z.string(),
                teacherName: z.string(),
                periodNumber: z.number().int(),
                startsAt: z.string(),
                endsAt: z.string(),
                total: z.number().int(),
                filled: z.number().int(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { date } = request.query;
      return tenant(request, async (tx) => {
        const closed = await closureOn(tx, date);
        const weekday = weekdayOf(date);
        const base = { date, closed: closed as { type: 'holiday' | 'break'; title: string } | null };
        if (closed || weekday > 6) return { ...base, lessons: [] };

        let scope = await reportClassScope(tx, ctx);
        // Guru piket pada tanggal itu melihat semua kelas agar bisa memantau dan menggantikan.
        if (scope && (await isOnDuty(tx, ctx, date))) scope = null;
        const [mine] = scope
          ? await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId))
          : [];

        const rows = await tx
          .select({
            id: scheduleEntry.id,
            classId: scheduleEntry.classId,
            className: classRoom.name,
            subjectName: subject.name,
            teacherId: scheduleEntry.teacherId,
            teacherName: teacher.name,
            periodNumber: lessonPeriod.number,
            startsAt: lessonPeriod.startsAt,
            endsAt: lessonPeriod.endsAt,
          })
          .from(scheduleEntry)
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, scheduleEntry.academicYearId), eq(academicYear.isActive, true)),
          )
          .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
          .innerJoin(subject, eq(subject.id, scheduleEntry.subjectId))
          .innerJoin(teacher, eq(teacher.id, scheduleEntry.teacherId))
          .innerJoin(lessonPeriod, eq(lessonPeriod.id, scheduleEntry.periodId))
          .where(eq(scheduleEntry.weekday, weekday))
          .orderBy(asc(lessonPeriod.number), asc(classRoom.name));
        const visible = scope ? rows.filter((r) => r.teacherId === mine?.id) : rows;
        if (visible.length === 0) return { ...base, lessons: [] };

        const filled = await tx
          .select({ id: lessonAttendance.scheduleEntryId, n: count() })
          .from(lessonAttendance)
          .where(
            and(
              inArray(
                lessonAttendance.scheduleEntryId,
                visible.map((r) => r.id),
              ),
              eq(lessonAttendance.date, date),
            ),
          )
          .groupBy(lessonAttendance.scheduleEntryId);
        const classIds = [...new Set(visible.map((r) => r.classId))];
        const totals = await tx
          .select({ id: enrollment.classId, n: count() })
          .from(enrollment)
          .innerJoin(student, eq(student.id, enrollment.studentId))
          .where(
            and(
              inArray(enrollment.classId, classIds),
              isNull(student.deletedAt),
              eq(student.status, 'active'),
            ),
          )
          .groupBy(enrollment.classId);
        const lessons = visible
          .map(({ teacherId: _teacherId, ...r }) => ({
            ...r,
            total: totals.find((t) => t.id === r.classId)?.n ?? 0,
            filled: filled.find((f) => f.id === r.id)?.n ?? 0,
          }))
          .filter((l) => l.total > 0 && l.filled < l.total);
        return { ...base, lessons };
      });
    },
  );
}
