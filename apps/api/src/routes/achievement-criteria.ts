import {
  CRITERIA_MODES,
  checkCriteria,
  effectiveThreshold,
  MAX_RUBRIC_LEVELS,
  resolveKkm,
} from '@edusync/contracts';
import {
  achievementCriteria,
  achievementRubricLevel,
  and,
  asc,
  eq,
  inArray,
  isNull,
  learningObjective,
  learningOutcome,
  program,
  schoolLevel,
  semester,
  sql,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  assertLiveGradingConfigEditable,
  loadGradingConfig,
  syncActiveSemesterFreeze,
} from '../grading-config-lib';
import { loadSettings } from '../grading-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { loadKktpRows } from '../kktp-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * KKTP (fase 2B tahap 3): kriteria ketercapaian per mapel, opsional per tingkat, program, dan TP, dengan empat mode
 * (numeric, interval, descriptor, rubric). Baca dengan `subject:read`, tulis dengan `curriculum:manage`. KKM efektif mapel
 * dipecah berjenjang oleh `kktp-lib`; tanpa kriteria hasilnya `grading_setting.kkm`.
 */

const bad = (code: string, message: string) => new HttpError(400, code, message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

/** Satu kunci per mapel: perubahan kriteria satu mapel berjalan bergantian, jadi pemeriksaan cakupan ganda tidak balapan. */
const lockSubject = (tx: Tx, subjectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kktp:${subjectId}`}))`);

/* ---------- Skema ---------- */

/** Nilai 0..100 dengan paling banyak dua desimal (sesuai numeric(5,2)), supaya yang tersimpan sama dengan yang dikirim. */
const scoreValue = z
  .number()
  .min(0)
  .max(100)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Paling banyak dua desimal.');

const levelIn = z.object({
  label: z.string().trim().min(1).max(120),
  descriptor: z.string().trim().max(1000).nullable().optional(),
  minScore: scoreValue.nullable().optional(),
  maxScore: scoreValue.nullable().optional(),
  isAchieved: z.boolean().default(false),
});

const criteriaBody = z.object({
  subjectId: z.uuid(),
  levelCode: z.string().trim().min(1).max(20).nullable().optional(),
  programId: z.uuid().nullable().optional(),
  objectiveId: z.uuid().nullable().optional(),
  mode: z.enum(CRITERIA_MODES),
  threshold: scoreValue.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
  levels: z.array(levelIn).max(MAX_RUBRIC_LEVELS).default([]),
});
type CriteriaBody = z.infer<typeof criteriaBody>;

const levelOut = z.object({
  id: z.uuid(),
  label: z.string(),
  descriptor: z.string().nullable(),
  minScore: z.number().nullable(),
  maxScore: z.number().nullable(),
  isAchieved: z.boolean(),
  sortOrder: z.number().int(),
});

const criteriaOut = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  levelCode: z.string().nullable(),
  programId: z.uuid().nullable(),
  objectiveId: z.uuid().nullable(),
  mode: z.enum(CRITERIA_MODES),
  threshold: z.number().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  effectiveThreshold: z
    .number()
    .nullable()
    .describe('Nilai terkecil yang tuntas menurut kriteria ini; null bila tak dapat dihitung'),
  levels: z.array(levelOut).optional().describe('Dihilangkan bila `includeRubric` false'),
  updatedAt: z.string(),
});

const syncedSemesterId = z
  .uuid()
  .optional()
  .describe(
    'Id semester aktif yang salinan beku konfigurasinya ikut ditulis ulang (aturan tulis-tembus); dihilangkan bila tidak ada.',
  );
const criteriaWriteOut = criteriaOut.extend({ syncedSemesterId });
const okSynced = ok.extend({ syncedSemesterId });

const boolQuery = z.enum(['true', 'false']).optional();

