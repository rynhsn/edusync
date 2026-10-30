import {
  academicYear,
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  ilike,
  isNull,
  or,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, isForeignKeyViolation, ok, schoolHeader } from './helpers';

const personName = z.string().trim().min(1).max(120);
const optionalId = z
  .string()
  .trim()
  .max(30)
  .regex(/^[A-Za-z0-9./-]*$/, 'Hanya huruf, angka, titik, garis miring, dan tanda hubung.')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .default(null);

const teacherSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nip: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  memberId: z.uuid().nullable(),
});
const teacherBody = z.object({
  name: personName,
  nip: optionalId,
  status: z.enum(['active', 'inactive']).default('active'),
});

const STUDENT_STATUS = ['active', 'graduated', 'transferred', 'dropped'] as const;
const studentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  nisn: z.string().nullable(),
  gender: z.enum(['L', 'P']),
  birthDate: z.iso.date().nullable(),
  status: z.enum(STUDENT_STATUS),
  classId: z.uuid().nullable().describe('Kelas pada tahun ajaran aktif'),
  className: z.string().nullable(),
});
const studentBody = z.object({
  name: personName,
  nis: optionalId,
  nisn: optionalId,
  gender: z.enum(['L', 'P']),
  birthDate: z.iso.date().nullable().default(null),
  status: z.enum(STUDENT_STATUS).default('active'),
});

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

/** Kelas siswa pada tahun ajaran aktif (bila ada). */
async function currentClasses(tx: Tx, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, { classId: string; className: string }>();
  const rows = await tx
    .select({ studentId: enrollment.studentId, classId: classRoom.id, className: classRoom.name })
    .from(enrollment)
    .innerJoin(
      academicYear,
      and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
    )
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId));
  return new Map(rows.map((r) => [r.studentId, { classId: r.classId, className: r.className }]));
}

/** Tempatkan siswa di kelas (pada tahun ajaran kelas itu) atau cabut dari kelas tahun ajaran aktif. */
export async function placeStudent(tx: Tx, ctx: TenantContext, studentId: string, classId: string | null) {
  if (classId === null) {
    const [active] = await tx
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.isActive, true));
    if (active) {
      await tx
        .delete(enrollment)
        .where(and(eq(enrollment.studentId, studentId), eq(enrollment.academicYearId, active.id)));
    }
    return;
  }
  const [c] = await tx
    .select({ academicYearId: classRoom.academicYearId })
    .from(classRoom)
    .where(eq(classRoom.id, classId));
  if (!c) throw new HttpError(400, 'invalid_reference', 'Kelas tidak ditemukan.');
  await tx
    .insert(enrollment)
    .values({ schoolId: ctx.schoolId, studentId, classId, academicYearId: c.academicYearId })
    .onConflictDoUpdate({ target: [enrollment.studentId, enrollment.academicYearId], set: { classId } });
}

async function studentRow(tx: Tx, id: string) {
  const [s] = await tx
    .select()
    .from(student)
    .where(and(eq(student.id, id), isNull(student.deletedAt)));
  if (!s) throw notFound('Siswa');
  const current = (await currentClasses(tx, [s.id])).get(s.id);
  return {
    id: s.id,
    name: s.name,
    nis: s.nis,
    nisn: s.nisn,
    gender: s.gender,
    birthDate: s.birthDate,
    status: s.status,
    classId: current?.classId ?? null,
    className: current?.className ?? null,
  };
}

