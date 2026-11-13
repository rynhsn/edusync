import { checkFlowItems, MAX_FLOW_ITEMS, PHASES, phaseForLevelCode } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  assessmentObjective,
  classRoom,
  count,
  desc,
  eq,
  inArray,
  learningFlow,
  learningFlowItem,
  learningObjective,
  learningOutcome,
  max,
  schoolLevel,
  semester,
  sql,
  studentObjectiveAchievement,
  subject,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInSchool } from '../attendance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, isForeignKeyViolation, ok, schoolHeader } from './helpers';

/**
 * Perangkat ajar milik sekolah (fase 2B tahap 2): capaian pembelajaran (CP), tujuan pembelajaran (TP), dan alur tujuan
 * pembelajaran (ATP). Seluruhnya opsional. Baca dengan `subject:read`; tulis dengan `teaching_plan:write` dan, di
 * dalam handler, pemegang `curriculum:manage` boleh untuk semua mapel sedangkan guru hanya untuk mapel yang ia ampu.
 */

const phaseEnum = z.enum(PHASES);
const bad = (code: string, message: string) => new HttpError(400, code, message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const inUse = (message: string) => new HttpError(409, 'in_use', message);
const published = () =>
  new HttpError(409, 'flow_published', 'ATP yang sudah terbit tidak bisa diubah; buat versi baru.');

/* ---------- Akses dan kunci ---------- */

/** Satu kunci per mapel: perubahan CP/TP/ATP satu mapel berjalan bergantian, jadi keputusan "sudah terbit" tidak balapan. */
const lockSubject = (tx: Tx, subjectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`teaching-plan:${subjectId}`}))`);

async function requireSubject(tx: Tx, id: string) {
  const [row] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, id));
  if (!row) throw notFound('Mata pelajaran');
}

/**
 * Pemegang `curriculum:manage` untuk semua mapel; selain itu hanya guru aktif yang punya penugasan pada mapel itu di
 * kelas yang tahun ajarannya belum berakhir (`ends_on` >= hari ini menurut zona waktu sekolah; tahun yang akan datang
 * termasuk, karena rollover menyalin penugasan ke tahun baru sebelum diaktifkan). Untuk ATP (`academicYearId` diberikan)
 * penugasan harus di kelas tahun ajaran ATP itu.
 */
async function assertCanWrite(tx: Tx, ctx: TenantContext, subjectId: string, academicYearId?: string) {
  if (ctx.permissions.has('curriculum:manage')) return;
  const conditions = [
    eq(teacher.memberId, ctx.memberId),
    eq(teacher.status, 'active'),
    eq(teachingAssignment.subjectId, subjectId),
    sql`${academicYear.endsOn} >= ${todayInSchool()}`,
  ];
  if (academicYearId) conditions.push(eq(classRoom.academicYearId, academicYearId));
  const rows = await tx
    .select({ id: teachingAssignment.id })
    .from(teachingAssignment)
    .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
    .innerJoin(classRoom, eq(classRoom.id, teachingAssignment.classId))
    .innerJoin(academicYear, eq(academicYear.id, classRoom.academicYearId))
    .where(and(...conditions))
    .limit(1);
  if (rows.length === 0) {
    throw new HttpError(
      403,
      'not_subject_teacher',
      'Anda bukan guru pengampu mata pelajaran ini. Penugasan Anda harus pada tahun ajaran berjalan atau yang akan datang' +
        (academicYearId ? ', dan pada tahun ajaran ATP ini.' : '.'),
    );
  }
}

/**
 * TP yang dipakai: item ATP berstatus terbit, ATAU dikaitkan ke penilaian (tahap 3.3, K14), dari himpunan yang diberikan.
 * Mengubah teks TP yang dipakai membuat versi baru; penilaian dan ATP terbit tetap menunjuk versi lama.
 */
async function usedByPublishedOrAssessed(tx: Tx, objectiveIds: string[]): Promise<Set<string>> {
  if (objectiveIds.length === 0) return new Set();
  const published = await tx
    .selectDistinct({ id: learningFlowItem.objectiveId })
    .from(learningFlowItem)
    .innerJoin(learningFlow, eq(learningFlow.id, learningFlowItem.flowId))
    .where(and(eq(learningFlow.status, 'published'), inArray(learningFlowItem.objectiveId, objectiveIds)));
  const assessed = await tx
    .selectDistinct({ id: assessmentObjective.objectiveId })
    .from(assessmentObjective)
    .where(inArray(assessmentObjective.objectiveId, objectiveIds));
  return new Set([...published, ...assessed].map((r) => r.id));
}

/* ---------- Skema ---------- */

const text = (n: number) => z.string().trim().min(1).max(n);
const code = z.string().trim().max(40).nullable().optional();

const outcomeOut = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  phase: phaseEnum,
  code: z.string().nullable(),
  description: z.string(),
  version: z.number().int(),
  supersedesId: z.uuid().nullable(),
  active: z.boolean(),
  objectiveCount: z.number().int(),
  updatedAt: z.string(),
});
const outcomeSaved = outcomeOut.extend({
  versioned: z.boolean().describe('true bila perubahan membuat versi baru (baris lama dinonaktifkan)'),
  previousId: z.uuid().nullable().describe('id versi sebelumnya bila versioned'),
});

const objectiveOut = z.object({
  id: z.uuid(),
  outcomeId: z.uuid(),
  code: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  version: z.number().int(),
  supersedesId: z.uuid().nullable(),
  active: z.boolean(),
  updatedAt: z.string(),
});
const objectiveSaved = objectiveOut.extend({
  versioned: z.boolean(),
  previousId: z.uuid().nullable(),
});

const quantity = z.number().int().min(0).max(9999).nullable().optional();

const itemIn = z.object({
  objectiveId: z.uuid(),
  weeks: quantity,
  periods: quantity,
  semesterId: z.uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
type ItemIn = z.infer<typeof itemIn>;

const itemOut = z.object({
  id: z.uuid(),
  objectiveId: z.uuid(),
  sortOrder: z.number().int(),
  weeks: z.number().int().nullable(),
  periods: z.number().int().nullable(),
  semesterId: z.uuid().nullable(),
  note: z.string().nullable(),
  objectiveCode: z.string().nullable(),
  objectiveDescription: z.string(),
  objectiveVersion: z.number().int(),
  objectiveActive: z.boolean(),
  outcomeId: z.uuid(),
  outcomeCode: z.string().nullable(),
  outcomePhase: phaseEnum,
  outcomeDescription: z.string(),
});

const flowOut = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  academicYearId: z.uuid(),
  academicYearName: z.string(),
  levelCode: z.string().nullable(),
  phase: phaseEnum.nullable(),
  name: z.string(),
  version: z.number().int(),
  supersedesId: z.uuid().nullable(),
  status: z.enum(['draft', 'published']),
  publishedAt: z.string().nullable(),
  itemCount: z.number().int(),
  updatedAt: z.string(),
});
const flowDetail = flowOut.extend({
  items: z.array(itemOut),
  inactiveItemCount: z
    .number()
    .int()
    .optional()
    .describe(
      'Jumlah item yang menunjuk TP nonaktif (diganti versi baru atau dinonaktifkan). ATP dengan item seperti ini tidak bisa diterbitkan (400 `inactive_objective`); ganti TP-nya dulu',
    ),
});

const flowIdParams = idParams;
const subjectParams = z.object({ subjectId: z.uuid() });
const boolQuery = z.enum(['true', 'false']).optional();

const iso = (d: Date) => d.toISOString();

function toOutcome(row: typeof learningOutcome.$inferSelect, objectiveCount: number) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    phase: row.phase as (typeof PHASES)[number],
    code: row.code,
    description: row.description,
    version: row.version,
    supersedesId: row.supersedesId,
    active: row.active,
    objectiveCount,
    updatedAt: iso(row.updatedAt),
  };
}

function toObjective(row: typeof learningObjective.$inferSelect) {
  return {
    id: row.id,
    outcomeId: row.outcomeId,
    code: row.code,
    description: row.description,
    sortOrder: row.sortOrder,
    version: row.version,
    supersedesId: row.supersedesId,
    active: row.active,
    updatedAt: iso(row.updatedAt),
  };
}

async function objectiveCount(tx: Tx, outcomeId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(learningObjective)
    .where(eq(learningObjective.outcomeId, outcomeId));
  return r?.n ?? 0;
}

async function loadOutcome(tx: Tx, id: string) {
  const [row] = await tx.select().from(learningOutcome).where(eq(learningOutcome.id, id));
  if (!row) throw notFound('Capaian pembelajaran');
  return row;
}

async function loadObjective(tx: Tx, id: string) {
  const [row] = await tx.select().from(learningObjective).where(eq(learningObjective.id, id));
  if (!row) throw notFound('Tujuan pembelajaran');
  return row;
}

/* ---------- ATP: pembacaan ---------- */

const flowColumns = {
  id: learningFlow.id,
  subjectId: learningFlow.subjectId,
  subjectCode: subject.code,
  subjectName: subject.name,
  academicYearId: learningFlow.academicYearId,
  academicYearName: academicYear.name,
  levelCode: learningFlow.levelCode,
  phase: learningFlow.phase,
  name: learningFlow.name,
  version: learningFlow.version,
  supersedesId: learningFlow.supersedesId,
  status: learningFlow.status,
  publishedAt: learningFlow.publishedAt,
  updatedAt: learningFlow.updatedAt,
};

type FlowRow = {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  academicYearId: string;
  academicYearName: string;
  levelCode: string | null;
  phase: string | null;
  name: string;
  version: number;
  supersedesId: string | null;
  status: 'draft' | 'published';
  publishedAt: Date | null;
  updatedAt: Date;
};

const toFlow = (r: FlowRow, itemCount: number) => ({
  ...r,
  phase: r.phase as (typeof PHASES)[number] | null,
  publishedAt: r.publishedAt ? iso(r.publishedAt) : null,
  updatedAt: iso(r.updatedAt),
  itemCount,
});

const flowQuery = (tx: Tx) =>
  tx
    .select(flowColumns)
    .from(learningFlow)
    .innerJoin(subject, eq(subject.id, learningFlow.subjectId))
    .innerJoin(academicYear, eq(academicYear.id, learningFlow.academicYearId));

async function loadFlowItems(tx: Tx, flowId: string) {
  const rows = await tx
    .select({
      id: learningFlowItem.id,
      objectiveId: learningFlowItem.objectiveId,
      sortOrder: learningFlowItem.sortOrder,
      weeks: learningFlowItem.weeks,
      periods: learningFlowItem.periods,
      semesterId: learningFlowItem.semesterId,
      note: learningFlowItem.note,
      objectiveCode: learningObjective.code,
      objectiveDescription: learningObjective.description,
      objectiveVersion: learningObjective.version,
      objectiveActive: learningObjective.active,
      outcomeId: learningOutcome.id,
      outcomeCode: learningOutcome.code,
      outcomePhase: learningOutcome.phase,
      outcomeDescription: learningOutcome.description,
    })
    .from(learningFlowItem)
    .innerJoin(learningObjective, eq(learningObjective.id, learningFlowItem.objectiveId))
    .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
    .where(eq(learningFlowItem.flowId, flowId))
    .orderBy(asc(learningFlowItem.sortOrder), asc(learningFlowItem.id));
  return rows.map((r) => ({ ...r, outcomePhase: r.outcomePhase as (typeof PHASES)[number] }));
}

async function flowDetailOf(tx: Tx, id: string) {
  const [row] = await flowQuery(tx).where(eq(learningFlow.id, id));
  if (!row) throw notFound('ATP');
  const items = await loadFlowItems(tx, id);
  return {
    ...toFlow(row as FlowRow, items.length),
    items,
    inactiveItemCount: items.filter((i) => !i.objectiveActive).length,
  };
}

/** Membaca ATP lalu mengunci mapelnya dan membaca ulang, supaya status yang diperiksa adalah yang terbaru. */
async function loadFlowLocked(tx: Tx, ctx: TenantContext, id: string) {
  const [first] = await tx.select().from(learningFlow).where(eq(learningFlow.id, id));
  if (!first) throw notFound('ATP');
  await assertCanWrite(tx, ctx, first.subjectId, first.academicYearId);
  await lockSubject(tx, first.subjectId);
  const [flow] = await tx.select().from(learningFlow).where(eq(learningFlow.id, id));
  if (!flow) throw notFound('ATP');
  return flow;
}

/* ---------- ATP: item ---------- */

/**
 * Item harus sah: tanpa duplikat, TP milik mapel yang sama dengan ATP, TP nonaktif hanya bila sudah ada di ATP ini,
 * dan semester milik tahun ajaran ATP.
 */
async function validateItems(
  tx: Tx,
  subjectId: string,
  academicYearId: string,
  items: ItemIn[],
  keepInactive: Set<string>,
) {
  const problem = checkFlowItems(items);
  if (problem === 'too_many') {
    throw bad('too_many_items', `Satu ATP maksimal ${MAX_FLOW_ITEMS} item.`);
  }
  if (problem === 'duplicate_entry') {
    throw bad('duplicate_entry', 'Satu TP hanya boleh muncul sekali dalam satu ATP.');
  }
  const objectiveIds = items.map((i) => i.objectiveId);
  if (objectiveIds.length > 0) {
    const found = await tx
      .select({
        id: learningObjective.id,
        active: learningObjective.active,
        subjectId: learningOutcome.subjectId,
      })
      .from(learningObjective)
      .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
      .where(inArray(learningObjective.id, objectiveIds));
    if (found.length !== objectiveIds.length)
      throw bad('invalid_reference', 'Tujuan pembelajaran tidak ditemukan.');
    if (found.some((f) => f.subjectId !== subjectId)) {
      throw bad('invalid_reference', 'Semua TP dalam ATP harus milik mata pelajaran yang sama dengan ATP.');
    }
    if (found.some((f) => !f.active && !keepInactive.has(f.id))) {
      throw bad(
        'inactive_objective',
        'TP yang sudah dinonaktifkan atau diganti versi baru tidak bisa ditambahkan.',
      );
    }
  }
  const semesterIds = [...new Set(items.flatMap((i) => (i.semesterId ? [i.semesterId] : [])))];
  if (semesterIds.length > 0) {
    const found = await tx
      .select({ id: semester.id, academicYearId: semester.academicYearId })
      .from(semester)
      .where(inArray(semester.id, semesterIds));
    if (found.length !== semesterIds.length || found.some((s) => s.academicYearId !== academicYearId)) {
      throw bad('invalid_reference', 'Semester harus milik tahun ajaran ATP.');
    }
  }
}

/** Mengganti seluruh item; urutan larik menentukan `sortOrder`. */
async function replaceItems(tx: Tx, ctx: TenantContext, flowId: string, items: ItemIn[]) {
  await tx.delete(learningFlowItem).where(eq(learningFlowItem.flowId, flowId));
  if (items.length === 0) return;
  await tx.insert(learningFlowItem).values(
    items.map((i, idx) => ({
      schoolId: ctx.schoolId,
      flowId,
      objectiveId: i.objectiveId,
      sortOrder: idx,
      weeks: i.weeks ?? null,
      periods: i.periods ?? null,
      semesterId: i.semesterId ?? null,
      note: i.note ?? null,
    })),
  );
}

async function requireLevel(tx: Tx, levelCode: string | null | undefined) {
  if (!levelCode) return;
  const [row] = await tx
    .select({ code: schoolLevel.code })
    .from(schoolLevel)
    .where(eq(schoolLevel.code, levelCode));
  if (!row) throw bad('invalid_level', `Tingkat tidak ada di daftar tingkat sekolah: ${levelCode}.`);
}

const sameKey = (f: { subjectId: string; academicYearId: string; name: string; levelCode: string | null }) =>
  and(
    eq(learningFlow.subjectId, f.subjectId),
    eq(learningFlow.academicYearId, f.academicYearId),
    eq(learningFlow.name, f.name),
    sql`${learningFlow.levelCode} is not distinct from ${f.levelCode}`,
  );

/* ---------- Rollover ---------- */

/**
 * Salin ATP berstatus terbit dari satu tahun ke tahun lain sebagai DRAFT versi 1 (item ikut; TP/CP tetap yang sama,
 * semester dikosongkan karena milik tahun sumber). Bila satu ATP punya beberapa versi terbit, hanya yang terbaru
 * disalin. Idempoten: ATP dengan (mapel, nama, tingkat) yang sama yang sudah ada di tahun tujuan dilewati. `write`
 * false hanya menghitung.
 */
export async function copyTeachingPlans(
  tx: Tx,
  ctx: TenantContext,
  sourceYearId: string,
  targetYearId: string,
  write: boolean,
): Promise<{ flowsCreated: number; inactiveFlows: number; inactiveItems: number }> {
  const key = (f: { subjectId: string; name: string; levelCode: string | null }) =>
    `${f.subjectId}|${f.name}|${f.levelCode ?? ''}`;
  const src = await tx
    .select()
    .from(learningFlow)
    .where(and(eq(learningFlow.academicYearId, sourceYearId), eq(learningFlow.status, 'published')))
    .orderBy(desc(learningFlow.version));
  const latest = new Map<string, typeof learningFlow.$inferSelect>();
  for (const f of src) if (!latest.has(key(f))) latest.set(key(f), f);
  const have = new Set(
    (await tx.select().from(learningFlow).where(eq(learningFlow.academicYearId, targetYearId))).map(key),
  );
  const todo = [...latest.values()].filter((f) => !have.has(key(f)));
  // Item yang menunjuk TP nonaktif tetap disalin (riwayat tidak dihapus), tetapi dilaporkan agar diganti sebelum terbit.
  const inactiveRows = todo.length
    ? await tx
        .select({ flowId: learningFlowItem.flowId })
        .from(learningFlowItem)
        .innerJoin(learningObjective, eq(learningObjective.id, learningFlowItem.objectiveId))
        .where(
          and(
            inArray(
              learningFlowItem.flowId,
              todo.map((f) => f.id),
            ),
            eq(learningObjective.active, false),
          ),
        )
    : [];
  const inactive = {
    inactiveFlows: new Set(inactiveRows.map((r) => r.flowId)).size,
    inactiveItems: inactiveRows.length,
  };
  if (!write) return { flowsCreated: todo.length, ...inactive };

  let created = 0;
  for (const f of todo) {
    const [row] = await tx
      .insert(learningFlow)
      .values({
        schoolId: ctx.schoolId,
        subjectId: f.subjectId,
        academicYearId: targetYearId,
        levelCode: f.levelCode,
        phase: f.phase,
        name: f.name,
        version: 1,
        status: 'draft',
        createdBy: ctx.userId,
      })
      .onConflictDoNothing()
      .returning({ id: learningFlow.id });
    if (!row) continue;
    const items = await tx
      .select()
      .from(learningFlowItem)
      .where(eq(learningFlowItem.flowId, f.id))
      .orderBy(asc(learningFlowItem.sortOrder));
    if (items.length > 0) {
      await tx.insert(learningFlowItem).values(
        items.map((i) => ({
          schoolId: ctx.schoolId,
          flowId: row.id,
          objectiveId: i.objectiveId,
          sortOrder: i.sortOrder,
          weeks: i.weeks,
          periods: i.periods,
          semesterId: null,
          note: i.note,
        })),
      );
    }
    created++;
  }
  return { flowsCreated: created, ...inactive };
}

/* ---------- Route ---------- */

export async function teachingPlanRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };
  const writeNote =
    ' Pemegang `curriculum:manage` boleh untuk semua mapel; guru hanya untuk mapel yang ia ampu pada tahun ajaran berjalan ' +
    'atau yang akan datang, yakni punya penugasan di kelas yang tahun ajarannya belum berakhir (untuk ATP: di kelas tahun ajaran ATP itu) ' +
    '(403 `not_subject_teacher`).';
  const supersededMsg = 'Versi ini sudah digantikan versi yang lebih baru; ubah versi terbaru.';

  /* ---------- CP ---------- */

  app.get(
    '/v1/subjects/:subjectId/outcomes',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Daftar capaian pembelajaran (CP) satu mapel',
        description:
          'Izin: `subject:read`. CP milik sekolah untuk mapel itu beserta jumlah TP-nya. Bawaan hanya yang aktif; ' +
          '`includeInactive=true` menyertakan versi lama. Filter opsional `phase` (A-F).',
        headers: schoolHeader,
        params: subjectParams,
        querystring: z.object({ phase: phaseEnum.optional(), includeInactive: boolQuery }),
        response: { 200: z.object({ outcomes: z.array(outcomeOut) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requireSubject(tx, request.params.subjectId);
        const { phase, includeInactive } = request.query;
        const rows = await tx
          .select()
          .from(learningOutcome)
          .where(
            and(
              eq(learningOutcome.subjectId, request.params.subjectId),
              phase ? eq(learningOutcome.phase, phase) : undefined,
              includeInactive === 'true' ? undefined : eq(learningOutcome.active, true),
            ),
          )
          .orderBy(asc(learningOutcome.phase), asc(learningOutcome.code), asc(learningOutcome.createdAt));
        const counts = new Map(
          (rows.length
            ? await tx
                .select({ id: learningObjective.outcomeId, n: count() })
                .from(learningObjective)
                .where(
                  inArray(
                    learningObjective.outcomeId,
                    rows.map((r) => r.id),
                  ),
                )
                .groupBy(learningObjective.outcomeId)
            : []
          ).map((c) => [c.id, c.n]),
        );
        return { outcomes: rows.map((r) => toOutcome(r, counts.get(r.id) ?? 0)) };
      }),
  );

  app.post(
    '/v1/subjects/:subjectId/outcomes',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Tambah capaian pembelajaran (CP)',
        description: `Izin: \`teaching_plan:write\`.${writeNote} Membuat CP versi 1 untuk mapel dan fase (A-F) itu.`,
        headers: schoolHeader,
        params: subjectParams,
        body: z.object({ phase: phaseEnum, code, description: text(4000) }),
        response: { 201: outcomeOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const out = await tenant(request, async (tx) => {
        await requireSubject(tx, request.params.subjectId);
        await assertCanWrite(tx, ctx, request.params.subjectId);
        const [row] = await tx
          .insert(learningOutcome)
          .values({
            schoolId: ctx.schoolId,
            subjectId: request.params.subjectId,
            phase: request.body.phase,
            code: request.body.code || null,
            description: request.body.description,
            createdBy: ctx.userId,
          })
          .returning();
        await audit(tx, ctx, 'learning_outcome.create', 'learning_outcome', row!.id, {
          subjectId: request.params.subjectId,
          phase: request.body.phase,
        });
        return toOutcome(row!, 0);
      });
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/outcomes/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Ubah capaian pembelajaran (CP)',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} \`phase\` dan \`description\` wajib; \`code\` dan \`active\` yang ` +
          'dihilangkan tidak berubah (`code` null mengosongkan). Bila fase atau deskripsi berubah DAN CP ini dipakai item ' +
          'ATP berstatus terbit atau salah satu TP-nya dikaitkan ke penilaian, CP lama tidak ditimpa: dibuat baris baru (`version` + 1, `supersedesId` = lama), yang lama ' +
          'dinonaktifkan, dan TP aktif milik CP lama disalin ke versi baru (versi baru juga, lama dinonaktifkan); ATP ' +
          'terbit tetap menunjuk yang lama (`versioned` true, `previousId` terisi). Bila belum dipakai, diubah di tempat. ' +
          '409 `superseded`: versi ini sudah punya penerus (berlaku juga untuk `active` true pada versi lama; aktifkan versi terbaru).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          phase: phaseEnum,
          code,
          description: text(4000),
          active: z.boolean().optional(),
        }),
        response: { 200: outcomeSaved, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      return tenant(request, async (tx) => {
        const first = await loadOutcome(tx, request.params.id);
        await assertCanWrite(tx, ctx, first.subjectId);
        await lockSubject(tx, first.subjectId);
        const cur = await loadOutcome(tx, request.params.id);
        const nextCode = body.code === undefined ? cur.code : body.code || null;
        const textChanged = body.phase !== cur.phase || body.description !== cur.description;

        // Mengaktifkan kembali versi lama (yang sudah punya penerus) juga ditolak walau teksnya tidak berubah.
        if (textChanged || body.active === true) {
          const [successor] = await tx
            .select({ id: learningOutcome.id })
            .from(learningOutcome)
            .where(eq(learningOutcome.supersedesId, cur.id))
            .limit(1);
          if (successor) throw new HttpError(409, 'superseded', supersededMsg);
        }

        const objectives = await tx
          .select()
          .from(learningObjective)
          .where(eq(learningObjective.outcomeId, cur.id));
        const used = textChanged
          ? (
              await usedByPublishedOrAssessed(
                tx,
                objectives.map((o) => o.id),
              )
            ).size > 0
          : false;

        if (used) {
          const [next] = await tx
            .insert(learningOutcome)
            .values({
              schoolId: ctx.schoolId,
              subjectId: cur.subjectId,
              phase: body.phase,
              code: nextCode,
              description: body.description,
              version: cur.version + 1,
              supersedesId: cur.id,
              active: body.active ?? cur.active,
              createdBy: ctx.userId,
            })
            .returning();
          await tx
            .update(learningOutcome)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(learningOutcome.id, cur.id));
          const active = objectives.filter((o) => o.active);
          if (active.length > 0) {
            await tx.insert(learningObjective).values(
              active.map((o) => ({
                schoolId: ctx.schoolId,
                outcomeId: next!.id,
                code: o.code,
                description: o.description,
                sortOrder: o.sortOrder,
                version: o.version + 1,
                supersedesId: o.id,
                createdBy: ctx.userId,
              })),
            );
            await tx
              .update(learningObjective)
              .set({ active: false, updatedAt: new Date() })
              .where(
                inArray(
                  learningObjective.id,
                  active.map((o) => o.id),
                ),
              );
          }
          await audit(tx, ctx, 'learning_outcome.version', 'learning_outcome', next!.id, {
            previousId: cur.id,
            version: next!.version,
          });
          return {
            ...toOutcome(next!, active.length),
            versioned: true,
            previousId: cur.id,
          };
        }

        const [row] = await tx
          .update(learningOutcome)
          .set({
            phase: body.phase,
            code: nextCode,
            description: body.description,
            active: body.active ?? cur.active,
            updatedAt: new Date(),
          })
          .where(eq(learningOutcome.id, cur.id))
          .returning();
        await audit(tx, ctx, 'learning_outcome.update', 'learning_outcome', cur.id);
        return {
          ...toOutcome(row!, await objectiveCount(tx, cur.id)),
          versioned: false,
          previousId: null,
        };
      });
    },
  );

  app.delete(
    '/v1/outcomes/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Hapus capaian pembelajaran (CP)',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} 409 \`in_use\`: CP masih punya TP atau sudah punya versi penerus; ` +
          'nonaktifkan lewat PUT `active` false.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        return await tenant(request, async (tx) => {
          const first = await loadOutcome(tx, request.params.id);
          await assertCanWrite(tx, ctx, first.subjectId);
          await lockSubject(tx, first.subjectId);
          if ((await objectiveCount(tx, first.id)) > 0) {
            throw inUse('CP masih punya TP; hapus TP-nya dulu atau nonaktifkan CP ini.');
          }
          const [successor] = await tx
            .select({ id: learningOutcome.id })
            .from(learningOutcome)
            .where(eq(learningOutcome.supersedesId, first.id))
            .limit(1);
          if (successor) throw inUse('CP ini punya versi penerus; nonaktifkan saja.');
          await tx.delete(learningOutcome).where(eq(learningOutcome.id, first.id));
          await audit(tx, ctx, 'learning_outcome.delete', 'learning_outcome', first.id);
          return { ok: true as const };
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('CP masih dipakai data lain.');
        throw error;
      }
    },
  );

  /* ---------- TP ---------- */

  app.get(
    '/v1/outcomes/:id/objectives',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Daftar tujuan pembelajaran (TP) satu CP',
        description:
          'Izin: `subject:read`. TP di bawah CP itu menurut `sortOrder`. Bawaan hanya yang aktif; ' +
          '`includeInactive=true` menyertakan versi lama.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ includeInactive: boolQuery }),
        response: { 200: z.object({ objectives: z.array(objectiveOut) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await loadOutcome(tx, request.params.id);
        const rows = await tx
          .select()
          .from(learningObjective)
          .where(
            and(
              eq(learningObjective.outcomeId, request.params.id),
              request.query.includeInactive === 'true' ? undefined : eq(learningObjective.active, true),
            ),
          )
          .orderBy(
            asc(learningObjective.sortOrder),
            asc(learningObjective.createdAt),
            asc(learningObjective.id),
          );
        return { objectives: rows.map(toObjective) };
      }),
  );

  app.post(
    '/v1/outcomes/:id/objectives',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Tambah tujuan pembelajaran (TP)',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} Membuat TP versi 1 di bawah CP itu; \`sortOrder\` yang ` +
          'dihilangkan diisi urutan berikutnya. 409 `outcome_inactive`: CP sudah dinonaktifkan atau diganti versi baru.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          code,
          description: text(4000),
          sortOrder: z.number().int().min(0).max(100000).optional(),
        }),
        response: { 201: objectiveOut, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const out = await tenant(request, async (tx) => {
        const first = await loadOutcome(tx, request.params.id);
        await assertCanWrite(tx, ctx, first.subjectId);
        await lockSubject(tx, first.subjectId);
        const outcome = await loadOutcome(tx, request.params.id);
        if (!outcome.active) {
          throw new HttpError(409, 'outcome_inactive', 'CP sudah dinonaktifkan atau diganti versi baru.');
        }
        let sortOrder = request.body.sortOrder;
        if (sortOrder === undefined) {
          const [m] = await tx
            .select({ top: max(learningObjective.sortOrder) })
            .from(learningObjective)
            .where(eq(learningObjective.outcomeId, outcome.id));
          sortOrder = m?.top === null || m?.top === undefined ? 0 : m.top + 1;
        }
        const [row] = await tx
          .insert(learningObjective)
          .values({
            schoolId: ctx.schoolId,
            outcomeId: outcome.id,
            code: request.body.code || null,
            description: request.body.description,
            sortOrder,
            createdBy: ctx.userId,
          })
          .returning();
        await audit(tx, ctx, 'learning_objective.create', 'learning_objective', row!.id, {
          outcomeId: outcome.id,
        });
        return toObjective(row!);
      });
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/objectives/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Ubah tujuan pembelajaran (TP)',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} \`description\` wajib; \`code\`, \`sortOrder\`, \`active\` yang ` +
          'dihilangkan tidak berubah (`code` null mengosongkan). Bila deskripsi berubah DAN TP ini dipakai item ATP ' +
          'berstatus terbit ATAU dikaitkan ke penilaian (ketercapaian TP), TP lama tidak ditimpa: dibuat baris baru (`version` + 1, `supersedesId` = lama) dan yang lama ' +
          'dinonaktifkan; ATP terbit dan penilaian tetap menunjuk yang lama (`versioned` true, `previousId` terisi). Bila belum dipakai, ' +
          'diubah di tempat. 409 `superseded`: versi ini sudah punya penerus; berlaku juga untuk `active` true pada versi lama (aktifkan versi terbaru).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          code,
          description: text(4000),
          sortOrder: z.number().int().min(0).max(100000).optional(),
          active: z.boolean().optional(),
        }),
        response: { 200: objectiveSaved, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      return tenant(request, async (tx) => {
        const firstObj = await loadObjective(tx, request.params.id);
        const outcome = await loadOutcome(tx, firstObj.outcomeId);
        await assertCanWrite(tx, ctx, outcome.subjectId);
        await lockSubject(tx, outcome.subjectId);
        const cur = await loadObjective(tx, request.params.id);
        const nextCode = body.code === undefined ? cur.code : body.code || null;
        const textChanged = body.description !== cur.description;

        if (textChanged || body.active === true) {
          const [successor] = await tx
            .select({ id: learningObjective.id })
            .from(learningObjective)
            .where(eq(learningObjective.supersedesId, cur.id))
            .limit(1);
          if (successor) throw new HttpError(409, 'superseded', supersededMsg);
        }

        if (textChanged && (await usedByPublishedOrAssessed(tx, [cur.id])).has(cur.id)) {
          const [next] = await tx
            .insert(learningObjective)
            .values({
              schoolId: ctx.schoolId,
              outcomeId: cur.outcomeId,
              code: nextCode,
              description: body.description,
              sortOrder: body.sortOrder ?? cur.sortOrder,
              version: cur.version + 1,
              supersedesId: cur.id,
              active: body.active ?? cur.active,
              createdBy: ctx.userId,
            })
            .returning();
          await tx
            .update(learningObjective)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(learningObjective.id, cur.id));
          await audit(tx, ctx, 'learning_objective.version', 'learning_objective', next!.id, {
            previousId: cur.id,
            version: next!.version,
          });
          return { ...toObjective(next!), versioned: true, previousId: cur.id };
        }

        const [row] = await tx
          .update(learningObjective)
          .set({
            code: nextCode,
            description: body.description,
            sortOrder: body.sortOrder ?? cur.sortOrder,
            active: body.active ?? cur.active,
            updatedAt: new Date(),
          })
          .where(eq(learningObjective.id, cur.id))
          .returning();
        await audit(tx, ctx, 'learning_objective.update', 'learning_objective', cur.id);
        return { ...toObjective(row!), versioned: false, previousId: null };
      });
    },
  );

  app.delete(
    '/v1/objectives/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Hapus tujuan pembelajaran (TP)',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} 409 \`in_use\`: TP dirujuk item ATP (draf maupun terbit), dikaitkan ke penilaian, ` +
          'punya keputusan ketercapaian guru, atau sudah punya versi penerus; nonaktifkan lewat PUT `active` false.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        return await tenant(request, async (tx) => {
          const first = await loadObjective(tx, request.params.id);
          const outcome = await loadOutcome(tx, first.outcomeId);
          await assertCanWrite(tx, ctx, outcome.subjectId);
          await lockSubject(tx, outcome.subjectId);
          const [item] = await tx
            .select({ id: learningFlowItem.id })
            .from(learningFlowItem)
            .where(eq(learningFlowItem.objectiveId, first.id))
            .limit(1);
          if (item) throw inUse('TP dipakai ATP; keluarkan dari ATP-nya atau nonaktifkan TP ini.');
          const [linked] = await tx
            .select({ id: assessmentObjective.assessmentId })
            .from(assessmentObjective)
            .where(eq(assessmentObjective.objectiveId, first.id))
            .limit(1);
          if (linked)
            throw inUse('TP dikaitkan ke penilaian; lepaskan dari penilaiannya atau nonaktifkan TP ini.');
          const [decided] = await tx
            .select({ id: studentObjectiveAchievement.id })
            .from(studentObjectiveAchievement)
            .where(eq(studentObjectiveAchievement.objectiveId, first.id))
            .limit(1);
          if (decided) throw inUse('TP sudah punya keputusan ketercapaian guru; nonaktifkan saja.');
          const [successor] = await tx
            .select({ id: learningObjective.id })
            .from(learningObjective)
            .where(eq(learningObjective.supersedesId, first.id))
            .limit(1);
          if (successor) throw inUse('TP ini punya versi penerus; nonaktifkan saja.');
          await tx.delete(learningObjective).where(eq(learningObjective.id, first.id));
          await audit(tx, ctx, 'learning_objective.delete', 'learning_objective', first.id);
          return { ok: true as const };
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('TP masih dipakai data lain.');
        throw error;
      }
    },
  );

  /* ---------- ATP ---------- */

  const flowDescNote =
    ' Satu ATP milik satu mapel dan satu tahun ajaran; isinya urutan TP (maksimal 300) dengan minggu, JP, dan semester.';

  app.get(
    '/v1/learning-flows',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Daftar alur tujuan pembelajaran (ATP)',
        description:
          'Izin: `subject:read`. ATP sekolah beserta jumlah item (tanpa isi item; lihat GET per id). Filter opsional ' +
          '`subjectId`, `academicYearId`, `status` (`draft` atau `published`).',
        headers: schoolHeader,
        querystring: z.object({
          subjectId: z.uuid().optional(),
          academicYearId: z.uuid().optional(),
          status: z.enum(['draft', 'published']).optional(),
        }),
        response: { 200: z.object({ flows: z.array(flowOut) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { subjectId, academicYearId, status } = request.query;
        const rows = await flowQuery(tx)
          .where(
            and(
              subjectId ? eq(learningFlow.subjectId, subjectId) : undefined,
              academicYearId ? eq(learningFlow.academicYearId, academicYearId) : undefined,
              status ? eq(learningFlow.status, status) : undefined,
            ),
          )
          .orderBy(
            asc(subject.name),
            asc(learningFlow.name),
            desc(learningFlow.version),
            asc(learningFlow.id),
          );
        const counts = new Map(
          (rows.length
            ? await tx
                .select({ id: learningFlowItem.flowId, n: count() })
                .from(learningFlowItem)
                .where(
                  inArray(
                    learningFlowItem.flowId,
                    rows.map((r) => r.id),
                  ),
                )
                .groupBy(learningFlowItem.flowId)
            : []
          ).map((c) => [c.id, c.n]),
        );
        return { flows: rows.map((r) => toFlow(r as FlowRow, counts.get(r.id) ?? 0)) };
      }),
  );

  app.get(
    '/v1/learning-flows/:id',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Detail ATP beserta item berurut',
        description:
          'Izin: `subject:read`. ATP dengan item menurut urutan, masing-masing dengan data TP dan CP-nya ' +
          '(`objectiveActive` false berarti TP itu sudah diganti versi baru atau dinonaktifkan).',
        headers: schoolHeader,
        params: flowIdParams,
        response: { 200: flowDetail, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => flowDetailOf(tx, request.params.id)),
  );

  app.post(
    '/v1/learning-flows',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Buat alur tujuan pembelajaran (ATP) draf',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote}${flowDescNote} Dibuat sebagai draf versi 1. \`phase\` yang ` +
          'dihilangkan diturunkan dari `levelCode` bila kode itu kelas 1-12 (angka atau Romawi). ' +
          '400 `invalid_reference`: TP bukan milik mapel ATP, atau semester bukan milik tahun ajaran ATP. ' +
          '400 `duplicate_entry`: TP yang sama dua kali. 400 `inactive_objective`: TP nonaktif. 400 `invalid_level`. ' +
          '409 `conflict`: sudah ada ATP dengan mapel, tahun, nama, tingkat, dan versi yang sama.',
        headers: schoolHeader,
        body: z.object({
          subjectId: z.uuid(),
          academicYearId: z.uuid(),
          levelCode: z.string().trim().min(1).max(20).nullable().optional(),
          phase: phaseEnum.nullable().optional(),
          name: text(200),
          items: z.array(itemIn).max(MAX_FLOW_ITEMS).optional(),
        }),
        response: { 201: flowDetail, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      const items = body.items ?? [];
      const out = await conflictAs409(
        'Sudah ada ATP dengan mapel, tahun ajaran, nama, tingkat, dan versi yang sama.',
        () =>
          tenant(request, async (tx) => {
            await requireSubject(tx, body.subjectId);
            await assertCanWrite(tx, ctx, body.subjectId, body.academicYearId);
            const [year] = await tx
              .select({ id: academicYear.id })
              .from(academicYear)
              .where(eq(academicYear.id, body.academicYearId));
            if (!year) throw notFound('Tahun ajaran');
            await requireLevel(tx, body.levelCode);
            await lockSubject(tx, body.subjectId);
            await validateItems(tx, body.subjectId, body.academicYearId, items, new Set());
            const levelCode = body.levelCode ?? null;
            const [row] = await tx
              .insert(learningFlow)
              .values({
                schoolId: ctx.schoolId,
                subjectId: body.subjectId,
                academicYearId: body.academicYearId,
                levelCode,
                phase:
                  body.phase !== undefined ? body.phase : levelCode ? phaseForLevelCode(levelCode) : null,
                name: body.name,
                createdBy: ctx.userId,
              })
              .returning({ id: learningFlow.id });
            await replaceItems(tx, ctx, row!.id, items);
            await audit(tx, ctx, 'learning_flow.create', 'learning_flow', row!.id, {
              subjectId: body.subjectId,
              academicYearId: body.academicYearId,
              items: items.length,
            });
            return flowDetailOf(tx, row!.id);
          }),
      );
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/learning-flows/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Ubah ATP draf',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote}${flowDescNote} Mengubah metadata (\`name\`, \`levelCode\`, ` +
          '`phase`; yang dihilangkan tidak berubah, null mengosongkan tingkat/fase) dan, bila `items` dikirim, mengganti ' +
          'SELURUH item sekaligus (urutan larik = urutan ATP; `items` dihilangkan = item tidak disentuh). Mapel dan tahun ' +
          'ajaran tidak bisa diubah. 409 `flow_published`: ATP sudah terbit dan terkunci. Validasi item seperti pada POST.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          name: text(200).optional(),
          levelCode: z.string().trim().min(1).max(20).nullable().optional(),
          phase: phaseEnum.nullable().optional(),
          items: z.array(itemIn).max(MAX_FLOW_ITEMS).optional(),
        }),
        response: { 200: flowDetail, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      return conflictAs409(
        'Sudah ada ATP dengan mapel, tahun ajaran, nama, tingkat, dan versi yang sama.',
        () =>
          tenant(request, async (tx) => {
            const flow = await loadFlowLocked(tx, ctx, request.params.id);
            if (flow.status !== 'draft') throw published();
            if (body.levelCode !== undefined) await requireLevel(tx, body.levelCode);
            if (body.items) {
              const current = new Set(
                (
                  await tx
                    .select({ id: learningFlowItem.objectiveId })
                    .from(learningFlowItem)
                    .where(eq(learningFlowItem.flowId, flow.id))
                ).map((r) => r.id),
              );
              await validateItems(tx, flow.subjectId, flow.academicYearId, body.items, current);
              await replaceItems(tx, ctx, flow.id, body.items);
            }
            await tx
              .update(learningFlow)
              .set({
                name: body.name ?? flow.name,
                levelCode: body.levelCode === undefined ? flow.levelCode : body.levelCode,
                phase: body.phase === undefined ? flow.phase : body.phase,
                updatedAt: new Date(),
              })
              .where(eq(learningFlow.id, flow.id));
            await audit(tx, ctx, 'learning_flow.update', 'learning_flow', flow.id, {
              itemsReplaced: body.items ? body.items.length : null,
            });
            return flowDetailOf(tx, flow.id);
          }),
      );
    },
  );

  app.post(
    '/v1/learning-flows/:id/publish',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Terbitkan ATP',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} Mengubah draf menjadi terbit dan mengunci isinya; revisi lewat ` +
          '`new-version`. 400 `flow_empty`: ATP tanpa item. 400 `inactive_objective`: ada item yang menunjuk TP nonaktif (daftar TP ada ' +
          'di pesan galat; ganti item itu dulu). 409 `flow_published`: sudah terbit.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: flowDetail, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const flow = await loadFlowLocked(tx, ctx, request.params.id);
        if (flow.status !== 'draft') throw published();
        const [n] = await tx
          .select({ n: count() })
          .from(learningFlowItem)
          .where(eq(learningFlowItem.flowId, flow.id));
        if (!n || n.n === 0) throw bad('flow_empty', 'ATP tanpa item tidak bisa diterbitkan.');
        const inactive = (await loadFlowItems(tx, flow.id)).filter((i) => !i.objectiveActive);
        if (inactive.length > 0) {
          const names = inactive.map((i) => i.objectiveCode ?? i.objectiveDescription.slice(0, 40));
          const shown = names.slice(0, 10).join(', ');
          throw bad(
            'inactive_objective',
            `ATP memuat ${inactive.length} TP yang sudah nonaktif atau diganti versi baru: ${shown}${names.length > 10 ? `, dan ${names.length - 10} lainnya` : ''}. Ganti item itu dengan TP aktif sebelum menerbitkan.`,
          );
        }
        await tx
          .update(learningFlow)
          .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(learningFlow.id, flow.id));
        await audit(tx, ctx, 'learning_flow.publish', 'learning_flow', flow.id, { items: n.n });
        return flowDetailOf(tx, flow.id);
      });
    },
  );

  app.post(
    '/v1/learning-flows/:id/new-version',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Buat versi berikutnya dari ATP terbit',
        description:
          `Izin: \`teaching_plan:write\`.${writeNote} Menyalin ATP terbit beserta item menjadi draf versi berikutnya ` +
          '(`supersedesId` = ATP asal); versi lama tetap utuh. Item yang menunjuk TP nonaktif ikut disalin dan dihitung di ' +
          '`inactiveItemCount` (peringatan; ganti sebelum menerbitkan, 400 `inactive_objective`). 409 `flow_not_published`: ATP asal masih draf. ' +
          '409 `draft_exists`: ATP yang sama (mapel, tahun, nama, tingkat) sudah punya draf.',
        headers: schoolHeader,
        params: idParams,
        response: { 201: flowDetail, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const out = await conflictAs409('Versi ATP bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const src = await loadFlowLocked(tx, ctx, request.params.id);
          if (src.status !== 'published') {
            throw new HttpError(
              409,
              'flow_not_published',
              'Hanya ATP yang sudah terbit yang bisa dibuatkan versi baru.',
            );
          }
          const [draft] = await tx
            .select({ id: learningFlow.id })
            .from(learningFlow)
            .where(and(sameKey(src), eq(learningFlow.status, 'draft')))
            .limit(1);
          if (draft) {
            throw new HttpError(
              409,
              'draft_exists',
              'ATP ini sudah punya draf versi baru; lanjutkan draf itu.',
            );
          }
          const [top] = await tx
            .select({ top: max(learningFlow.version) })
            .from(learningFlow)
            .where(sameKey(src));
          const [row] = await tx
            .insert(learningFlow)
            .values({
              schoolId: ctx.schoolId,
              subjectId: src.subjectId,
              academicYearId: src.academicYearId,
              levelCode: src.levelCode,
              phase: src.phase,
              name: src.name,
              version: (top?.top ?? src.version) + 1,
              supersedesId: src.id,
              createdBy: ctx.userId,
            })
            .returning({ id: learningFlow.id });
          const items = await tx
            .select()
            .from(learningFlowItem)
            .where(eq(learningFlowItem.flowId, src.id))
            .orderBy(asc(learningFlowItem.sortOrder), asc(learningFlowItem.id));
          if (items.length > 0) {
            await tx.insert(learningFlowItem).values(
              items.map((i, idx) => ({
                schoolId: ctx.schoolId,
                flowId: row!.id,
                objectiveId: i.objectiveId,
                sortOrder: idx,
                weeks: i.weeks,
                periods: i.periods,
                semesterId: i.semesterId,
                note: i.note,
              })),
            );
          }
          await audit(tx, ctx, 'learning_flow.new_version', 'learning_flow', row!.id, {
            sourceId: src.id,
            items: items.length,
          });
          return flowDetailOf(tx, row!.id);
        }),
      );
      return reply.code(201).send(out);
    },
  );

  app.delete(
    '/v1/learning-flows/:id',
    {
      onRequest: [requirePermission('teaching_plan:write')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Hapus ATP draf',
        description: `Izin: \`teaching_plan:write\`.${writeNote} Hanya draf; 409 \`flow_published\` bila sudah terbit.`,
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const flow = await loadFlowLocked(tx, ctx, request.params.id);
        if (flow.status !== 'draft') throw published();
        await tx.delete(learningFlow).where(eq(learningFlow.id, flow.id));
        await audit(tx, ctx, 'learning_flow.delete', 'learning_flow', flow.id);
        return { ok: true as const };
      });
    },
  );
}
