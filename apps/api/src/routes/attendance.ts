import {
  and,
  asc,
  calendarEvent,
  classAttendance,
  classRoom,
  count,
  enrollment,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, ok, schoolHeader } from './helpers';

const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
const dateField = z.iso.date();
const tag = ['Attendance'];
const gate = (permission: 'attendance:read' | 'attendance:manage') => [
  requirePermission(permission),
  requireModule('attendance'),
];

/** Tanggal hari ini menurut zona waktu sekolah (Asia/Jakarta), TTTT-BB-HH. */
export function todayInJakarta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

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

/**
 * Absensi harian per kelas. Satu baris per siswa per tanggal. Hari libur/jeda sekolah dari kalender akademik tidak
 * bisa diisi, dan tanggal yang belum tiba ditolak. Modul `attendance`.
 */
export async function attendanceRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/attendance',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Absensi satu kelas pada satu tanggal',
        description:
          'Izin: `attendance:read`; modul `attendance` harus aktif. Daftar siswa aktif di kelas beserta statusnya (null bila ' +
          'belum diisi). `closed` berisi libur atau jeda sekolah pada tanggal itu bila ada.',
        headers: schoolHeader,
        querystring: z.object({ classId: z.uuid(), date: dateField }),
        response: {
          200: z.object({
            date: z.string(),
            closed: z.object({ type: z.enum(['holiday', 'break']), title: z.string() }).nullable(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                status: z.enum(STATUSES).nullable(),
                note: z.string().nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { classId, date } = request.query;
      return tenant(request, async (tx) => {
        const { rows } = await rosterOf(tx, classId);
        const marks = await tx
          .select()
          .from(classAttendance)
          .where(and(eq(classAttendance.classId, classId), eq(classAttendance.date, date)));
        const closed = await closureOn(tx, date);
        return {
          date,
          closed: closed as { type: 'holiday' | 'break'; title: string } | null,
          students: rows.map((s) => {
            const m = marks.find((x) => x.studentId === s.id);
            return {
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              status: m?.status ?? null,
              note: m?.note ?? null,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/attendance',
    {
      onRequest: gate('attendance:manage'),
      schema: {
        tags: tag,
        summary: 'Simpan absensi satu kelas pada satu tanggal',
        description:
          'Izin: `attendance:manage`. Menimpa status siswa yang disebut; siswa harus terdaftar di kelas itu. Ditolak bila ' +
          'tanggalnya belum tiba (409 `future_date`) atau libur/jeda sekolah (409 `school_closed`).',
        headers: schoolHeader,
        body: z.object({
          classId: z.uuid(),
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
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId, date, records } = request.body;
      if (date > todayInJakarta()) {
        throw new HttpError(409, 'future_date', 'Absensi tidak bisa diisi untuk tanggal yang belum tiba.');
      }
      return tenant(request, async (tx) => {
        const { rows } = await rosterOf(tx, classId);
        const allowed = new Set(rows.map((r) => r.id));
        const stray = records.find((r) => !allowed.has(r.studentId));
        if (stray) throw new HttpError(400, 'invalid_reference', 'Ada siswa yang bukan anggota kelas ini.');
        const closed = await closureOn(tx, date);
        if (closed) {
          throw new HttpError(
            409,
            'school_closed',
            `Tanggal itu ${closed.title} (${closed.type === 'holiday' ? 'libur' : 'jeda'}).`,
          );
        }
        for (const r of records) {
          await tx
            .insert(classAttendance)
            .values({
              schoolId: ctx.schoolId,
              classId,
              studentId: r.studentId,
              date,
              status: r.status,
              note: r.note,
              recordedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [classAttendance.studentId, classAttendance.date],
              set: { classId, status: r.status, note: r.note, recordedBy: ctx.userId, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'attendance.save', 'class', classId, { date, count: records.length });
        return { saved: records.length };
      });
    },
  );

  app.get(
    '/v1/attendance/recap',
    {
      onRequest: gate('attendance:read'),
      schema: {
        tags: tag,
        summary: 'Rekap absensi satu kelas dalam rentang tanggal',
        description:
          'Izin: `attendance:read`. Jumlah hadir, izin, sakit, dan alpa per siswa, dan jumlah hari yang sudah diisi. ' +
          'Rentang maksimal 366 hari.',
        headers: schoolHeader,
        querystring: z.object({ classId: z.uuid(), from: dateField, to: dateField }),
        response: {
          200: z.object({
            days: z.number().int().describe('Jumlah tanggal berbeda yang sudah ada absensinya'),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                present: z.number().int(),
                excused: z.number().int(),
                sick: z.number().int(),
                absent: z.number().int(),
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
      const { classId, from, to } = request.query;
      if (from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86_400_000) {
        throw new HttpError(400, 'invalid_period', 'Rentang tanggal tidak valid (maksimal 366 hari).');
      }
      return tenant(request, async (tx) => {
        const { rows } = await rosterOf(tx, classId);
        const marks = await tx
          .select({ studentId: classAttendance.studentId, status: classAttendance.status, n: count() })
          .from(classAttendance)
          .where(
            and(
              eq(classAttendance.classId, classId),
              gte(classAttendance.date, from),
              lte(classAttendance.date, to),
            ),
          )
          .groupBy(classAttendance.studentId, classAttendance.status);
        const dates = await tx
          .selectDistinct({ date: classAttendance.date })
          .from(classAttendance)
          .where(
            and(
              eq(classAttendance.classId, classId),
              gte(classAttendance.date, from),
              lte(classAttendance.date, to),
            ),
          );
        const n = (studentId: string, status: (typeof STATUSES)[number]) =>
          marks.find((m) => m.studentId === studentId && m.status === status)?.n ?? 0;
        return {
          days: dates.length,
          students: rows.map((s) => ({
            studentId: s.id,
            name: s.name,
            present: n(s.id, 'present'),
            excused: n(s.id, 'excused'),
            sick: n(s.id, 'sick'),
            absent: n(s.id, 'absent'),
          })),
        };
      });
    },
  );

  app.delete(
    '/v1/attendance',
    {
      onRequest: gate('attendance:manage'),
      schema: {
        tags: tag,
        summary: 'Hapus absensi satu kelas pada satu tanggal',
        description: 'Izin: `attendance:manage`. Mengosongkan semua isian kelas itu pada tanggal tersebut.',
        headers: schoolHeader,
        querystring: z.object({ classId: z.uuid(), date: dateField }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId, date } = request.query;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(classAttendance)
          .where(and(eq(classAttendance.classId, classId), eq(classAttendance.date, date)))
          .returning({ id: classAttendance.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Tidak ada absensi pada tanggal itu.');
        await audit(tx, ctx, 'attendance.clear', 'class', classId, { date, count: rows.length });
      });
      return { ok: true as const };
    },
  );
}
