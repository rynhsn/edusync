import {
  and,
  asc,
  eq,
  inArray,
  refCurriculum,
  refSchoolLevel,
  refSubject,
  schoolCurriculum,
  subject,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

/**
 * Bank data kurikulum. Acuan bersifat global dan hanya-baca; sekolah "mengadopsi" dengan menyalin mapel acuan ke
 * daftar mapel sekolahnya, lalu bebas mengubahnya. Mapel yang kodenya sudah ada di sekolah dilewati, tidak ditimpa.
 */
export async function curriculumRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/reference/curricula',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Reference'],
        summary: 'Bank data kurikulum (acuan)',
        description:
          'Izin: `subject:read`. Daftar kurikulum acuan beserta mapelnya per kelompok jenjang, dan kurikulum yang sudah ' +
          'diadopsi sekolah ini. Data acuan adalah contoh awal; verifikasi terhadap regulasi terbaru.',
        headers: schoolHeader,
        response: {
          200: z.object({
            curricula: z.array(
              z.object({
                key: z.string(),
                name: z.string(),
                description: z.string(),
                levels: z.array(
                  z.object({
                    levelGroup: z.string(),
                    subjects: z.array(z.object({ code: z.string(), name: z.string() })),
                  }),
                ),
              }),
            ),
            adopted: z.array(
              z.object({ curriculumKey: z.string(), levelGroup: z.string(), adoptedAt: z.iso.datetime() }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const curricula = await tx.select().from(refCurriculum).orderBy(asc(refCurriculum.name));
        const subjects = await tx.select().from(refSubject).orderBy(asc(refSubject.sort));
        const adopted = await tx.select().from(schoolCurriculum);
        const active = new Set(
          (await tx.select().from(refSchoolLevel)).filter((l) => l.active).map((l) => l.key),
        );
        return {
          curricula: curricula.map((c) => {
            const mine = subjects.filter((s) => s.curriculumKey === c.key);
            const groups = [...new Set(mine.map((s) => s.levelGroup))].filter((g) => active.has(g));
            return {
              ...c,
              levels: groups.map((levelGroup) => ({
                levelGroup,
                subjects: mine
                  .filter((s) => s.levelGroup === levelGroup)
                  .map(({ code, name }) => ({ code, name })),
              })),
            };
          }),
          adopted: adopted.map((a) => ({
            curriculumKey: a.curriculumKey,
            levelGroup: a.levelGroup,
            adoptedAt: a.adoptedAt.toISOString(),
          })),
        };
      });
    },
  );

  app.get(
    '/v1/reference/levels',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Reference'],
        summary: 'Daftar jenjang acuan',
        description:
          'Izin: `subject:read`. Jenjang aktif yang dikelola platform (sd, smp, sma, smk, dan tambahan), berurutan; ' +
          'dipakai untuk memilih jenjang di bank kurikulum.',
        headers: schoolHeader,
        response: {
          200: z.object({
            levels: z.array(z.object({ key: z.string(), name: z.string(), sort: z.number().int() })),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const rows = await tx
          .select()
          .from(refSchoolLevel)
          .where(eq(refSchoolLevel.active, true))
          .orderBy(asc(refSchoolLevel.sort), asc(refSchoolLevel.key));
        return { levels: rows.map(({ key, name, sort }) => ({ key, name, sort })) };
      });
    },
  );

  app.get(
    '/v1/reference/curricula/updates',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Reference'],
        summary: 'Pembaruan acuan untuk kurikulum yang sudah diadopsi',
        description:
          'Izin: `subject:read`. Untuk tiap kurikulum+jenjang yang diadopsi sekolah ini, daftar mapel acuan yang ' +
          'ditambahkan platform setelah adopsi dan belum ada (kodenya) di mapel sekolah. Hanya perbandingan; mapel ' +
          'sekolah tidak pernah diubah. Adopsi lewat `POST /v1/curricula/adopt` dengan `subjectCodes`.',
        headers: schoolHeader,
        response: {
          200: z.object({
            updates: z.array(
              z.object({
                curriculumKey: z.string(),
                curriculumName: z.string(),
                levelGroup: z.string(),
                adoptedAt: z.iso.datetime(),
                newSubjects: z.array(z.object({ code: z.string(), name: z.string() })),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const adopted = await tx.select().from(schoolCurriculum);
        if (adopted.length === 0) return { updates: [] };
        const curricula = await tx.select().from(refCurriculum);
        const refs = await tx.select().from(refSubject).orderBy(asc(refSubject.sort));
        const mine = new Set((await tx.select({ code: subject.code }).from(subject)).map((s) => s.code));
        const updates = adopted.flatMap((a) => {
          const newSubjects = refs
            .filter(
              (r) =>
                r.curriculumKey === a.curriculumKey &&
                r.levelGroup === a.levelGroup &&
                r.createdAt > a.adoptedAt &&
                !mine.has(r.code),
            )
            .map(({ code, name }) => ({ code, name }));
          if (newSubjects.length === 0) return [];
          return [
            {
              curriculumKey: a.curriculumKey,
              curriculumName: curricula.find((c) => c.key === a.curriculumKey)?.name ?? a.curriculumKey,
              levelGroup: a.levelGroup,
              adoptedAt: a.adoptedAt.toISOString(),
              newSubjects,
            },
          ];
        });
        return { updates };
      });
    },
  );

  app.post(
    '/v1/curricula/adopt',
    {
      onRequest: [requirePermission('subject:manage')],
      schema: {
        tags: ['Reference'],
        summary: 'Adopsi mapel dari bank data kurikulum',
        description:
          'Izin: `subject:manage`. Menyalin mapel acuan (semua, atau hanya `subjectCodes` yang dipilih) ke mapel sekolah. ' +
          'Mapel dengan kode yang sudah ada dilewati. Salinan bebas diubah sekolah; pembaruan acuan tidak menimpanya.',
        headers: schoolHeader,
        body: z.object({
          curriculumKey: z.string().min(1).max(40),
          levelGroup: z.string().min(1).max(20),
          subjectCodes: z.array(z.string().min(1).max(20)).max(100).optional(),
        }),
        response: {
          200: z.object({ created: z.number().int(), skipped: z.number().int() }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { curriculumKey, levelGroup, subjectCodes } = request.body;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [lvl] = await tx.select().from(refSchoolLevel).where(eq(refSchoolLevel.key, levelGroup));
        if (!lvl?.active)
          throw new HttpError(404, 'not_found', 'Kurikulum atau jenjang itu tidak ada di bank data.');
        const refs = await tx
          .select()
          .from(refSubject)
          .where(
            and(
              eq(refSubject.curriculumKey, curriculumKey),
              eq(refSubject.levelGroup, levelGroup),
              subjectCodes ? inArray(refSubject.code, subjectCodes) : undefined,
            ),
          )
          .orderBy(asc(refSubject.sort));
        if (refs.length === 0) {
          throw new HttpError(404, 'not_found', 'Kurikulum atau jenjang itu tidak ada di bank data.');
        }
        const inserted = await tx
          .insert(subject)
          .values(refs.map((r) => ({ schoolId: ctx.schoolId, code: r.code, name: r.name })))
          .onConflictDoNothing()
          .returning({ id: subject.id });
        await tx
          .insert(schoolCurriculum)
          .values({ schoolId: ctx.schoolId, curriculumKey, levelGroup })
          .onConflictDoNothing();
        await audit(tx, ctx, 'curriculum.adopt', 'school', ctx.schoolId, {
          curriculumKey,
          levelGroup,
          created: inserted.length,
        });
        return { created: inserted.length, skipped: refs.length - inserted.length };
      });
    },
  );
}
