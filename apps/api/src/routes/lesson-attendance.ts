import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  dailyAttendance,
  enrollment,
  eq,
  inArray,
  lessonAttendance,
  lessonPeriod,
  scheduleEntry,
  subject,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closureOn, rosterOf, todayInJakarta } from '../attendance-lib';
import { isOnDuty, jakarta, weekdayOf } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { notifySkippedClass } from '../messaging-lib';
import { audit, guarded, schoolHeader } from './helpers';

const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
const dateField = z.iso.date();
const tag = ['Lesson attendance'];
const gate = [requirePermission('attendance:read'), requireModule('attendance')];

/**
 * Siapa boleh mengisi absensi satu jam pelajaran: pengurus (`attendance:configure`), guru yang tertulis di jadwal itu,
 * atau guru piket hari itu (menggantikan). `substitute` menandai pengisian oleh bukan guru jadwal.
 */
async function authorizeLesson(tx: Tx, ctx: TenantContext, entry: { teacherId: string }, date: string) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  const isOwner = mine?.id === entry.teacherId;
  if (isOwner) return { allowed: true, substitute: false };
  if (ctx.permissions.has('attendance:configure')) return { allowed: true, substitute: true };
  if (date === jakarta(new Date()).date && (await isOnDuty(tx, ctx, date))) {
    return { allowed: true, substitute: true };
  }
  return { allowed: false, substitute: true };
}

async function entryOrThrow(tx: Tx, id: string) {
  const [entry] = await tx.select().from(scheduleEntry).where(eq(scheduleEntry.id, id));
  if (!entry) throw new HttpError(404, 'not_found', 'Jam pelajaran tidak ditemukan.');
  return entry;
}