/** Guru dan siswa. */
export async function peopleRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ---------- Guru ---------- */

  app.get(
    '/v1/teachers',
    {
      onRequest: [requirePermission('teacher:read')],
      schema: {
        tags: ['People'],
        summary: 'Daftar guru',
        description: 'Izin: `teacher:read`. `q` mencari pada nama atau NIP.',
        headers: schoolHeader,
        querystring: z.object({ q: z.string().trim().max(80).optional() }),
        response: { 200: z.array(teacherSchema), ...guarded },
      },
    },
    async (request) => {
      const q = request.query.q;
      return tenant(request, (tx) =>
        tx
          .select({
            id: teacher.id,
            name: teacher.name,
            nip: teacher.nip,
            status: teacher.status,
            memberId: teacher.memberId,
          })
          .from(teacher)
          .where(q ? or(ilike(teacher.name, `%${q}%`), ilike(teacher.nip, `%${q}%`)) : undefined)
          .orderBy(asc(teacher.name)),
      );
    },
  );

  app.post(
    '/v1/teachers',
    {
      onRequest: [requirePermission('teacher:manage')],
      schema: {
        tags: ['People'],
        summary: 'Tambah guru',
        description: 'Izin: `teacher:manage`. NIP (bila diisi) harus unik di sekolah.',
        headers: schoolHeader,
        body: teacherBody,
        response: { 201: teacherSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('NIP itu sudah dipakai guru lain.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .insert(teacher)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'teacher.create', 'teacher', r!.id, { name: r!.name });
          return r!;
        }),
      );
      return reply.code(201).send({
        id: row.id,
        name: row.name,
        nip: row.nip,
        status: row.status,
        memberId: row.memberId,
      });
    },
  );

  app.put(
    '/v1/teachers/:id',
    {
      onRequest: [requirePermission('teacher:manage')],
      schema: {
        tags: ['People'],
        summary: 'Ubah guru',
        description: 'Izin: `teacher:manage`.',
        headers: schoolHeader,
        params: idParams,
        body: teacherBody,
        response: { 200: teacherSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('NIP itu sudah dipakai guru lain.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .update(teacher)
            .set(request.body)
            .where(eq(teacher.id, request.params.id))
            .returning();
          if (!r) throw notFound('Guru');
          await audit(tx, ctx, 'teacher.update', 'teacher', r.id, { name: r.name, status: r.status });
          return r;
        }),
      );
      return { id: row.id, name: row.name, nip: row.nip, status: row.status, memberId: row.memberId };
    },
  );

  app.delete(
    '/v1/teachers/:id',
    {
      onRequest: [requirePermission('teacher:manage')],
      schema: {
        tags: ['People'],
        summary: 'Hapus guru',
        description:
          'Izin: `teacher:manage`. Ditolak bila guru masih mengampu mata pelajaran; nonaktifkan saja (status `inactive`).',
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
            .delete(teacher)
            .where(eq(teacher.id, request.params.id))
            .returning({ id: teacher.id });
          if (rows.length === 0) throw notFound('Guru');
          await audit(tx, ctx, 'teacher.delete', 'teacher', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new HttpError(
            409,
            'in_use',
            'Guru masih mengampu mata pelajaran. Lepaskan atau nonaktifkan saja.',
          );
        }
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Siswa ---------- */

  app.get(
    '/v1/students',
    {
      onRequest: [requirePermission('student:read')],
      schema: {
        tags: ['People'],
        summary: 'Daftar siswa',
        description:
          'Izin: `student:read`. `q` mencari pada nama, NIS, atau NISN. `classId` menyaring menurut kelas pada tahun ' +
          'ajaran aktif. Siswa yang dihapus tidak ditampilkan.',
        headers: schoolHeader,
        querystring: z.object({
          q: z.string().trim().max(80).optional(),
          classId: z.uuid().optional(),
          status: z.enum(STUDENT_STATUS).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(studentSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) => {
      const { q, classId, status, limit, offset } = request.query;
      return tenant(request, async (tx) => {
        const classIds = classId
          ? new Set(
              (
                await tx
                  .select({ studentId: enrollment.studentId })
                  .from(enrollment)
                  .innerJoin(
                    academicYear,
                    and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
                  )
                  .where(eq(enrollment.classId, classId))
              ).map((r) => r.studentId),
            )
          : null;
        const where = and(
          isNull(student.deletedAt),
          status ? eq(student.status, status) : undefined,
          q
            ? or(ilike(student.name, `%${q}%`), ilike(student.nis, `%${q}%`), ilike(student.nisn, `%${q}%`))
            : undefined,
        );
        const all = await tx.select().from(student).where(where).orderBy(asc(student.name));
        const filtered = classIds ? all.filter((s) => classIds.has(s.id)) : all;
        const page = filtered.slice(offset, offset + limit);
        const current = await currentClasses(
          tx,
          page.map((s) => s.id),
        );
        return {
          total: filtered.length,
          items: page.map((s) => ({
            id: s.id,
            name: s.name,
            nis: s.nis,
            nisn: s.nisn,
            gender: s.gender,
            birthDate: s.birthDate,
            status: s.status,
            classId: current.get(s.id)?.classId ?? null,
            className: current.get(s.id)?.className ?? null,
          })),
        };
      });
    },
  );

  app.post(
    '/v1/students',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Tambah siswa',
        description:
          'Izin: `student:manage`. NIS dan NISN (bila diisi) harus unik di sekolah. `classId` opsional: siswa langsung ' +
          'ditempatkan di kelas itu pada tahun ajaran kelasnya.',
        headers: schoolHeader,
        body: studentBody.extend({ classId: z.uuid().nullable().default(null) }),
        response: { 201: studentSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { classId, ...fields } = request.body;
      const row = await conflictAs409('NIS atau NISN itu sudah dipakai siswa lain.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .insert(student)
            .values({ schoolId: ctx.schoolId, ...fields })
            .returning();
          if (classId) await placeStudent(tx, ctx, r!.id, classId);
          await audit(tx, ctx, 'student.create', 'student', r!.id, { name: r!.name, classId });
          return studentRow(tx, r!.id);
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.get(
    '/v1/students/:id',
    {
      onRequest: [requirePermission('student:read')],
      schema: {
        tags: ['People'],
        summary: 'Detail siswa',
        description: 'Izin: `student:read`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: studentSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => studentRow(tx, request.params.id)),
  );

  app.put(
    '/v1/students/:id',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Ubah data siswa',
        description:
          'Izin: `student:manage`. Status mengikuti siklus hidup siswa (aktif, lulus, pindah, keluar). Perpindahan kelas ' +
          'lewat `PUT /v1/students/{id}/class`.',
        headers: schoolHeader,
        params: idParams,
        body: studentBody,
        response: { 200: studentSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('NIS atau NISN itu sudah dipakai siswa lain.', () =>
        tenant(request, async (tx) => {
          const rows = await tx
            .update(student)
            .set(request.body)
            .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)))
            .returning({ id: student.id });
          if (rows.length === 0) throw notFound('Siswa');
          await audit(tx, ctx, 'student.update', 'student', request.params.id, {
            status: request.body.status,
          });
          return studentRow(tx, request.params.id);
        }),
      );
    },
  );

  app.put(
    '/v1/students/:id/class',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Tempatkan atau pindahkan siswa ke kelas',
        description:
          'Izin: `student:manage`. Siswa duduk di satu kelas per tahun ajaran; menempatkan ulang pada tahun ajaran ' +
          'yang sama memindahkannya. `classId: null` mencabut dari kelas pada tahun ajaran aktif.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ classId: z.uuid().nullable() }),
        response: { 200: studentSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await studentRow(tx, request.params.id);
        await placeStudent(tx, ctx, request.params.id, request.body.classId);
        await audit(tx, ctx, 'student.place', 'student', request.params.id, {
          classId: request.body.classId,
        });
        return studentRow(tx, request.params.id);
      });
    },
  );

  app.delete(
    '/v1/students/:id',
    {
      onRequest: [requirePermission('student:manage')],
      schema: {
        tags: ['People'],
        summary: 'Hapus siswa',
        description:
          'Izin: `student:manage`. Siswa disembunyikan (soft delete), riwayat enrollment tetap. Untuk siswa yang lulus ' +
          'atau pindah, ubah statusnya, jangan dihapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx
          .update(student)
          .set({ deletedAt: new Date() })
          .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)))
          .returning({ id: student.id });
        if (rows.length === 0) throw notFound('Siswa');
        await audit(tx, ctx, 'student.delete', 'student', request.params.id);
      });
      return { ok: true as const };
    },
  );
}
