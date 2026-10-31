import { EVENT_TYPES, effectiveDays } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  calendarEvent,
  classRoom,
  eq,
  program,
  schoolSetting,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const SCOPES = ['school', 'class', 'program'] as const;

const eventSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  type: z.enum(EVENT_TYPES),
  scope: z.enum(SCOPES),
  classId: z.uuid().nullable(),
  programId: z.uuid().nullable(),
  title: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

const eventBody = z.object({
  type: z.enum(EVENT_TYPES),
  scope: z.enum(SCOPES).default('school'),
  classId: z.uuid().nullable().default(null),
  programId: z.uuid().nullable().default(null),
  title: z.string().trim().min(1).max(120),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalid = (message: string) => new HttpError(400, 'invalid_event', message);

async function yearOf(tx: Tx, id: string) {
  const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, id));
  if (!y) throw notFound('Tahun ajaran');
  return y;
}

/** Aturan acara: tanggal berurutan dan di dalam tahun ajaran; cakupan kelas/jurusan harus menyebut kelas/jurusan sekolah ini. */
async function validate(tx: Tx, year: { startsOn: string; endsOn: string }, b: z.infer<typeof eventBody>) {
  if (b.startsOn > b.endsOn) throw invalid('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  if (b.startsOn < year.startsOn || b.endsOn > year.endsOn) {
    throw invalid('Acara harus berada di dalam rentang tahun ajaran.');
  }
  if (b.scope === 'school' && (b.classId || b.programId))
    throw invalid('Cakupan sekolah tidak memakai kelas atau jurusan.');
  if (b.scope === 'class') {
    if (!b.classId || b.programId) throw invalid('Cakupan kelas harus menyebut satu kelas.');
    const [c] = await tx.select({ id: classRoom.id }).from(classRoom).where(eq(classRoom.id, b.classId));
    if (!c) throw invalid('Kelas tidak ditemukan.');
  }
  if (b.scope === 'program') {
    if (!b.programId || b.classId) throw invalid('Cakupan jurusan harus menyebut satu jurusan.');
    const [p] = await tx.select({ id: program.id }).from(program).where(eq(program.id, b.programId));
    if (!p) throw invalid('Jurusan tidak ditemukan.');
  }
  if ((b.type === 'holiday' || b.type === 'break') && b.scope !== 'school') {
    throw invalid('Libur dan jeda berlaku untuk seluruh sekolah.');
  }
}

/** Kalender akademik per tahun ajaran: acara dan hari efektif. Memakai izin tahun ajaran. */
export async function calendarRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/academic-years/:id/calendar',
    {
      onRequest: [requirePermission('academic_year:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Kalender akademik satu tahun ajaran',
        description:
          'Izin: `academic_year:read`. Acara urut tanggal, beserta hari efektif belajar: hari kerja (Senin–Jumat, atau ' +
          'Senin–Sabtu dengan `daysPerWeek=6`) dikurangi libur dan jeda cakupan sekolah. Tanpa `daysPerWeek`, hari ' +
          'efektif sekolah dari Pengaturan sekolah dipakai bila sudah disimpan; bila belum, Senin–Jumat.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ daysPerWeek: z.coerce.number().int().min(5).max(6).optional() }),
        response: {
          200: z.object({
            events: z.array(eventSchema),
            days: z.object({
              total: z.number().int(),
              workdays: z.number().int(),
              nonEffective: z.number().int(),
              effective: z.number().int(),
            }),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await yearOf(tx, request.params.id);
        const events = await tx
          .select()
          .from(calendarEvent)
          .where(eq(calendarEvent.academicYearId, year.id))
          .orderBy(asc(calendarEvent.startsOn), asc(calendarEvent.title));
        const [saved] = request.query.daysPerWeek
          ? []
          : await tx.select({ days: schoolSetting.workingDays }).from(schoolSetting);
        const workDays = saved?.days ?? 5;
        const closures = events.filter(
          (e) => e.scope === 'school' && (e.type === 'holiday' || e.type === 'break'),
        );
        return {
          events: events.map(({ schoolId: _s, createdAt: _c, ...e }) => e),
          days: effectiveDays(
            year,
            closures,
            request.query.daysPerWeek ? (request.query.daysPerWeek as 5 | 6) : workDays,
          ),
        };
      }),
  );

  app.post(
    '/v1/academic-years/:id/events',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Tambah acara kalender',
        description:
          'Izin: `academic_year:manage`. Tipe: `holiday`, `break`, `exam`, `activity`. Libur dan jeda hanya untuk cakupan ' +
          'sekolah dan mengurangi hari efektif; ujian dan kegiatan boleh untuk sekolah, satu kelas, atau satu jurusan.',
        headers: schoolHeader,
        params: idParams,
        body: eventBody,
        response: { 201: eventSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await tenant(request, async (tx) => {
        const year = await yearOf(tx, request.params.id);
        await validate(tx, year, request.body);
        const [r] = await tx
          .insert(calendarEvent)
          .values({ schoolId: ctx.schoolId, academicYearId: year.id, ...request.body })
          .returning();
        await audit(tx, ctx, 'calendar.create', 'calendar_event', r!.id, request.body);
        return r!;
      });
      const { schoolId: _s, createdAt: _c, ...event } = created;
      return reply.code(201).send(event);
    },
  );

  app.put(
    '/v1/events/:id',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Ubah acara kalender',
        description: 'Izin: `academic_year:manage`. Aturan sama dengan saat membuat.',
        headers: schoolHeader,
        params: idParams,
        body: eventBody,
        response: { 200: eventSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const updated = await tenant(request, async (tx) => {
        const [current] = await tx
          .select()
          .from(calendarEvent)
          .where(eq(calendarEvent.id, request.params.id));
        if (!current) throw notFound('Acara');
        const year = await yearOf(tx, current.academicYearId);
        await validate(tx, year, request.body);
        const [r] = await tx
          .update(calendarEvent)
          .set(request.body)
          .where(and(eq(calendarEvent.id, current.id)))
          .returning();
        await audit(tx, ctx, 'calendar.update', 'calendar_event', current.id, request.body);
        return r!;
      });
      const { schoolId: _s, createdAt: _c, ...event } = updated;
      return event;
    },
  );

  app.delete(
    '/v1/events/:id',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Hapus acara kalender',
        description: 'Izin: `academic_year:manage`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(calendarEvent)
          .where(eq(calendarEvent.id, request.params.id))
          .returning({ id: calendarEvent.id });
        if (rows.length === 0) throw notFound('Acara');
        await audit(tx, ctx, 'calendar.delete', 'calendar_event', request.params.id);
      });
      return { ok: true as const };
    },
  );
}
