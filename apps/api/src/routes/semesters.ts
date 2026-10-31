import { academicYear, and, asc, eq, ne, semester, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { loadSchoolSettings } from '../school-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const semesterSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isActive: z.boolean(),
});
const body = z.object({
  name: z.string().trim().min(1).max(40),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalid = (message: string) => new HttpError(400, 'invalid_period', message);

/** Tanggal harus berurutan, berada di dalam tahun ajaran, dan tidak tumpang tindih dengan semester lain pada tahun itu. */
async function assertPeriod(
  tx: Tx,
  year: { id: string; startsOn: string; endsOn: string },
  period: { startsOn: string; endsOn: string },
  exceptId?: string,
) {
  if (period.startsOn >= period.endsOn) throw invalid('Tanggal selesai harus setelah tanggal mulai.');
  if (period.startsOn < year.startsOn || period.endsOn > year.endsOn) {
    throw invalid('Semester harus berada di dalam rentang tahun ajaran.');
  }
  const others = await tx
    .select({ name: semester.name, startsOn: semester.startsOn, endsOn: semester.endsOn })
    .from(semester)
    .where(and(eq(semester.academicYearId, year.id), exceptId ? ne(semester.id, exceptId) : undefined));
  const clash = others.find((o) => period.startsOn <= o.endsOn && o.startsOn <= period.endsOn);
  if (clash) throw invalid(`Tumpang tindih dengan semester "${clash.name}".`);
}

async function yearOf(tx: Tx, id: string) {
  const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, id));
  if (!y) throw notFound('Tahun ajaran');
  return y;
}

