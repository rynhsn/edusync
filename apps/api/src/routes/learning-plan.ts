import { isValidPlanLink, MAX_PLAN_OBJECTIVES, MAX_PLAN_TEXT } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  eq,
  inArray,
  learningObjective,
  learningPlan,
  learningPlanObjective,
  learningPlanSetting,
  semester,
  subject,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertObjectivesForSubject } from '../objective-achievement-lib';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';
import { assertCanWrite, requireLevel } from './teaching-plan';

/**
 * Perencanaan pembelajaran (tahap 3.6.1), opsional per sekolah lewat sakelar `learning_plan_setting` (baris tidak ada = mati).
 * Isi minimal tujuan, langkah, asesmen; berkas hanya berupa tautan https. Tidak memengaruhi nilai, rapor, atau alur lain.
 * Modul `grades`; izin baca `subject:read`, tulis `teaching_plan:write` + pengampu mapel (atau `curriculum:manage`).
 */

const tag = ['Curriculum'];
const gate = (perm: 'subject:read' | 'teaching_plan:write') => [
  requirePermission(perm),
  requireModule('grades'),
];
const notFound = () => new HttpError(404, 'not_found', 'Perencanaan pembelajaran tidak ditemukan.');
const bad = (code: string, message: string) => new HttpError(400, code, message);

const settingsOut = z.object({
  planEnabled: z.boolean(),
  journalEnabled: z.boolean(),
  reviewEnabled: z.boolean(),
  reviewMinPerSemester: z.number().int().min(1).max(4),
});
const DEFAULT_SETTINGS = {
  planEnabled: false,
  journalEnabled: false,
  reviewEnabled: false,
  reviewMinPerSemester: 1,
};

const text = (n: number) => z.string().trim().min(1).max(n);
const link = z.string().trim().max(500).nullable().optional();
const objectiveIds = z.array(z.uuid()).max(MAX_PLAN_OBJECTIVES * 2);

const planOut = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  academicYearId: z.uuid(),
  semesterId: z.uuid().nullable().describe('Kosong = setahun'),
  semesterName: z.string().nullable(),
  levelCode: z.string().nullable().describe('Kosong = semua tingkat'),
  teacherId: z.uuid().nullable().describe('Guru pemilik; kosong = milik sekolah'),
  teacherName: z.string().nullable(),
  title: z.string(),
  goals: z.string(),
  steps: z.string(),
  assessmentPlan: z.string(),
  linkUrl: z.string().nullable(),
  objectives: z.array(
    z.object({
      id: z.uuid(),
      code: z.string().nullable(),
      description: z.string(),
      active: z.boolean(),
    }),
  ),
  updatedAt: z.string(),
});

async function loadSettings(tx: Tx) {
  const [row] = await tx.select().from(learningPlanSetting);
  if (!row) return DEFAULT_SETTINGS;
  return {
    planEnabled: row.planEnabled,
    journalEnabled: row.journalEnabled,
    reviewEnabled: row.reviewEnabled,
    reviewMinPerSemester: row.reviewMinPerSemester,
  };
}

/** Sakelar perencanaan harus hidup; selain itu 403 `feature_disabled` (bukan `module_disabled`: itu entitlement berbayar). */
async function requirePlanEnabled(tx: Tx) {
  if (!(await loadSettings(tx)).planEnabled) {
    throw new HttpError(
      403,
      'feature_disabled',
      'Fitur perencanaan pembelajaran belum dinyalakan untuk sekolah ini.',
    );
  }
}

function normalizeLink(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!isValidPlanLink(value)) {
    throw bad('invalid_link', 'Tautan harus diawali https:// tanpa spasi dan maksimal 500 karakter.');
  }
  return value;
}

const planQuery = (tx: Tx) =>
  tx
    .select({
      id: learningPlan.id,
      subjectId: learningPlan.subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      academicYearId: learningPlan.academicYearId,
      semesterId: learningPlan.semesterId,
      semesterName: semester.name,
      levelCode: learningPlan.levelCode,
      teacherId: learningPlan.teacherId,
      teacherName: teacher.name,
      title: learningPlan.title,
      goals: learningPlan.goals,
      steps: learningPlan.steps,
      assessmentPlan: learningPlan.assessmentPlan,
      linkUrl: learningPlan.linkUrl,
      updatedAt: learningPlan.updatedAt,
    })
    .from(learningPlan)
    .innerJoin(subject, eq(subject.id, learningPlan.subjectId))
    .leftJoin(semester, eq(semester.id, learningPlan.semesterId))
    .leftJoin(teacher, eq(teacher.id, learningPlan.teacherId));

