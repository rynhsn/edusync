import {
  academicYear,
  and,
  asc,
  classRoom,
  eq,
  lessonPeriod,
  ne,
  scheduleEntry,
  subject,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import {
  audit,
  guarded,
  idParams,
  isForeignKeyViolation,
  isUniqueViolation,
  ok,
  schoolHeader,
} from './helpers';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM.');
const periodSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
});
const periodBody = z.object({ number: z.number().int().min(1).max(20), startsAt: time, endsAt: time });
const entrySchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  teacherId: z.uuid(),
  teacherName: z.string(),
  weekday: z.number().int(),
  periodId: z.uuid(),
});
const tag = ['Schedule'];
const gate = (permission: 'schedule:read' | 'schedule:manage') => [
  requirePermission(permission),
  requireModule('schedule'),
];
const invalid = (message: string) => new HttpError(400, 'invalid_period', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Jam pelajaran tidak boleh terbalik dan tidak boleh tumpang tindih dengan jam lain. */
async function assertPeriod(tx: Tx, p: { startsAt: string; endsAt: string }, exceptId?: string) {
  if (minutes(p.startsAt) >= minutes(p.endsAt)) throw invalid('Jam selesai harus setelah jam mulai.');
  const others = await tx
    .select()
    .from(lessonPeriod)
    .where(exceptId ? ne(lessonPeriod.id, exceptId) : undefined);
  const clash = others.find(
    (o) => minutes(p.startsAt) < minutes(o.endsAt) && minutes(o.startsAt) < minutes(p.endsAt),
  );
  if (clash) throw invalid(`Tumpang tindih dengan jam pelajaran ke-${clash.number}.`);
}

/** Jadwal pelajaran: jam pelajaran dan kisi jadwal per kelas, dengan pengecekan bentrok guru. Modul `schedule`. */
export async function scheduleRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ---------- Jam pelajaran ---------- */

  app.get(
    '/v1/lesson-periods',
    {
      onRequest: gate('schedule:read'),
      schema: {
        tags: tag,
        summary: 'Daftar jam pelajaran',
        description: 'Izin: `schedule:read`; modul `schedule` harus aktif.',
        headers: schoolHeader,
        response: { 200: z.array(periodSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) =>
        tx
          .select({
            id: lessonPeriod.id,
            number: lessonPeriod.number,
            startsAt: lessonPeriod.startsAt,
            endsAt: lessonPeriod.endsAt,
          })
          .from(lessonPeriod)
          .orderBy(asc(lessonPeriod.number)),
      ),
  );

  app.post(
    '/v1/lesson-periods',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Tambah jam pelajaran',
        description:
          'Izin: `schedule:manage`. Nomor harus unik dan rentang waktu tidak boleh tumpang tindih.',
        headers: schoolHeader,
        body: periodBody,
        response: { 201: periodSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      try {
        const row = await tenant(request, async (tx) => {
          await assertPeriod(tx, request.body);
          const [r] = await tx
            .insert(lessonPeriod)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'lesson_period.create', 'lesson_period', r!.id, request.body);
          return r!;
        });
        return reply
          .code(201)
          .send({ id: row.id, number: row.number, startsAt: row.startsAt, endsAt: row.endsAt });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new HttpError(409, 'conflict', 'Nomor jam pelajaran itu sudah ada.');
        throw error;
      }
    },
  );

  app.post(
    '/v1/lesson-periods/generate',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Buat jam pelajaran berurutan otomatis',
        description:
          'Izin: `schedule:manage`. Membuat `count` jam pelajaran berdurasi `minutes` mulai `firstStart`, dengan satu ' +
          'istirahat opsional setelah jam ke-`breakAfter`. Ditolak bila sudah ada jam pelajaran.',
        headers: schoolHeader,
        body: z.object({
          firstStart: time,
          count: z.number().int().min(1).max(14),
          minutes: z.number().int().min(10).max(120),
          breakAfter: z.number().int().min(1).max(13).optional(),
          breakMinutes: z.number().int().min(5).max(90).default(15),
        }),
        response: { 201: z.array(periodSchema), 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { firstStart, count, minutes: length, breakAfter, breakMinutes } = request.body;
      const rows = await tenant(request, async (tx) => {
        const existing = await tx.select({ id: lessonPeriod.id }).from(lessonPeriod).limit(1);
        if (existing.length > 0)
          throw new HttpError(
            409,
            'conflict',
            'Jam pelajaran sudah ada. Hapus dulu bila ingin membuat ulang.',
          );
        let cursor = minutes(firstStart);
        const values = [];
        for (let n = 1; n <= count; n++) {
          if (cursor + length > 24 * 60) throw invalid('Jam pelajaran melewati tengah malam.');
          values.push({
            schoolId: ctx.schoolId,
            number: n,
            startsAt: hhmm(cursor),
            endsAt: hhmm(cursor + length),
          });
          cursor += length + (breakAfter === n ? breakMinutes : 0);
        }
        const inserted = await tx.insert(lessonPeriod).values(values).returning();
        await audit(tx, ctx, 'lesson_period.generate', 'school', ctx.schoolId, request.body);
        return inserted;
      });
      return reply
        .code(201)
        .send(
          rows
            .sort((a, b) => a.number - b.number)
            .map((r) => ({ id: r.id, number: r.number, startsAt: r.startsAt, endsAt: r.endsAt })),
        );
    },
  );

  app.put(
    '/v1/lesson-periods/:id',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Ubah jam pelajaran',
        description: 'Izin: `schedule:manage`.',
        headers: schoolHeader,
        params: idParams,
        body: periodBody,
        response: { 200: periodSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        const row = await tenant(request, async (tx) => {
          const [cur] = await tx.select().from(lessonPeriod).where(eq(lessonPeriod.id, request.params.id));
          if (!cur) throw notFound('Jam pelajaran');
          await assertPeriod(tx, request.body, cur.id);
          const [r] = await tx
            .update(lessonPeriod)
            .set(request.body)
            .where(eq(lessonPeriod.id, cur.id))
            .returning();
          await audit(tx, ctx, 'lesson_period.update', 'lesson_period', cur.id, request.body);
          return r!;
        });
        return { id: row.id, number: row.number, startsAt: row.startsAt, endsAt: row.endsAt };
      } catch (error) {
        if (isUniqueViolation(error))
          throw new HttpError(409, 'conflict', 'Nomor jam pelajaran itu sudah ada.');
        throw error;
      }
    },
  );

  app.delete(
    '/v1/lesson-periods/:id',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Hapus jam pelajaran',
        description: 'Izin: `schedule:manage`. Ditolak bila sudah dipakai di jadwal.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(lessonPeriod)
            .where(eq(lessonPeriod.id, request.params.id))
            .returning({ id: lessonPeriod.id });
          if (rows.length === 0) throw notFound('Jam pelajaran');
          await audit(tx, ctx, 'lesson_period.delete', 'lesson_period', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error))
          throw new HttpError(409, 'in_use', 'Jam pelajaran ini sudah dipakai di jadwal.');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Kisi jadwal ---------- */

  app.get(
    '/v1/schedule',
    {
      onRequest: gate('schedule:read'),
      schema: {
        tags: tag,
        summary: 'Jadwal sebuah kelas atau seorang guru',
        description:
          'Izin: `schedule:read`. Isi `classId` untuk jadwal kelas, atau `teacherId` untuk jadwal guru pada tahun ajaran ' +
          'aktif (atau `academicYearId`). Guru pengampu diambil dari penugasan guru di kelas.',
        headers: schoolHeader,
        querystring: z
          .object({
            classId: z.uuid().optional(),
            teacherId: z.uuid().optional(),
            academicYearId: z.uuid().optional(),
          })
          .refine((q) => q.classId || q.teacherId, { message: 'Isi classId atau teacherId.' }),
        response: { 200: z.array(entrySchema), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const { classId, teacherId, academicYearId } = request.query;
      return tenant(request, async (tx) => {
        let yearId = academicYearId;
        if (!classId && !yearId) {
          const [active] = await tx
            .select({ id: academicYear.id })
            .from(academicYear)
            .where(eq(academicYear.isActive, true));
          yearId = active?.id;
          if (!yearId) return [];
        }
        return tx
          .select({
            id: scheduleEntry.id,
            classId: scheduleEntry.classId,
            className: classRoom.name,
            subjectId: scheduleEntry.subjectId,
            subjectName: subject.name,
            teacherId: scheduleEntry.teacherId,
            teacherName: teacher.name,
            weekday: scheduleEntry.weekday,
            periodId: scheduleEntry.periodId,
          })
          .from(scheduleEntry)
          .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
          .innerJoin(subject, eq(subject.id, scheduleEntry.subjectId))
          .innerJoin(teacher, eq(teacher.id, scheduleEntry.teacherId))
          .where(
            and(
              classId ? eq(scheduleEntry.classId, classId) : undefined,
              teacherId ? eq(scheduleEntry.teacherId, teacherId) : undefined,
              !classId && yearId ? eq(scheduleEntry.academicYearId, yearId) : undefined,
            ),
          )
          .orderBy(asc(scheduleEntry.weekday));
      });
    },
  );

  app.put(
    '/v1/schedule/cell',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Isi atau ganti satu sel jadwal',
        description:
          'Izin: `schedule:manage`. Gurunya otomatis guru pengampu mata pelajaran itu di kelas tersebut (tetapkan dulu di ' +
          'halaman Kelas). Ditolak 409 bila guru itu sudah mengajar di kelas lain pada hari dan jam yang sama.',
        headers: schoolHeader,
        body: z.object({
          classId: z.uuid(),
          weekday: z.number().int().min(1).max(6),
          periodId: z.uuid(),
          subjectId: z.uuid(),
        }),
        response: { 200: entrySchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId, weekday, periodId, subjectId } = request.body;
      try {
        return await tenant(request, async (tx) => {
          const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
          if (!cls) throw notFound('Kelas');
          const [period] = await tx
            .select({ id: lessonPeriod.id })
            .from(lessonPeriod)
            .where(eq(lessonPeriod.id, periodId));
          if (!period) throw notFound('Jam pelajaran');
          const [assign] = await tx
            .select({
              teacherId: teachingAssignment.teacherId,
              teacherName: teacher.name,
              subjectName: subject.name,
            })
            .from(teachingAssignment)
            .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
            .innerJoin(subject, eq(subject.id, teachingAssignment.subjectId))
            .where(and(eq(teachingAssignment.classId, classId), eq(teachingAssignment.subjectId, subjectId)));
          if (!assign) {
            throw new HttpError(
              400,
              'no_assignment',
              'Mata pelajaran ini belum punya guru pengampu di kelas ini. Tetapkan di halaman Kelas.',
            );
          }
          const [busy] = await tx
            .select({ className: classRoom.name })
            .from(scheduleEntry)
            .innerJoin(classRoom, eq(classRoom.id, scheduleEntry.classId))
            .where(
              and(
                eq(scheduleEntry.academicYearId, cls.academicYearId),
                eq(scheduleEntry.teacherId, assign.teacherId),
                eq(scheduleEntry.weekday, weekday),
                eq(scheduleEntry.periodId, periodId),
                ne(scheduleEntry.classId, classId),
              ),
            );
          if (busy) {
            throw new HttpError(
              409,
              'teacher_busy',
              `${assign.teacherName} sudah mengajar di kelas ${busy.className} pada hari dan jam itu.`,
            );
          }
          const [row] = await tx
            .insert(scheduleEntry)
            .values({
              schoolId: ctx.schoolId,
              academicYearId: cls.academicYearId,
              classId,
              subjectId,
              teacherId: assign.teacherId,
              weekday,
              periodId,
            })
            .onConflictDoUpdate({
              target: [scheduleEntry.classId, scheduleEntry.weekday, scheduleEntry.periodId],
              set: { subjectId, teacherId: assign.teacherId },
            })
            .returning();
          await audit(tx, ctx, 'schedule.set', 'class', classId, { weekday, periodId, subjectId });
          return {
            id: row!.id,
            classId,
            className: cls.name,
            subjectId,
            subjectName: assign.subjectName,
            teacherId: assign.teacherId,
            teacherName: assign.teacherName,
            weekday,
            periodId,
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(
            409,
            'teacher_busy',
            'Guru pengampu sudah mengajar di kelas lain pada hari dan jam itu.',
          );
        }
        throw error;
      }
    },
  );

  app.delete(
    '/v1/schedule/cell',
    {
      onRequest: gate('schedule:manage'),
      schema: {
        tags: tag,
        summary: 'Kosongkan satu sel jadwal',
        description: 'Izin: `schedule:manage`.',
        headers: schoolHeader,
        querystring: z.object({
          classId: z.uuid(),
          weekday: z.coerce.number().int().min(1).max(6),
          periodId: z.uuid(),
        }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId, weekday, periodId } = request.query;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(scheduleEntry)
          .where(
            and(
              eq(scheduleEntry.classId, classId),
              eq(scheduleEntry.weekday, weekday),
              eq(scheduleEntry.periodId, periodId),
            ),
          )
          .returning({ id: scheduleEntry.id });
        if (rows.length === 0) throw notFound('Sel jadwal');
        await audit(tx, ctx, 'schedule.clear', 'class', classId, { weekday, periodId });
      });
      return { ok: true as const };
    },
  );
}
