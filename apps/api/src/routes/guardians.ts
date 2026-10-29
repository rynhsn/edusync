import {
  and,
  asc,
  count,
  eq,
  guardian,
  ilike,
  isNull,
  ne,
  or,
  student,
  studentGuardian,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const RELATIONS = ['father', 'mother', 'guardian', 'other'] as const;

/**
 * Nomor telepon menjadi digit berawalan kode negara (0812… → 62812…), siap dipakai pengiriman WhatsApp nanti.
 * Mengembalikan null bila kosong, dan undefined bila bentuknya tidak masuk akal.
 */
export function normalizePhone(input: string): string | null | undefined {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return undefined;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : undefined;
}

const phoneField = z
  .string()
  .max(30)
  .default('')
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (phone === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Nomor telepon tidak valid.' });
      return z.NEVER;
    }
    return phone;
  });
const emailField = z
  .union([z.literal(''), z.email().max(254)])
  .default('')
  .transform((v) => (v === '' ? null : v.toLowerCase()));

const guardianBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneField,
  email: emailField,
});
const linkSchema = z.object({
  guardianId: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  relation: z.enum(RELATIONS),
  isPrimary: z.boolean(),
  studentCount: z.number().int().describe('Jumlah siswa yang dinaungi wali ini (kakak-adik)'),
});

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

async function requireStudent(tx: Tx, studentId: string) {
  const [s] = await tx
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.id, studentId), isNull(student.deletedAt)));
  if (!s) throw notFound('Siswa');
}

async function linksOf(tx: Tx, studentId: string) {
  const rows = await tx
    .select({
      guardianId: guardian.id,
      name: guardian.name,
      phone: guardian.phone,
      email: guardian.email,
      relation: studentGuardian.relation,
      isPrimary: studentGuardian.isPrimary,
    })
    .from(studentGuardian)
    .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
    .where(eq(studentGuardian.studentId, studentId))
    .orderBy(asc(studentGuardian.createdAt));
  const counts = await tx
    .select({ guardianId: studentGuardian.guardianId, n: count() })
    .from(studentGuardian)
    .groupBy(studentGuardian.guardianId);
  return rows.map((r) => ({ ...r, studentCount: counts.find((c) => c.guardianId === r.guardianId)?.n ?? 1 }));
}