async function plansOf(tx: Tx, where?: ReturnType<typeof and>) {
  const rows = await planQuery(tx)
    .where(where)
    .orderBy(asc(subject.name), asc(learningPlan.title), asc(learningPlan.id));
  const links = rows.length
    ? await tx
        .select({
          planId: learningPlanObjective.planId,
          id: learningObjective.id,
          code: learningObjective.code,
          description: learningObjective.description,
          active: learningObjective.active,
        })
        .from(learningPlanObjective)
        .innerJoin(learningObjective, eq(learningObjective.id, learningPlanObjective.objectiveId))
        .where(
          inArray(
            learningPlanObjective.planId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(learningObjective.sortOrder), asc(learningObjective.code), asc(learningObjective.id))
    : [];
  return rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt.toISOString(),
    objectives: links.filter((l) => l.planId === r.id).map(({ planId: _p, ...o }) => o),
  }));
}

async function planOf(tx: Tx, id: string) {
  const [row] = await plansOf(tx, eq(learningPlan.id, id));
  if (!row) throw notFound();
  return row;
}

/** Ganti himpunan TP perencanaan (sudah divalidasi: milik mapel, aktif, maks 20; TP lama yang sudah terkait boleh tetap). */
async function replaceObjectives(
  tx: Tx,
  ctx: TenantContext,
  plan: { id: string; subjectId: string },
  ids: readonly string[],
) {
  const current = new Set(
    (
      await tx
        .select({ id: learningPlanObjective.objectiveId })
        .from(learningPlanObjective)
        .where(eq(learningPlanObjective.planId, plan.id))
    ).map((r) => r.id),
  );
  const valid = await assertObjectivesForSubject(tx, plan.subjectId, ids, { keep: current });
  await tx.delete(learningPlanObjective).where(eq(learningPlanObjective.planId, plan.id));
  if (valid.length) {
    await tx
      .insert(learningPlanObjective)
      .values(valid.map((objectiveId) => ({ schoolId: ctx.schoolId, planId: plan.id, objectiveId })));
  }
}

async function requireSemester(tx: Tx, semesterId: string | null | undefined, academicYearId: string) {
  if (!semesterId) return;
  const [row] = await tx
    .select({ yearId: semester.academicYearId })
    .from(semester)
    .where(eq(semester.id, semesterId));
  if (!row || row.yearId !== academicYearId) {
    throw bad('invalid_reference', 'Semester tidak ditemukan atau bukan milik tahun ajaran perencanaan.');
  }
}

