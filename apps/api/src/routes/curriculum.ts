import {
  and,
  asc,
  eq,
  inArray,
  refCurriculum,
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

const LEVELS = ['sd', 'smp', 'sma', 'smk'] as const;

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
        return {
          curricula: curricula.map((c) => {
            const mine = subjects.filter((s) => s.curriculumKey === c.key);
            const groups = [...new Set(mine.map((s) => s.levelGroup))];
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
          levelGroup: z.enum(LEVELS),
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
