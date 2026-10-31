import {
  and,
  asc,
  auditLog,
  count,
  eq,
  refCurriculum,
  refSchoolLevel,
  refSubject,
  schoolCurriculum,
  type Tx,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const levelKey = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[a-z][a-z0-9_]*$/, 'Huruf kecil, angka, dan garis bawah; diawali huruf.');
const curriculumKey = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Huruf kecil, angka, strip, dan garis bawah; diawali huruf.');
const code = z.string().trim().min(1).max(20);

const levelSchema = z.object({
  key: z.string(),
  name: z.string(),
  sort: z.number().int(),
  active: z.boolean(),
});
const curriculumSchema = z.object({ key: z.string(), name: z.string(), description: z.string() });
const subjectSchema = z.object({
  id: z.uuid(),
  curriculumKey: z.string(),
  levelGroup: z.string(),
  code: z.string(),
  name: z.string(),
  sort: z.number().int(),
  createdAt: z.iso.datetime(),
});

const levelBody = z.object({
  name: z.string().trim().min(1).max(60),
  sort: z.number().int().min(0).max(1000),
});
const curriculumBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
});
const subjectBody = z.object({
  levelGroup: levelKey,
  code,
  name: z.string().trim().min(1).max(80),
  sort: z.number().int().min(0).max(10_000),
});

const ok = z.object({ ok: z.literal(true) });
const tag = ['Platform'];
const guarded = { 401: errorSchema, 403: errorSchema };

type Staff = { actorId: string };

function log(tx: Tx, staff: Staff, action: string, entityType: string, entityId: string, details: object) {
  return tx.insert(auditLog).values({
    actorId: staff.actorId,
    action,
    entityType,
    entityId,
    details: details as Record<string, unknown>,
  });
}

async function assertLevelExists(tx: Tx, key: string) {
  const [row] = await tx.select().from(refSchoolLevel).where(eq(refSchoolLevel.key, key));
  if (!row) throw new HttpError(400, 'invalid_selection', `Jenjang "${key}" belum ada di daftar jenjang.`);
}

async function adoptedCount(tx: Tx, where: ReturnType<typeof and> | ReturnType<typeof eq>) {
  const [row] = await tx.select({ n: count() }).from(schoolCurriculum).where(where);
  return row?.n ?? 0;
}

/**
 * Bank kurikulum (acuan global): jenjang, kurikulum, dan mapel acuan. Hanya staf platform; staf admin menulis.
 * Sekolah menyalin mapel acuan lalu bebas mengubahnya, jadi perubahan acuan tidak menimpa data sekolah.
 */