/** Wali murid dan hubungannya dengan siswa. Memakai izin siswa: data wali adalah bagian dari data siswa. */
export async function guardianRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/students/:id/guardians',
    {
      onRequest: [requirePermission('student:read')],
      schema: {
        tags: ['People'],
        summary: 'Wali seorang siswa',
        description: 'Izin: `student:read`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.array(linkSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requireStudent(tx, request.params.id);
        return linksOf(tx, request.params.id);
      }),
  );

  app.get(
    '/v1/guardians',
    {
      onRequest: [requirePermission('student:read')],
      schema: {
        tags: ['People'],
        summary: 'Cari wali',
        description:
          'Izin: `student:read`. Mencari pada nama, telepon, atau email; dipakai untuk menautkan wali yang sudah ada ' +
          '(mis. kakak-adik) ke siswa lain. Maksimal 20 hasil.',
        headers: schoolHeader,
        querystring: z.object({ q: z.string().trim().min(2).max(80) }),
        response: {
          200: z.array(z.object({ id: z.uuid(), name: z.string(), phone: z.string().nullable() })),
          ...guarded,
        },
      },
    },
    async (request) => {
      const q = `%${request.query.q}%`;
      return tenant(request, (tx) =>
        tx
          .select({ id: guardian.id, name: guardian.name, phone: guardian.phone })
          .from(guardian)
          .where(or(ilike(guardian.name, q), ilike(guardian.phone, q), ilike(guardian.email, q)))
          .orderBy(asc(guardian.name))
          .limit(20),
      );
    },
  );

  app.post(
    '/v1/students/:id/guardians',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Tambah wali untuk siswa',
        description:
          'Izin: `student:manage`. Kirim `guardianId` untuk menautkan wali yang sudah ada, atau `name` (dan opsional ' +
          'telepon dan email) untuk membuat wali baru. Telepon dinormalkan ke digit berawalan 62. Satu siswa hanya ' +
          'punya satu wali utama; menandai wali utama melepas tanda dari yang lain.',
        headers: schoolHeader,
        params: idParams,
        body: z
          .object({
            guardianId: z.uuid().optional(),
            name: z.string().trim().min(1).max(120).optional(),
            phone: phoneField,
            email: emailField,
            relation: z.enum(RELATIONS),
            isPrimary: z.boolean().default(false),
          })
          .refine((v) => v.guardianId || v.name, { message: 'Isi guardianId atau name.' }),
        response: {
          201: z.array(linkSchema),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { guardianId, name, phone, email, relation, isPrimary } = request.body;
      const links = await tenant(request, async (tx) => {
        await requireStudent(tx, request.params.id);
        let gid = guardianId;
        if (gid) {
          const [g] = await tx.select({ id: guardian.id }).from(guardian).where(eq(guardian.id, gid));
          if (!g) throw notFound('Wali');
        } else {
          const [g] = await tx
            .insert(guardian)
            .values({ schoolId: ctx.schoolId, name: name as string, phone, email })
            .returning({ id: guardian.id });
          gid = g?.id as string;
        }
        const existing = await tx
          .select({ id: studentGuardian.guardianId })
          .from(studentGuardian)
          .where(and(eq(studentGuardian.studentId, request.params.id), eq(studentGuardian.guardianId, gid)));
        if (existing.length > 0) throw new HttpError(409, 'conflict', 'Wali ini sudah tertaut ke siswa.');
        // Wali pertama siswa otomatis menjadi wali utama.
        const has = await tx
          .select({ id: studentGuardian.guardianId })
          .from(studentGuardian)
          .where(eq(studentGuardian.studentId, request.params.id))
          .limit(1);
        const primary = isPrimary || has.length === 0;
        if (primary) {
          await tx
            .update(studentGuardian)
            .set({ isPrimary: false })
            .where(eq(studentGuardian.studentId, request.params.id));
        }
        await tx.insert(studentGuardian).values({
          schoolId: ctx.schoolId,
          studentId: request.params.id,
          guardianId: gid,
          relation,
          isPrimary: primary,
        });
        await audit(tx, ctx, 'guardian.link', 'student', request.params.id, { guardianId: gid, relation });
        return linksOf(tx, request.params.id);
      });
      return reply.code(201).send(links);
    },
  );

  app.put(
    '/v1/guardians/:id',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Ubah data wali',
        description:
          'Izin: `student:manage`. Perubahan berlaku untuk semua siswa yang dinaungi wali ini (kakak-adik).',
        headers: schoolHeader,
        params: idParams,
        body: guardianBody,
        response: {
          200: z.object({
            id: z.uuid(),
            name: z.string(),
            phone: z.string().nullable(),
            email: z.string().nullable(),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [g] = await tx
          .update(guardian)
          .set(request.body)
          .where(eq(guardian.id, request.params.id))
          .returning();
        if (!g) throw notFound('Wali');
        await audit(tx, ctx, 'guardian.update', 'guardian', g.id, { name: g.name });
        return { id: g.id, name: g.name, phone: g.phone, email: g.email };
      });
    },
  );

  app.put(
    '/v1/students/:id/guardians/:guardianId',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Ubah hubungan atau status wali utama',
        description: 'Izin: `student:manage`.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), guardianId: z.uuid() }),
        body: z.object({ relation: z.enum(RELATIONS), isPrimary: z.boolean() }),
        response: { 200: z.array(linkSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const where = and(
          eq(studentGuardian.studentId, request.params.id),
          eq(studentGuardian.guardianId, request.params.guardianId),
        );
        const [link] = await tx.select().from(studentGuardian).where(where);
        if (!link) throw notFound('Tautan wali');
        if (request.body.isPrimary) {
          await tx
            .update(studentGuardian)
            .set({ isPrimary: false })
            .where(
              and(
                eq(studentGuardian.studentId, request.params.id),
                ne(studentGuardian.guardianId, link.guardianId),
              ),
            );
        }
        await tx.update(studentGuardian).set(request.body).where(where);
        await audit(tx, ctx, 'guardian.relink', 'student', request.params.id, {
          guardianId: link.guardianId,
          ...request.body,
        });
        return linksOf(tx, request.params.id);
      });
    },
  );

  app.delete(
    '/v1/students/:id/guardians/:guardianId',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Lepas wali dari siswa',
        description:
          'Izin: `student:manage`. Wali yang tidak menaungi siswa mana pun lagi ikut dihapus. Bila yang dilepas adalah ' +
          'wali utama, wali berikutnya (bila ada) menjadi utama.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), guardianId: z.uuid() }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .delete(studentGuardian)
          .where(
            and(
              eq(studentGuardian.studentId, request.params.id),
              eq(studentGuardian.guardianId, request.params.guardianId),
            ),
          )
          .returning({ wasPrimary: studentGuardian.isPrimary });
        if (rows.length === 0) throw notFound('Tautan wali');
        const [others] = await tx
          .select({ n: count() })
          .from(studentGuardian)
          .where(eq(studentGuardian.guardianId, request.params.guardianId));
        if ((others?.n ?? 0) === 0)
          await tx.delete(guardian).where(eq(guardian.id, request.params.guardianId));
        if (rows[0]?.wasPrimary) {
          const [next] = await tx
            .select({ guardianId: studentGuardian.guardianId })
            .from(studentGuardian)
            .where(eq(studentGuardian.studentId, request.params.id))
            .orderBy(asc(studentGuardian.createdAt))
            .limit(1);
          if (next) {
            await tx
              .update(studentGuardian)
              .set({ isPrimary: true })
              .where(
                and(
                  eq(studentGuardian.studentId, request.params.id),
                  eq(studentGuardian.guardianId, next.guardianId),
                ),
              );
          }
        }
        await audit(tx, ctx, 'guardian.unlink', 'student', request.params.id, {
          guardianId: request.params.guardianId,
        });
      });
      return { ok: true as const };
    },
  );
}