/** Semester per tahun ajaran. Memakai izin tahun ajaran. */
export async function semesterRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };
  const row = (s: typeof semester.$inferSelect) => ({
    id: s.id,
    academicYearId: s.academicYearId,
    name: s.name,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    isActive: s.isActive,
  });

  app.get(
    '/v1/semesters',
    {
      onRequest: [requirePermission('academic_year:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar semester',
        description: 'Izin: `academic_year:read`. Tanpa `academicYearId`, semua semester ditampilkan.',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: { 200: z.array(semesterSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        (
          await tx
            .select()
            .from(semester)
            .where(
              request.query.academicYearId
                ? eq(semester.academicYearId, request.query.academicYearId)
                : undefined,
            )
            .orderBy(asc(semester.startsOn))
        ).map(row),
      ),
  );

  app.post(
    '/v1/academic-years/:id/semesters',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat semester',
        description:
          'Izin: `academic_year:manage`. Semester harus berada di dalam rentang tahun ajaran dan tidak tumpang tindih ' +
          'dengan semester lain. Nama harus unik pada tahun ajaran itu.',
        headers: schoolHeader,
        params: idParams,
        body,
        response: { 201: semesterSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama semester itu sudah ada pada tahun ajaran ini.', () =>
        tenant(request, async (tx) => {
          const year = await yearOf(tx, request.params.id);
          await assertPeriod(tx, year, request.body);
          const [r] = await tx
            .insert(semester)
            .values({ schoolId: ctx.schoolId, academicYearId: year.id, ...request.body })
            .returning();
          await audit(tx, ctx, 'semester.create', 'semester', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send(row(created));
    },
  );

  app.post(
    '/v1/academic-years/:id/semesters/default',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat semester bawaan sekolah otomatis',
        description:
          'Izin: `academic_year:manage`. Membuat semester sesuai nama di Pengaturan sekolah (bawaan Ganjil dan Genap; ' +
          '1 sampai 4 semester) dengan membagi tahun ajaran sama panjang. Ditolak bila tahun itu sudah punya semester; ' +
          'tanggalnya bisa diubah sesudahnya.',
        headers: schoolHeader,
        params: idParams,
        response: { 201: z.array(semesterSchema), 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await tenant(request, async (tx) => {
        const year = await yearOf(tx, request.params.id);
        const existing = await tx
          .select({ id: semester.id })
          .from(semester)
          .where(eq(semester.academicYearId, year.id))
          .limit(1);
        if (existing.length > 0) {
          throw new HttpError(409, 'conflict', 'Tahun ajaran ini sudah punya semester.');
        }
        const { semesterNames } = await loadSchoolSettings(tx, ctx.schoolId);
        const startMs = toDate(year.startsOn).getTime();
        const spanDays = Math.round((toDate(year.endsOn).getTime() - startMs) / DAY) + 1;
        const n = semesterNames.length;
        // Bagi hari tahun ajaran sama rata; sisa pembagian dibebankan ke semester-semester awal.
        let offset = 0;
        const parts = semesterNames.map((name, i) => {
          const len = Math.floor(spanDays / n) + (i < spanDays % n ? 1 : 0);
          const part = {
            schoolId: ctx.schoolId,
            academicYearId: year.id,
            name,
            startsOn: toIso(new Date(startMs + offset * DAY)),
            endsOn: toIso(new Date(startMs + (offset + len - 1) * DAY)),
          };
          offset += len;
          return part;
        });
        const rows = await tx.insert(semester).values(parts).returning();
        await audit(tx, ctx, 'semester.default', 'academic_year', year.id, { count: rows.length });
        return rows;
      });
      return reply.code(201).send(created.map(row));
    },
  );

  app.put(
    '/v1/semesters/:id',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Ubah semester',
        description:
          'Izin: `academic_year:manage`. Aturan rentang dan tumpang tindih sama dengan saat membuat.',
        headers: schoolHeader,
        params: idParams,
        body,
        response: { 200: semesterSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const updated = await conflictAs409('Nama semester itu sudah ada pada tahun ajaran ini.', () =>
        tenant(request, async (tx) => {
          const [current] = await tx.select().from(semester).where(eq(semester.id, request.params.id));
          if (!current) throw notFound('Semester');
          const year = await yearOf(tx, current.academicYearId);
          await assertPeriod(tx, year, request.body, current.id);
          const [r] = await tx
            .update(semester)
            .set(request.body)
            .where(eq(semester.id, current.id))
            .returning();
          await audit(tx, ctx, 'semester.update', 'semester', current.id, request.body);
          return r!;
        }),
      );
      return row(updated);
    },
  );

  app.put(
    '/v1/semesters/:id/activate',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Jadikan semester aktif',
        description:
          'Izin: `academic_year:manage`. Hanya satu semester yang aktif di sekolah. Tahun ajaran semester itu ikut menjadi ' +
          'tahun ajaran aktif agar keduanya selalu konsisten.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: semesterSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [target] = await tx.select().from(semester).where(eq(semester.id, request.params.id));
        if (!target) throw notFound('Semester');
        await tx.update(semester).set({ isActive: false }).where(eq(semester.isActive, true));
        await tx.update(semester).set({ isActive: true }).where(eq(semester.id, target.id));
        await tx.update(academicYear).set({ isActive: false }).where(eq(academicYear.isActive, true));
        await tx
          .update(academicYear)
          .set({ isActive: true })
          .where(eq(academicYear.id, target.academicYearId));
        await audit(tx, ctx, 'semester.activate', 'semester', target.id, { name: target.name });
        return row({ ...target, isActive: true });
      });
    },
  );

  app.delete(
    '/v1/semesters/:id',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Hapus semester',
        description: 'Izin: `academic_year:manage`. Semester yang sedang aktif tidak dapat dihapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [s] = await tx.select().from(semester).where(eq(semester.id, request.params.id));
        if (!s) throw notFound('Semester');
        if (s.isActive)
          throw new HttpError(409, 'in_use', 'Semester aktif tidak dapat dihapus. Aktifkan yang lain dulu.');
        await tx.delete(semester).where(eq(semester.id, s.id));
        await audit(tx, ctx, 'semester.delete', 'semester', s.id, { name: s.name });
      });
      return { ok: true as const };
    },
  );
}