const writeNote =
  ' Mengubah KKM efektif memengaruhi rapor draf semua kelas, jadi ditolak 409 `report_final` selama semester aktif ' +
  'punya rapor final (buka kembali rapornya lebih dulu). Modul `grades` wajib aktif (403 `module_disabled`). ' +
  'Aturan tulis-tembus: bila semester aktif punya salinan konfigurasi beku, tidak punya rapor final, dan salinannya bukan kunci manual, ' +
  'salinan itu ikut ditulis ulang dari konfigurasi hidup di transaksi yang sama, dicatat di audit (`grading_config.sync`), dan respons ' +
  'membawa `syncedSemesterId` (dihilangkan bila tidak ada yang disinkronkan). Semester nonaktif yang beku tidak pernah berubah ' +
  'oleh perubahan KKTP.';

const gradesGate = (permission: Parameters<typeof requirePermission>[0]) => [
  requirePermission(permission),
  requireModule('grades'),
];

/* ---------- Akses data ---------- */

async function loadViews(tx: Tx, where: ReturnType<typeof and>, includeRubric: boolean) {
  const rows = await tx
    .select({
      c: achievementCriteria,
      subjectCode: subject.code,
      subjectName: subject.name,
    })
    .from(achievementCriteria)
    .innerJoin(subject, eq(subject.id, achievementCriteria.subjectId))
    .where(where)
    .orderBy(
      asc(subject.sortOrder),
      asc(subject.name),
      asc(achievementCriteria.levelCode),
      asc(achievementCriteria.id),
    );
  const levels = rows.length
    ? await tx
        .select()
        .from(achievementRubricLevel)
        .where(
          inArray(
            achievementRubricLevel.criteriaId,
            rows.map((r) => r.c.id),
          ),
        )
        .orderBy(asc(achievementRubricLevel.sortOrder), asc(achievementRubricLevel.id))
    : [];
  return rows.map(({ c, subjectCode, subjectName }) => {
    const own = levels.filter((l) => l.criteriaId === c.id);
    return {
      id: c.id,
      subjectId: c.subjectId,
      subjectCode,
      subjectName,
      levelCode: c.levelCode,
      programId: c.programId,
      objectiveId: c.objectiveId,
      mode: c.mode,
      threshold: c.threshold,
      note: c.note,
      active: c.active,
      effectiveThreshold: effectiveThreshold({ mode: c.mode, threshold: c.threshold, levels: own }),
      ...(includeRubric
        ? {
            levels: own.map((l) => ({
              id: l.id,
              label: l.label,
              descriptor: l.descriptor,
              minScore: l.minScore,
              maxScore: l.maxScore,
              isAchieved: l.isAchieved,
              sortOrder: l.sortOrder,
            })),
          }
        : {}),
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}

async function viewOf(tx: Tx, id: string) {
  const [view] = await loadViews(tx, eq(achievementCriteria.id, id), true);
  return view as NonNullable<typeof view>;
}

/** Rujukan dan bentuk kriteria; dilempar sebagai 400 sebelum ada yang ditulis. */
async function validateBody(tx: Tx, b: CriteriaBody) {
  const problem = checkCriteria({
    mode: b.mode,
    threshold: b.threshold ?? null,
    levels: b.levels,
  });
  if (problem) throw bad(problem.code, problem.message);

  const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, b.subjectId));
  if (!sub) throw bad('invalid_reference', 'Mata pelajaran tidak ditemukan.');
  if (b.levelCode) {
    const [lvl] = await tx
      .select({ code: schoolLevel.code })
      .from(schoolLevel)
      .where(eq(schoolLevel.code, b.levelCode));
    if (!lvl) throw bad('invalid_level', `Tingkat tidak ada di daftar tingkat sekolah: ${b.levelCode}.`);
  }
  if (b.programId) {
    const [prog] = await tx.select({ id: program.id }).from(program).where(eq(program.id, b.programId));
    if (!prog) throw bad('invalid_reference', 'Jurusan tidak ditemukan.');
  }
  if (b.objectiveId) {
    const [obj] = await tx
      .select({ subjectId: learningOutcome.subjectId })
      .from(learningObjective)
      .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
      .where(eq(learningObjective.id, b.objectiveId));
    if (!obj || obj.subjectId !== b.subjectId) {
      throw bad('invalid_reference', 'Tujuan pembelajaran tidak ditemukan pada mapel ini.');
    }
  }
}

/** Satu kriteria per cakupan (mapel, tingkat, program, TP). `exceptId` dikecualikan saat mengubah. */
async function assertScopeFree(tx: Tx, b: CriteriaBody, exceptId?: string) {
  const rows = await tx
    .select({ id: achievementCriteria.id })
    .from(achievementCriteria)
    .where(
      and(
        eq(achievementCriteria.subjectId, b.subjectId),
        b.levelCode ? eq(achievementCriteria.levelCode, b.levelCode) : isNull(achievementCriteria.levelCode),
        b.programId ? eq(achievementCriteria.programId, b.programId) : isNull(achievementCriteria.programId),
        b.objectiveId
          ? eq(achievementCriteria.objectiveId, b.objectiveId)
          : isNull(achievementCriteria.objectiveId),
      ),
    );
  if (rows.some((r) => r.id !== exceptId)) {
    throw new HttpError(
      409,
      'criteria_exists',
      'Sudah ada kriteria untuk mapel, tingkat, jurusan, dan tujuan pembelajaran itu; ubah yang ada.',
    );
  }
}

async function writeLevels(tx: Tx, ctx: TenantContext, criteriaId: string, levels: CriteriaBody['levels']) {
  if (levels.length === 0) return;
  await tx.insert(achievementRubricLevel).values(
    levels.map((l, i) => ({
      schoolId: ctx.schoolId,
      criteriaId,
      label: l.label,
      descriptor: l.descriptor ?? null,
      minScore: l.minScore ?? null,
      maxScore: l.maxScore ?? null,
      isAchieved: l.isAchieved,
      sortOrder: i,
    })),
  );
}

const scopeValues = (b: CriteriaBody) => ({
  subjectId: b.subjectId,
  levelCode: b.levelCode ?? null,
  programId: b.programId ?? null,
  objectiveId: b.objectiveId ?? null,
  mode: b.mode,
  threshold: b.mode === 'numeric' ? (b.threshold ?? null) : null,
  note: b.note ?? null,
  active: b.active,
});

export async function achievementCriteriaRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/achievement-criteria',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Daftar KKTP (kriteria ketercapaian tujuan pembelajaran)',
        description:
          'Izin: `subject:read`. Kriteria per mapel beserta `effectiveThreshold` (nilai terkecil yang tuntas) dan, bila ' +
          '`includeRubric` bukan `false`, level rubriknya. Filter opsional `subjectId`, `levelCode`, `programId`. ' +
          'Baris dengan `objectiveId` adalah kriteria TP; KKM mapel hanya memakai baris tanpa TP.',
        headers: schoolHeader,
        querystring: z.object({
          subjectId: z.uuid().optional(),
          levelCode: z.string().max(20).optional(),
          programId: z.uuid().optional(),
          includeRubric: boolQuery,
        }),
        response: { 200: z.object({ criteria: z.array(criteriaOut) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { subjectId, levelCode, programId, includeRubric } = request.query;
        const criteria = await loadViews(
          tx,
          and(
            subjectId ? eq(achievementCriteria.subjectId, subjectId) : undefined,
            levelCode ? eq(achievementCriteria.levelCode, levelCode) : undefined,
            programId ? eq(achievementCriteria.programId, programId) : undefined,
          ),
          includeRubric !== 'false',
        );
        return { criteria };
      }),
  );

  app.get(
    '/v1/achievement-criteria/resolve',
    {
      onRequest: gradesGate('subject:read'),
      schema: {
        tags: ['Curriculum'],
        summary: 'KKM efektif satu mapel (pratinjau pemecah KKTP)',
        description:
          'Izin: `subject:read`; modul `grades`. KKM efektif mapel untuk `levelCode` dan `programId` (keduanya opsional) beserta ' +
          'sumbernya. Urutan: (tingkat, program) lalu (tingkat) lalu (semua tingkat, program) lalu (mapel saja) lalu ' +
          '`grading_setting.kkm`; hanya kriteria aktif tanpa TP, dan kriteria yang nilainya tak dapat dihitung dilewati. ' +
          '`scope` = tingkat yang menang (`settings` bila tak ada kriteria). `semesterId` opsional: bila semester itu punya salinan ' +
          'beku konfigurasi nilai, pemecahan memakai salinan itu (respons membawa `frozen: true`); selain itu konfigurasi ' +
          'hidup. 404 `not_found` bila mapel atau `semesterId` bukan milik sekolah ini.',
        headers: schoolHeader,
        querystring: z.object({
          subjectId: z.uuid(),
          levelCode: z.string().max(20).optional(),
          programId: z.uuid().optional(),
          semesterId: z.uuid().optional(),
        }),
        response: {
          200: z.object({
            subjectId: z.uuid(),
            levelCode: z.string().nullable(),
            programId: z.uuid().nullable(),
            kkm: z.number(),
            scope: z.enum([
              'subject_level_program',
              'subject_level',
              'subject_program',
              'subject',
              'settings',
            ]),
            criteriaId: z.uuid().nullable(),
            mode: z.enum(CRITERIA_MODES).nullable(),
            schoolKkm: z.number().int().describe('KKM sekolah (jatuhan terakhir)'),
            frozen: z
              .literal(true)
              .optional()
              .describe('Ada (true) hanya bila hasil dipecah dari salinan beku semester `semesterId`'),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { subjectId } = request.query;
        const levelCode = request.query.levelCode ?? null;
        const programId = request.query.programId ?? null;
        const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, subjectId));
        if (!sub) throw notFound('Mata pelajaran');
        const semesterId = request.query.semesterId;
        if (semesterId) {
          const [sem] = await tx
            .select({ id: semester.id })
            .from(semester)
            .where(eq(semester.id, semesterId));
          if (!sem) throw notFound('Semester');
        }
        const cfg = semesterId ? await loadGradingConfig(tx, semesterId) : null;
        const settings = cfg ? cfg.settings : await loadSettings(tx);
        const rows =
          (cfg ? await cfg.kktpRows(tx, [subjectId]) : await loadKktpRows(tx, [subjectId])).get(subjectId) ??
          [];
        const r = resolveKkm(rows, { levelCode, programId }, settings.kkm);
        return {
          subjectId,
          levelCode,
          programId,
          kkm: r.kkm,
          scope: r.scope,
          criteriaId: r.criteriaId,
          mode: rows.find((x) => x.id === r.criteriaId)?.mode ?? null,
          schoolKkm: settings.kkm,
          ...(cfg?.frozen ? { frozen: true as const } : {}),
        };
      }),
  );

  app.post(
    '/v1/achievement-criteria',
    {
      onRequest: gradesGate('curriculum:manage'),
      schema: {
        tags: ['Curriculum'],
        summary: 'Tambah KKTP',
        description:
          'Izin: `curriculum:manage`; modul `grades`. Satu kriteria per (mapel, `levelCode`, `programId`, `objectiveId`); kosongnya ' +
          '`levelCode`/`programId` berarti berlaku untuk semua. `mode` numeric: wajib `threshold` 0..100 dan tanpa ' +
          '`levels`. interval/rubric: wajib sedikitnya satu level dengan `minScore` dan `maxScore`. descriptor: level ' +
          'boleh tanpa angka. Level ditulis menurut urutan array; `isAchieved` menandai level yang tuntas. Nilai ' +
          'berdesimal paling banyak dua digit. 400 `invalid_criteria`: bentuk tak sah. 400 `overlapping_levels`: rentang ' +
          'level bertumpuk. 400 `invalid_level`: tingkat tak ada di daftar tingkat sekolah. 400 `invalid_reference`: ' +
          'mapel, jurusan, atau TP bukan milik sekolah ini. 409 `criteria_exists`: cakupan sudah punya kriteria.' +
          writeNote,
        headers: schoolHeader,
        body: criteriaBody,
        response: { 201: criteriaWriteOut, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const out = await conflictAs409('Kriteria untuk cakupan itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await validateBody(tx, b);
          await lockSubject(tx, b.subjectId);
          await assertLiveGradingConfigEditable(tx, ctx.schoolId);
          await assertScopeFree(tx, b);
          const [row] = await tx
            .insert(achievementCriteria)
            .values({ schoolId: ctx.schoolId, ...scopeValues(b), createdBy: ctx.userId })
            .returning({ id: achievementCriteria.id });
          await writeLevels(tx, ctx, row!.id, b.levels);
          await audit(tx, ctx, 'achievement_criteria.create', 'achievement_criteria', row!.id, {
            subjectId: b.subjectId,
            levelCode: b.levelCode ?? null,
            programId: b.programId ?? null,
            objectiveId: b.objectiveId ?? null,
            mode: b.mode,
          });
          const synced = await syncActiveSemesterFreeze(tx, ctx);
          const view = await viewOf(tx, row!.id);
          return synced ? { ...view, syncedSemesterId: synced } : view;
        }),
      );
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/achievement-criteria/:id',
    {
      onRequest: gradesGate('curriculum:manage'),
      schema: {
        tags: ['Curriculum'],
        summary: 'Ubah KKTP',
        description:
          'Izin: `curriculum:manage`; modul `grades`. Mengganti seluruh kriteria beserta seluruh level rubriknya (level yang tidak ' +
          'dikirim dihapus); aturan dan galat sama dengan POST. 404 `not_found` bila tak ada.' +
          writeNote,
        headers: schoolHeader,
        params: idParams,
        body: criteriaBody,
        response: { 200: criteriaWriteOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Kriteria untuk cakupan itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [current] = await tx
            .select({ id: achievementCriteria.id, subjectId: achievementCriteria.subjectId })
            .from(achievementCriteria)
            .where(eq(achievementCriteria.id, request.params.id));
          if (!current) throw notFound('Kriteria');
          await validateBody(tx, b);
          // Kunci mapel lama dan baru (urut tetap) agar pemindahan cakupan tidak saling mengunci silang.
          for (const sid of [...new Set([current.subjectId, b.subjectId])].sort()) await lockSubject(tx, sid);
          await assertLiveGradingConfigEditable(tx, ctx.schoolId);
          await assertScopeFree(tx, b, current.id);
          await tx
            .update(achievementCriteria)
            .set({ ...scopeValues(b), updatedAt: new Date() })
            .where(eq(achievementCriteria.id, current.id));
          await tx.delete(achievementRubricLevel).where(eq(achievementRubricLevel.criteriaId, current.id));
          await writeLevels(tx, ctx, current.id, b.levels);
          await audit(tx, ctx, 'achievement_criteria.update', 'achievement_criteria', current.id, {
            subjectId: b.subjectId,
            levelCode: b.levelCode ?? null,
            programId: b.programId ?? null,
            objectiveId: b.objectiveId ?? null,
            mode: b.mode,
          });
          const synced = await syncActiveSemesterFreeze(tx, ctx);
          const view = await viewOf(tx, current.id);
          return synced ? { ...view, syncedSemesterId: synced } : view;
        }),
      );
    },
  );

  app.delete(
    '/v1/achievement-criteria/:id',
    {
      onRequest: gradesGate('curriculum:manage'),
      schema: {
        tags: ['Curriculum'],
        summary: 'Hapus KKTP',
        description:
          'Izin: `curriculum:manage`; modul `grades`. Menghapus kriteria beserta level rubriknya; KKM mapel itu kembali ke tingkat ' +
          'berikutnya atau KKM sekolah. 404 `not_found` bila tak ada.' +
          writeNote,
        headers: schoolHeader,
        params: idParams,
        response: { 200: okSynced, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [current] = await tx
          .select({ id: achievementCriteria.id, subjectId: achievementCriteria.subjectId })
          .from(achievementCriteria)
          .where(eq(achievementCriteria.id, request.params.id));
        if (!current) throw notFound('Kriteria');
        await lockSubject(tx, current.subjectId);
        await assertLiveGradingConfigEditable(tx, ctx.schoolId);
        await tx.delete(achievementCriteria).where(eq(achievementCriteria.id, current.id));
        await audit(tx, ctx, 'achievement_criteria.delete', 'achievement_criteria', current.id, {
          subjectId: current.subjectId,
        });
        const synced = await syncActiveSemesterFreeze(tx, ctx);
        return { ok: true as const, ...(synced ? { syncedSemesterId: synced } : {}) };
      });
    },
  );
}
