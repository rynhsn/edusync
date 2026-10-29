import { academicYear, auditLog, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';

const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });

const academicYearSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isActive: z.boolean(),
});

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((v) => v.startsOn < v.endsOn, { message: 'Tanggal selesai harus setelah tanggal mulai.' });

export async function academicYearRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/academic-years',
    {
      onRequest: [requirePermission('academic_year:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar tahun ajaran sekolah',
        description: 'Izin: `academic_year:read`.',
        headers: schoolHeader,
        response: { 200: z.array(academicYearSchema), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const rows = await withTenant(request.server.tenantDb, [ctx.schoolId], (tx) =>
        tx.select().from(academicYear).orderBy(academicYear.startsOn),
      );
      return rows.map(({ id, name, startsOn, endsOn, isActive }) => ({
        id,
        name,
        startsOn,
        endsOn,
        isActive,
      }));
    },
  );

  app.post(
    '/v1/academic-years',
    {
      onRequest: [requirePermission('academic_year:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat tahun ajaran',
        description: 'Izin: `academic_year:manage`. Nama harus unik di sekolah.',
        headers: schoolHeader,
        body: createSchema,
        response: {
          201: academicYearSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [row] = await tx
          .insert(academicYear)
          .values({ schoolId: ctx.schoolId, ...request.body })
          .onConflictDoNothing()
          .returning();
        if (!row) return null;
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'academic_year.create',
          entityType: 'academic_year',
          entityId: row.id,
          details: { name: row.name, viaRoles: ctx.roles },
        });
        return row;
      });
      if (!created) throw new HttpError(409, 'conflict', 'Tahun ajaran dengan nama itu sudah ada.');
      const { id, name, startsOn, endsOn, isActive } = created;
      return reply.code(201).send({ id, name, startsOn, endsOn, isActive });
    },
  );
}