/** Absensi per jam pelajaran: daftar jam hari ini, lembar absensi dengan status gerbang, dan penyimpanan. */
export async function lessonAttendanceRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/lessons',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Jam pelajaran pada satu tanggal',
        description:
          'Izin: `attendance:read`; modul `attendance`. Sel jadwal pada hari itu di tahun ajaran aktif, dengan jumlah ' +
          'siswa yang sudah diabsen. Guru biasa melihat jam miliknya; pengurus dan guru piket (hari ini) melihat semua ' +
          'sehingga bisa menggantikan. `mine` menandai jam milik pengguna.',
        headers: schoolHeader,
        querystring: z.object({ date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            canCover: z.boolean(),
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
                mine: z.boolean(),
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
        const [mine] = await tx
          .select({ id: teacher.id })
          .from(teacher)
          .where(eq(teacher.memberId, ctx.memberId));
        const canCover =
          ctx.permissions.has('attendance:configure') ||
          (date === jakarta(new Date()).date && (await isOnDuty(tx, ctx, date)));
        const weekday = weekdayOf(date);
        const closed = await closureOn(tx, date);
        const rows =
          weekday > 6
            ? []
            : await tx
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
        const visible = canCover ? rows : rows.filter((r) => r.teacherId === mine?.id);
        const ids = visible.map((r) => r.id);
        const filled = ids.length
          ? await tx
              .select({ id: lessonAttendance.scheduleEntryId, n: count() })
              .from(lessonAttendance)
              .where(and(inArray(lessonAttendance.scheduleEntryId, ids), eq(lessonAttendance.date, date)))
              .groupBy(lessonAttendance.scheduleEntryId)
          : [];
        const classIds = [...new Set(visible.map((r) => r.classId))];
        const totals = classIds.length
          ? await tx
              .select({ id: enrollment.classId, n: count() })
              .from(enrollment)
              .where(inArray(enrollment.classId, classIds))
              .groupBy(enrollment.classId)
          : [];
        return {
          date,
          closed: closed as { type: 'holiday' | 'break'; title: string } | null,
          canCover,
          lessons: visible.map(({ teacherId, ...r }) => ({
            ...r,
            mine: teacherId === mine?.id,
            total: totals.find((t) => t.id === r.classId)?.n ?? 0,
            filled: filled.find((f) => f.id === r.id)?.n ?? 0,
          })),
        };
      });
    },
  );

  app.get(
    '/v1/lesson-attendance',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Lembar absensi satu jam pelajaran',
        description:
          'Izin: `attendance:read`; modul `attendance`. Siswa kelas itu dengan status jam ini dan status gerbang ' +
          '(`gate`, null bila belum tap), sehingga yang hadir di gerbang tetapi tidak di kelas terlihat. `canRecord` ' +
          'menyatakan apakah pengguna boleh mengisi; `substitute` bila pengisiannya menggantikan guru jadwal.',
        headers: schoolHeader,
        querystring: z.object({ scheduleEntryId: z.uuid(), date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            canRecord: z.boolean(),
            substitute: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                status: z.enum(STATUSES).nullable(),
                note: z.string().nullable(),
                gate: z.enum(['present', 'late', 'excused', 'sick', 'absent']).nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { scheduleEntryId, date } = request.query;
      return tenant(request, async (tx) => {
        const entry = await entryOrThrow(tx, scheduleEntryId);
        const auth = await authorizeLesson(tx, ctx, entry, date);
        const { rows } = await rosterOf(tx, entry.classId);
        const marks = await tx
          .select()
          .from(lessonAttendance)
          .where(and(eq(lessonAttendance.scheduleEntryId, scheduleEntryId), eq(lessonAttendance.date, date)));
        const gateRows = await tx
          .select({ studentId: dailyAttendance.studentId, status: dailyAttendance.status })
          .from(dailyAttendance)
          .where(eq(dailyAttendance.date, date));
        return {
          date,
          canRecord: auth.allowed,
          substitute: auth.substitute,
          students: rows.map((s) => ({
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            status: marks.find((m) => m.studentId === s.id)?.status ?? null,
            note: marks.find((m) => m.studentId === s.id)?.note ?? null,
            gate: gateRows.find((g) => g.studentId === s.id)?.status ?? null,
          })),
        };
      });
    },
  );

  app.put(
    '/v1/lesson-attendance',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Simpan absensi satu jam pelajaran',
        description:
          'Izin: `attendance:read` ditambah salah satu: guru yang tertulis di jadwal itu, guru piket hari ini ' +
          '(menggantikan, ditandai `substitute`), atau `attendance:configure`; selain itu 403 `not_your_lesson`. ' +
          'Tanggal harus hari yang sama dengan hari jadwal (400 `invalid_date`), tidak boleh belum tiba (409 ' +
          '`future_date`) atau libur/jeda (409 `school_closed`).',
        headers: schoolHeader,
        body: z.object({
          scheduleEntryId: z.uuid(),
          date: dateField,
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                status: z.enum(STATUSES),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: {
          200: z.object({ saved: z.number().int(), substitute: z.boolean() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { scheduleEntryId, date, records } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Absensi tidak bisa diisi untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        const entry = await entryOrThrow(tx, scheduleEntryId);
        if (weekdayOf(date) !== entry.weekday) {
          throw new HttpError(400, 'invalid_date', 'Tanggal itu bukan hari jadwal pelajaran ini.');
        }
        const auth = await authorizeLesson(tx, ctx, entry, date);
        if (!auth.allowed) {
          throw new HttpError(
            403,
            'not_your_lesson',
            'Hanya guru jam ini atau guru piket yang boleh mengisi.',
          );
        }
        const closed = await closureOn(tx, date);
        if (closed) throw new HttpError(409, 'school_closed', `Tanggal itu ${closed.title}.`);
        const { rows } = await rosterOf(tx, entry.classId);
        const allowed = new Set(rows.map((r) => r.id));
        if (records.some((r) => !allowed.has(r.studentId))) {
          throw new HttpError(400, 'invalid_reference', 'Ada siswa yang bukan anggota kelas ini.');
        }
        for (const r of records) {
          await tx
            .insert(lessonAttendance)
            .values({
              schoolId: ctx.schoolId,
              scheduleEntryId,
              studentId: r.studentId,
              date,
              status: r.status,
              note: r.note,
              recordedBy: ctx.userId,
              substitute: auth.substitute,
            })
            .onConflictDoUpdate({
              target: [lessonAttendance.scheduleEntryId, lessonAttendance.studentId, lessonAttendance.date],
              set: {
                status: r.status,
                note: r.note,
                recordedBy: ctx.userId,
                substitute: auth.substitute,
                updatedAt: new Date(),
              },
            });
        }
        await notifySkippedClass(tx, ctx.schoolId, {
          scheduleEntryId,
          classId: entry.classId,
          subjectId: entry.subjectId,
          periodId: entry.periodId,
          date,
          absent: records
            .filter((r) => r.status === 'absent')
            .map((r) => ({ id: r.studentId, name: rows.find((x) => x.id === r.studentId)?.name ?? '' })),
        });
        await audit(tx, ctx, 'lesson_attendance.save', 'schedule_entry', scheduleEntryId, {
          date,
          count: records.length,
          substitute: auth.substitute,
        });
        return { saved: records.length, substitute: auth.substitute };
      });
    },
  );
}