export async function learningPlanRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);
  const featureNote = ' Sakelar perencanaan harus hidup (403 `feature_disabled`); modul `grades`.';
  const writeNote =
    ' Pemegang `curriculum:manage` boleh untuk semua mapel; guru hanya untuk mapel yang ia ampu pada tahun ajaran perencanaan ' +
    '(403 `not_subject_teacher`).';

  /* ---------- Sakelar ---------- */

  app.get(
    '/v1/learning-plan/settings',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: tag,
        summary: 'Sakelar fitur perencanaan, jurnal, dan penilaian proses',
        description:
          'Izin: `subject:read`. Tiga sakelar per sekolah; sekolah yang belum pernah mengaturnya mendapat semuanya `false` ' +
          '(baris tidak ada = mati). Dipakai web untuk menampilkan atau menyembunyikan menu dan bagian layar.',
        headers: schoolHeader,
        response: { 200: settingsOut, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => loadSettings(tx)),
  );

  app.put(
    '/v1/learning-plan/settings',
    {
      onRequest: [requirePermission('curriculum:manage')],
      schema: {
        tags: tag,
        summary: 'Ubah sakelar fitur perencanaan, jurnal, dan penilaian proses',
        description:
          'Izin: `curriculum:manage`. Field yang dihilangkan tidak berubah (bawaan: semua mati, `reviewMinPerSemester` 1). ' +
          '`journalEnabled` dan `reviewEnabled` dipakai tahap berikutnya. Dicatat di audit (`learning_plan.settings_update`).',
        headers: schoolHeader,
        body: z.object({
          planEnabled: z.boolean().optional(),
          journalEnabled: z.boolean().optional(),
          reviewEnabled: z.boolean().optional(),
          reviewMinPerSemester: z.number().int().min(1).max(4).optional(),
        }),
        response: { 200: settingsOut, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cur = await loadSettings(tx);
        const b = request.body;
        const next = {
          planEnabled: b.planEnabled ?? cur.planEnabled,
          journalEnabled: b.journalEnabled ?? cur.journalEnabled,
          reviewEnabled: b.reviewEnabled ?? cur.reviewEnabled,
          reviewMinPerSemester: b.reviewMinPerSemester ?? cur.reviewMinPerSemester,
        };
        await tx
          .insert(learningPlanSetting)
          .values({ schoolId: ctx.schoolId, ...next })
          .onConflictDoUpdate({
            target: learningPlanSetting.schoolId,
            set: { ...next, updatedAt: new Date() },
          });
        await audit(
          tx,
          ctx,
          'learning_plan.settings_update',
          'learning_plan_setting',
          ctx.schoolId,
          request.body,
        );
        return next;
      });
    },
  );

  /* ---------- Perencanaan ---------- */

  app.get(
    '/v1/learning-plans',
    {
      onRequest: gate('subject:read'),
      schema: {
        tags: tag,
        summary: 'Daftar perencanaan pembelajaran',
        description: `Izin: \`subject:read\`.${featureNote} Filter opsional \`subjectId\`, \`academicYearId\`, \`semesterId\`.`,
        headers: schoolHeader,
        querystring: z.object({
          subjectId: z.uuid().optional(),
          academicYearId: z.uuid().optional(),
          semesterId: z.uuid().optional(),
        }),
        response: { 200: z.object({ plans: z.array(planOut) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requirePlanEnabled(tx);
        const q = request.query;
        return {
          plans: await plansOf(
            tx,
            and(
              q.subjectId ? eq(learningPlan.subjectId, q.subjectId) : undefined,
              q.academicYearId ? eq(learningPlan.academicYearId, q.academicYearId) : undefined,
              q.semesterId ? eq(learningPlan.semesterId, q.semesterId) : undefined,
            ),
          ),
        };
      }),
  );

  const fields = {
    title: text(200),
    goals: text(MAX_PLAN_TEXT),
    steps: text(MAX_PLAN_TEXT),
    assessmentPlan: text(MAX_PLAN_TEXT),
    linkUrl: link,
    levelCode: z.string().trim().min(1).max(20).nullable().optional(),
    semesterId: z.uuid().nullable().optional(),
  };

  app.post(
    '/v1/learning-plans',
    {
      onRequest: gate('teaching_plan:write'),
      schema: {
        tags: tag,
        summary: 'Buat perencanaan pembelajaran',
        description:
          `Izin: \`teaching_plan:write\`.${featureNote}${writeNote} Minimal tujuan, langkah, dan asesmen (masing-masing wajib, ` +
          `maks ${MAX_PLAN_TEXT} karakter); \`linkUrl\` opsional (https saja, 400 \`invalid_link\`). \`semesterId\` kosong = setahun ` +
          '(semester harus milik tahun ajaran: 400 `invalid_reference`); `levelCode` kosong = semua tingkat (400 `invalid_level`). ' +
          '`objectiveIds` opsional (maks 20, TP aktif milik mapel itu: 400 `objective_subject_mismatch`, `objective_inactive`, ' +
          '`too_many_objectives`). Pemilik = guru pembuat bila ia terdaftar sebagai guru, selain itu milik sekolah. ' +
          'Tidak disalin saat rollover tahun ajaran.',
        headers: schoolHeader,
        body: z.object({
          subjectId: z.uuid(),
          academicYearId: z.uuid(),
          ...fields,
          objectiveIds: objectiveIds.optional(),
        }),
        response: { 201: planOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const out = await tenant(request, async (tx) => {
        await requirePlanEnabled(tx);
        const [subj] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, b.subjectId));
        if (!subj) throw new HttpError(404, 'not_found', 'Mata pelajaran tidak ditemukan.');
        const [year] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.id, b.academicYearId));
        if (!year) throw new HttpError(404, 'not_found', 'Tahun ajaran tidak ditemukan.');
        await assertCanWrite(tx, ctx, b.subjectId, b.academicYearId);
        await requireSemester(tx, b.semesterId, b.academicYearId);
        await requireLevel(tx, b.levelCode);
        const [owner] = await tx
          .select({ id: teacher.id })
          .from(teacher)
          .where(and(eq(teacher.memberId, ctx.memberId), eq(teacher.status, 'active')));
        const [row] = await tx
          .insert(learningPlan)
          .values({
            schoolId: ctx.schoolId,
            subjectId: b.subjectId,
            academicYearId: b.academicYearId,
            semesterId: b.semesterId ?? null,
            levelCode: b.levelCode ?? null,
            teacherId: owner?.id ?? null,
            title: b.title,
            goals: b.goals,
            steps: b.steps,
            assessmentPlan: b.assessmentPlan,
            linkUrl: normalizeLink(b.linkUrl) ?? null,
            createdBy: ctx.userId,
          })
          .returning({ id: learningPlan.id });
        await replaceObjectives(tx, ctx, { id: row!.id, subjectId: b.subjectId }, b.objectiveIds ?? []);
        await audit(tx, ctx, 'learning_plan.create', 'learning_plan', row!.id, {
          subjectId: b.subjectId,
          academicYearId: b.academicYearId,
        });
        return planOf(tx, row!.id);
      });
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/learning-plans/:id',
    {
      onRequest: gate('teaching_plan:write'),
      schema: {
        tags: tag,
        summary: 'Ubah perencanaan pembelajaran',
        description:
          `Izin: \`teaching_plan:write\`.${featureNote}${writeNote} Perencanaan boleh disunting bebas (tanpa versi atau penerbitan). ` +
          'Field yang dihilangkan tidak berubah; `semesterId`, `levelCode`, `linkUrl` null mengosongkan. Mapel dan tahun ajaran ' +
          'tidak bisa diubah. `objectiveIds` bila dikirim mengganti seluruh himpunan TP. Validasi seperti pada POST.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          title: fields.title.optional(),
          goals: fields.goals.optional(),
          steps: fields.steps.optional(),
          assessmentPlan: fields.assessmentPlan.optional(),
          linkUrl: fields.linkUrl,
          levelCode: fields.levelCode,
          semesterId: fields.semesterId,
          objectiveIds: objectiveIds.optional(),
        }),
        response: { 200: planOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        await requirePlanEnabled(tx);
        const plan = await planOf(tx, request.params.id);
        await assertCanWrite(tx, ctx, plan.subjectId, plan.academicYearId);
        if (b.semesterId !== undefined) await requireSemester(tx, b.semesterId, plan.academicYearId);
        if (b.levelCode !== undefined) await requireLevel(tx, b.levelCode);
        const linkUrl = normalizeLink(b.linkUrl);
        await tx
          .update(learningPlan)
          .set({
            title: b.title ?? plan.title,
            goals: b.goals ?? plan.goals,
            steps: b.steps ?? plan.steps,
            assessmentPlan: b.assessmentPlan ?? plan.assessmentPlan,
            semesterId: b.semesterId === undefined ? plan.semesterId : b.semesterId,
            levelCode: b.levelCode === undefined ? plan.levelCode : b.levelCode,
            linkUrl: linkUrl === undefined ? plan.linkUrl : linkUrl,
            updatedAt: new Date(),
          })
          .where(eq(learningPlan.id, plan.id));
        if (b.objectiveIds) await replaceObjectives(tx, ctx, plan, b.objectiveIds);
        await audit(tx, ctx, 'learning_plan.update', 'learning_plan', plan.id);
        return planOf(tx, plan.id);
      });
    },
  );

  app.put(
    '/v1/learning-plans/:id/objectives',
    {
      onRequest: gate('teaching_plan:write'),
      schema: {
        tags: tag,
        summary: 'Ganti himpunan TP perencanaan',
        description:
          `Izin: \`teaching_plan:write\`.${featureNote}${writeNote} Mengganti SELURUH himpunan TP (kosong = melepas semua). ` +
          `Maks ${MAX_PLAN_OBJECTIVES}; TP aktif milik mapel perencanaan (TP lama yang sudah terkait boleh tetap): 400 ` +
          '`objective_subject_mismatch`, `objective_inactive`, `too_many_objectives`, `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ objectiveIds }),
        response: { 200: planOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await requirePlanEnabled(tx);
        const plan = await planOf(tx, request.params.id);
        await assertCanWrite(tx, ctx, plan.subjectId, plan.academicYearId);
        await replaceObjectives(tx, ctx, plan, request.body.objectiveIds);
        await audit(tx, ctx, 'learning_plan.objectives', 'learning_plan', plan.id, {
          count: request.body.objectiveIds.length,
        });
        return planOf(tx, plan.id);
      });
    },
  );

  app.delete(
    '/v1/learning-plans/:id',
    {
      onRequest: gate('teaching_plan:write'),
      schema: {
        tags: tag,
        summary: 'Hapus perencanaan pembelajaran',
        description: `Izin: \`teaching_plan:write\`.${featureNote}${writeNote} Relasi TP ikut terhapus.`,
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await requirePlanEnabled(tx);
        const plan = await planOf(tx, request.params.id);
        await assertCanWrite(tx, ctx, plan.subjectId, plan.academicYearId);
        await tx.delete(learningPlan).where(eq(learningPlan.id, plan.id));
        await audit(tx, ctx, 'learning_plan.delete', 'learning_plan', plan.id);
        return { ok: true as const };
      });
    },
  );
}