export async function platformReferenceRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = () => app.platformDb;
  const staffOf = (request: { userId?: string }): Staff => ({ actorId: request.userId as string });

  app.get(
    '/v1/platform/reference',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Bank kurikulum: jenjang, kurikulum, dan mapel acuan',
        description:
          'Staf platform (read_only boleh). Setiap jenjang dan kurikulum menyertakan jumlah mapel acuan dan jumlah ' +
          'sekolah yang mengadopsinya (dasar larangan hapus). Jenjang nonaktif tetap tampil.',
        response: {
          200: z.object({
            levels: z.array(
              levelSchema.extend({ subjectCount: z.number().int(), schoolCount: z.number().int() }),
            ),
            curricula: z.array(
              curriculumSchema.extend({ subjectCount: z.number().int(), schoolCount: z.number().int() }),
            ),
            subjects: z.array(subjectSchema),
          }),
          ...guarded,
        },
      },
    },
    async () => {
      const [levels, curricula, subjects, adopted] = await Promise.all([
        db().select().from(refSchoolLevel).orderBy(asc(refSchoolLevel.sort), asc(refSchoolLevel.key)),
        db().select().from(refCurriculum).orderBy(asc(refCurriculum.name)),
        db().select().from(refSubject).orderBy(asc(refSubject.sort), asc(refSubject.code)),
        db().select().from(schoolCurriculum),
      ]);
      return {
        levels: levels.map((l) => ({
          ...l,
          subjectCount: subjects.filter((s) => s.levelGroup === l.key).length,
          schoolCount: adopted.filter((a) => a.levelGroup === l.key).length,
        })),
        curricula: curricula.map((c) => ({
          ...c,
          subjectCount: subjects.filter((s) => s.curriculumKey === c.key).length,
          schoolCount: adopted.filter((a) => a.curriculumKey === c.key).length,
        })),
        subjects: subjects.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
      };
    },
  );

  /* ---------- Jenjang ---------- */

  app.post(
    '/v1/platform/reference/levels',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Tambah jenjang',
        description: 'Staf platform (admin). Kunci jenjang tidak dapat diubah setelah dibuat.',
        body: levelBody.extend({ key: levelKey }),
        response: { 201: levelSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const staff = staffOf(request);
      const created = await db().transaction(async (tx) => {
        const [row] = await tx.insert(refSchoolLevel).values(request.body).onConflictDoNothing().returning();
        if (!row) throw new HttpError(409, 'conflict', 'Kunci jenjang itu sudah ada.');
        await log(tx, staff, 'reference.level.create', 'ref_school_level', row.key, request.body);
        return row;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/platform/reference/levels/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah nama, urutan, atau status jenjang',
        description:
          'Staf platform (admin). Jenjang nonaktif tidak tampil di pilihan sekolah dan tidak bisa diadopsi baru; ' +
          'adopsi yang sudah ada tidak berubah.',
        params: z.object({ key: z.string() }),
        body: levelBody.extend({ active: z.boolean() }),
        response: { 200: levelSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      return db().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(refSchoolLevel)
          .where(eq(refSchoolLevel.key, request.params.key));
        if (!before) throw new HttpError(404, 'not_found', 'Jenjang tidak ditemukan.');
        const [row] = await tx
          .update(refSchoolLevel)
          .set(request.body)
          .where(eq(refSchoolLevel.key, request.params.key))
          .returning();
        await log(tx, staff, 'reference.level.update', 'ref_school_level', before.key, {
          before: { name: before.name, sort: before.sort, active: before.active },
          after: request.body,
        });
        return row!;
      });
    },
  );

  app.delete(
    '/v1/platform/reference/levels/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus jenjang',
        description:
          'Staf platform (admin). Ditolak (409) bila masih ada mapel acuan atau sekolah yang mengadopsi jenjang ini; ' +
          'nonaktifkan saja bila begitu.',
        params: z.object({ key: z.string() }),
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      const { key } = request.params;
      await db().transaction(async (tx) => {
        const [exists] = await tx.select().from(refSchoolLevel).where(eq(refSchoolLevel.key, key));
        if (!exists) throw new HttpError(404, 'not_found', 'Jenjang tidak ditemukan.');
        const [subjects] = await tx
          .select({ n: count() })
          .from(refSubject)
          .where(eq(refSubject.levelGroup, key));
        const schools = await adoptedCount(tx, eq(schoolCurriculum.levelGroup, key));
        if ((subjects?.n ?? 0) > 0 || schools > 0) {
          throw new HttpError(
            409,
            'conflict',
            'Jenjang masih dipakai mapel acuan atau sekolah; nonaktifkan saja.',
          );
        }
        await tx.delete(refSchoolLevel).where(eq(refSchoolLevel.key, key));
        await log(tx, staff, 'reference.level.delete', 'ref_school_level', key, { name: exists.name });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Kurikulum ---------- */

  app.post(
    '/v1/platform/reference/curricula',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Tambah kurikulum acuan',
        description: 'Staf platform (admin). Kunci kurikulum tidak dapat diubah setelah dibuat.',
        body: curriculumBody.extend({ key: curriculumKey }),
        response: { 201: curriculumSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const staff = staffOf(request);
      const created = await db().transaction(async (tx) => {
        const [row] = await tx.insert(refCurriculum).values(request.body).onConflictDoNothing().returning();
        if (!row) throw new HttpError(409, 'conflict', 'Kunci kurikulum itu sudah ada.');
        await log(tx, staff, 'reference.curriculum.create', 'ref_curriculum', row.key, request.body);
        return row;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/platform/reference/curricula/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah nama atau keterangan kurikulum',
        description: 'Staf platform (admin).',
        params: z.object({ key: z.string() }),
        body: curriculumBody,
        response: { 200: curriculumSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      return db().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(refCurriculum)
          .where(eq(refCurriculum.key, request.params.key));
        if (!before) throw new HttpError(404, 'not_found', 'Kurikulum tidak ditemukan.');
        const [row] = await tx
          .update(refCurriculum)
          .set(request.body)
          .where(eq(refCurriculum.key, request.params.key))
          .returning();
        await log(tx, staff, 'reference.curriculum.update', 'ref_curriculum', before.key, {
          before: { name: before.name, description: before.description },
          after: request.body,
        });
        return row!;
      });
    },
  );

  app.delete(
    '/v1/platform/reference/curricula/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus kurikulum acuan beserta mapelnya',
        description:
          'Staf platform (admin). Ditolak (409) bila ada sekolah yang mengadopsi kurikulum ini. Mapel acuan ikut dihapus; ' +
          'salinan di sekolah tidak ada yang terpengaruh karena sekolah sudah menyalinnya.',
        params: z.object({ key: z.string() }),
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      const { key } = request.params;
      await db().transaction(async (tx) => {
        const [exists] = await tx.select().from(refCurriculum).where(eq(refCurriculum.key, key));
        if (!exists) throw new HttpError(404, 'not_found', 'Kurikulum tidak ditemukan.');
        if ((await adoptedCount(tx, eq(schoolCurriculum.curriculumKey, key))) > 0) {
          throw new HttpError(409, 'conflict', 'Kurikulum sudah diadopsi sekolah dan tidak dapat dihapus.');
        }
        const gone = await tx
          .delete(refSubject)
          .where(eq(refSubject.curriculumKey, key))
          .returning({ id: refSubject.id });
        await tx.delete(refCurriculum).where(eq(refCurriculum.key, key));
        await log(tx, staff, 'reference.curriculum.delete', 'ref_curriculum', key, {
          name: exists.name,
          subjectsRemoved: gone.length,
        });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Mapel acuan ---------- */

  app.post(
    '/v1/platform/reference/curricula/:key/subjects',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Tambah mapel acuan',
        description:
          'Staf platform (admin). Kode unik per kurikulum dan jenjang. Mapel baru muncul di sekolah yang sudah ' +
          'mengadopsi kurikulum+jenjang itu sebagai "acuan baru" yang bisa diadopsi.',
        params: z.object({ key: z.string() }),
        body: subjectBody,
        response: { 201: subjectSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const staff = staffOf(request);
      const created = await db().transaction(async (tx) => {
        const [cur] = await tx.select().from(refCurriculum).where(eq(refCurriculum.key, request.params.key));
        if (!cur) throw new HttpError(404, 'not_found', 'Kurikulum tidak ditemukan.');
        await assertLevelExists(tx, request.body.levelGroup);
        const [row] = await tx
          .insert(refSubject)
          .values({ ...request.body, curriculumKey: cur.key })
          .onConflictDoNothing()
          .returning();
        if (!row)
          throw new HttpError(409, 'conflict', 'Kode mapel itu sudah ada di kurikulum dan jenjang ini.');
        await log(tx, staff, 'reference.subject.create', 'ref_subject', row.id, {
          curriculumKey: cur.key,
          ...request.body,
        });
        return row;
      });
      return reply.code(201).send({ ...created, createdAt: created.createdAt.toISOString() });
    },
  );

  app.put(
    '/v1/platform/reference/subjects/:id',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah mapel acuan',
        description:
          'Staf platform (admin). Perubahan nama tidak menimpa mapel yang sudah disalin sekolah. Kurikulum tidak bisa ' +
          'dipindah; kode/jenjang yang bentrok ditolak (409).',
        params: z.object({ id: z.uuid() }),
        body: subjectBody,
        response: { 200: subjectSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      const updated = await db().transaction(async (tx) => {
        const [before] = await tx.select().from(refSubject).where(eq(refSubject.id, request.params.id));
        if (!before) throw new HttpError(404, 'not_found', 'Mapel acuan tidak ditemukan.');
        await assertLevelExists(tx, request.body.levelGroup);
        const [clash] = await tx
          .select({ id: refSubject.id })
          .from(refSubject)
          .where(
            and(
              eq(refSubject.curriculumKey, before.curriculumKey),
              eq(refSubject.levelGroup, request.body.levelGroup),
              eq(refSubject.code, request.body.code),
            ),
          );
        if (clash && clash.id !== before.id) {
          throw new HttpError(409, 'conflict', 'Kode mapel itu sudah ada di kurikulum dan jenjang ini.');
        }
        const [row] = await tx
          .update(refSubject)
          .set(request.body)
          .where(eq(refSubject.id, before.id))
          .returning();
        await log(tx, staff, 'reference.subject.update', 'ref_subject', before.id, {
          curriculumKey: before.curriculumKey,
          before: { levelGroup: before.levelGroup, code: before.code, name: before.name, sort: before.sort },
          after: request.body,
        });
        return row!;
      });
      return { ...updated, createdAt: updated.createdAt.toISOString() };
    },
  );

  app.delete(
    '/v1/platform/reference/subjects/:id',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus mapel acuan',
        description:
          'Staf platform (admin). Ditolak (409) bila ada sekolah yang mengadopsi kurikulum dan jenjang mapel ini.',
        params: z.object({ id: z.uuid() }),
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      await db().transaction(async (tx) => {
        const [row] = await tx.select().from(refSubject).where(eq(refSubject.id, request.params.id));
        if (!row) throw new HttpError(404, 'not_found', 'Mapel acuan tidak ditemukan.');
        const used = await adoptedCount(
          tx,
          and(
            eq(schoolCurriculum.curriculumKey, row.curriculumKey),
            eq(schoolCurriculum.levelGroup, row.levelGroup),
          ),
        );
        if (used > 0) {
          throw new HttpError(409, 'conflict', 'Kurikulum dan jenjang mapel ini sudah diadopsi sekolah.');
        }
        await tx.delete(refSubject).where(eq(refSubject.id, row.id));
        await log(tx, staff, 'reference.subject.delete', 'ref_subject', row.id, {
          curriculumKey: row.curriculumKey,
          levelGroup: row.levelGroup,
          code: row.code,
        });
      });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/platform/reference/curricula/:key/subjects/import',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Impor massal mapel acuan (CSV/Excel yang sudah dibaca menjadi baris)',
        description:
          'Staf platform (admin). Satu jenjang per impor. Baris dengan kode yang sudah ada memperbarui nama dan ' +
          'urutannya; kode baru ditambahkan. Seluruh impor dibatalkan bila ada baris yang tidak sah. Maksimal 500 baris.',
        params: z.object({ key: z.string() }),
        body: z.object({
          levelGroup: levelKey,
          rows: z
            .array(
              z.object({
                code,
                name: z.string().trim().min(1).max(80),
                sort: z.number().int().min(0).max(10_000).optional(),
              }),
            )
            .min(1)
            .max(500),
        }),
        response: {
          200: z.object({ created: z.number().int(), updated: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const staff = staffOf(request);
      const { levelGroup, rows } = request.body;
      const codes = rows.map((r) => r.code);
      if (new Set(codes).size !== codes.length) {
        throw new HttpError(400, 'invalid_selection', 'Ada kode mapel ganda di berkas impor.');
      }
      return db().transaction(async (tx) => {
        const [cur] = await tx.select().from(refCurriculum).where(eq(refCurriculum.key, request.params.key));
        if (!cur) throw new HttpError(404, 'not_found', 'Kurikulum tidak ditemukan.');
        await assertLevelExists(tx, levelGroup);
        const existing = await tx
          .select()
          .from(refSubject)
          .where(and(eq(refSubject.curriculumKey, cur.key), eq(refSubject.levelGroup, levelGroup)));
        const byCode = new Map(existing.map((s) => [s.code, s]));
        let nextSort = existing.reduce((m, s) => Math.max(m, s.sort), 0);
        let created = 0;
        let updated = 0;
        for (const r of rows) {
          const found = byCode.get(r.code);
          if (found) {
            await tx
              .update(refSubject)
              .set({ name: r.name, sort: r.sort ?? found.sort })
              .where(eq(refSubject.id, found.id));
            updated++;
          } else {
            nextSort += 10;
            await tx.insert(refSubject).values({
              curriculumKey: cur.key,
              levelGroup,
              code: r.code,
              name: r.name,
              sort: r.sort ?? nextSort,
            });
            created++;
          }
        }
        await log(tx, staff, 'reference.subject.import', 'ref_curriculum', cur.key, {
          levelGroup,
          created,
          updated,
        });
        return { created, updated };
      });
    },
  );
}
