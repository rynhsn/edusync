import {
  assessmentCounts,
  componentCounts,
  effectiveScore,
  LEARNING_SUPPORT_KINDS,
  MAX_REMEDIAL_ATTEMPTS,
  needsRemedial,
  REMEDIAL_POLICIES,
  SUPPORT_PARTICIPANT_STATUSES,
} from '@edusync/contracts';
import {
  and,
  asc,
  assessment,
  classRoom,
  desc,
  eq,
  gradeComponent,
  inArray,
  learningObjective,
  learningSupport,
  learningSupportObjective,
  learningSupportParticipant,
  score,
  scoreRemedialAttempt,
  student,
  subject,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rosterOf } from '../attendance-lib';
import {
  canInputPair,
  canReadPair,
  isWide,
  myAssignments,
  myTeacherId,
  notAllowed,
  requirePairRefs,
  teaches,
} from '../grading-access-lib';
import { kkmResolverForClass, loadGradingConfig } from '../grading-config-lib';
import { round2 } from '../grading-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertObjectivesForSubject } from '../objective-achievement-lib';
import { loadAttempts } from '../remedial-lib';
import { assertClassReportNotFinal, assertStudentsReportNotFinal } from '../report-lock-lib';
import { assertStudentsTakeSubject, subjectRosterOf } from '../subject-roster-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Grading'];
const MODULE = 'grades';
const readGate = [requirePermission('grade:read'), requireModule(MODULE)];
const inputGate = [requirePermission('grade:input'), requireModule(MODULE)];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const today = () => new Date().toISOString().slice(0, 10);

const scopeQuery = z.object({ semesterId: z.uuid(), classId: z.uuid(), subjectId: z.uuid() });

const objectiveView = z.object({
  id: z.uuid(),
  code: z.string().nullable(),
  description: z.string(),
  active: z.boolean().describe('false = TP sudah diganti versi baru atau dinonaktifkan'),
});

const participantView = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  status: z.enum(SUPPORT_PARTICIPANT_STATUSES),
  outcomeNote: z.string().nullable(),
});

const supportSchema = z.object({
  id: z.uuid(),
  semesterId: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  kind: z.enum(LEARNING_SUPPORT_KINDS),
  title: z.string(),
  description: z.string().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  objectives: z.array(objectiveView).describe('TP sasaran; kosong = tanpa TP'),
  participants: z.array(participantView),
  canInput: z.boolean().describe('Pengguna ini boleh mengubah pendampingan ini'),
});

const participantInput = z.object({
  studentId: z.uuid(),
  status: z.enum(SUPPORT_PARTICIPANT_STATUSES).default('planned'),
  outcomeNote: z.string().trim().max(1000).nullable().optional(),
});

const supportFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  startsOn: z.iso.date().nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  objectiveIds: z
    .array(z.uuid())
    .max(100)
    .optional()
    .describe(
      'TP sasaran, maksimal 20 (400 `too_many_objectives`); harus milik mapel pendampingan (400 `objective_subject_mismatch`) dan ' +
        'aktif (400 `objective_inactive`). Pada PUT: dihilangkan = tetap, larik = ganti himpunan.',
    ),
};

const supportCreateBody = z.object({
  semesterId: z.uuid(),
  classId: z.uuid(),
  subjectId: z.uuid(),
  kind: z.enum(LEARNING_SUPPORT_KINDS),
  ...supportFields,
  participants: z
    .array(participantInput)
    .max(200)
    .optional()
    .describe(
      'Peserta awal (anggota aktif kelas); dapat diganti lewat `PUT /v1/learning-supports/{id}/participants`.',
    ),
});

const supportUpdateBody = z.object(supportFields);

const attemptView = z.object({
  id: z.uuid(),
  attemptNo: z.number().int(),
  value: z.number().nullable(),
  takenOn: z.string(),
  note: z.string().nullable(),
  supportId: z.uuid().nullable(),
});

const effectiveSourceSchema = z.enum(['original', 'remedial']);

/** Rentang tanggal pendampingan: mulai tidak boleh setelah selesai (400 `invalid_dates`). */
function assertDates(startsOn: string | null | undefined, endsOn: string | null | undefined) {
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new HttpError(400, 'invalid_dates', 'Tanggal mulai tidak boleh setelah tanggal selesai.');
  }
}

/**
 * Pendampingan belajar (remedial dan pengayaan) dan percobaan remedial (tahap 3.5; rancangan fase 3, bagian 3.6). Modul `grades`.
 * Skor asli di buku nilai tidak pernah ditimpa; percobaan disimpan terpisah dan hanya memengaruhi nilai efektif menurut kebijakan
 * remedial sekolah (`PUT /v1/grading/settings`).
 */
export async function learningSupportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function loadSupport(tx: Tx, id: string) {
    const [row] = await tx.select().from(learningSupport).where(eq(learningSupport.id, id));
    if (!row) throw notFound('Pendampingan');
    return row;
  }

  async function loadAssessment(tx: Tx, id: string) {
    const [a] = await tx.select().from(assessment).where(eq(assessment.id, id));
    if (!a) throw notFound('Penilaian');
    return a;
  }

  /* ---------- Tampilan pendampingan ---------- */

  async function supportViews(
    tx: Tx,
    ctx: TenantContext,
    filter: { id?: string; semesterId?: string; classId?: string; subjectId?: string; kind?: string },
  ) {
    const conds = [
      filter.id ? eq(learningSupport.id, filter.id) : undefined,
      filter.semesterId ? eq(learningSupport.semesterId, filter.semesterId) : undefined,
      filter.classId ? eq(learningSupport.classId, filter.classId) : undefined,
      filter.subjectId ? eq(learningSupport.subjectId, filter.subjectId) : undefined,
      filter.kind ? eq(learningSupport.kind, filter.kind) : undefined,
    ].filter((c) => c !== undefined);
    const rows = await tx
      .select({
        s: learningSupport,
        className: classRoom.name,
        subjectName: subject.name,
        teacherName: teacher.name,
      })
      .from(learningSupport)
      .innerJoin(classRoom, eq(classRoom.id, learningSupport.classId))
      .innerJoin(subject, eq(subject.id, learningSupport.subjectId))
      .leftJoin(teacher, eq(teacher.id, learningSupport.teacherId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(learningSupport.startsOn), desc(learningSupport.createdAt), asc(learningSupport.title));
    const wide = isWide(ctx);
    const mine = await myAssignments(tx, ctx);
    const visible = rows.filter((r) => wide || teaches(mine, r.s.classId, r.s.subjectId));
    if (visible.length === 0) return [];
    const ids = visible.map((r) => r.s.id);
    const objectives = await tx
      .select({
        supportId: learningSupportObjective.supportId,
        id: learningObjective.id,
        code: learningObjective.code,
        description: learningObjective.description,
        active: learningObjective.active,
      })
      .from(learningSupportObjective)
      .innerJoin(learningObjective, eq(learningObjective.id, learningSupportObjective.objectiveId))
      .where(inArray(learningSupportObjective.supportId, ids))
      .orderBy(asc(learningObjective.sortOrder), asc(learningObjective.code), asc(learningObjective.id));
    const participants = await tx
      .select({
        supportId: learningSupportParticipant.supportId,
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        status: learningSupportParticipant.status,
        outcomeNote: learningSupportParticipant.outcomeNote,
      })
      .from(learningSupportParticipant)
      .innerJoin(student, eq(student.id, learningSupportParticipant.studentId))
      .where(inArray(learningSupportParticipant.supportId, ids))
      .orderBy(asc(student.name), asc(student.id));
    const configure = ctx.permissions.has('grade:configure');
    const input = ctx.permissions.has('grade:input');
    return visible.map((r) => ({
      id: r.s.id,
      semesterId: r.s.semesterId,
      classId: r.s.classId,
      className: r.className,
      subjectId: r.s.subjectId,
      subjectName: r.subjectName,
      kind: r.s.kind as (typeof LEARNING_SUPPORT_KINDS)[number],
      title: r.s.title,
      description: r.s.description,
      startsOn: r.s.startsOn,
      endsOn: r.s.endsOn,
      teacherId: r.s.teacherId,
      teacherName: r.teacherName,
      objectives: objectives.filter((o) => o.supportId === r.s.id).map(({ supportId: _s, ...o }) => o),
      participants: participants
        .filter((p) => p.supportId === r.s.id)
        .map(({ supportId: _s, status, ...p }) => ({
          ...p,
          status: status as (typeof SUPPORT_PARTICIPANT_STATUSES)[number],
        })),
      canInput: configure || (input && teaches(mine, r.s.classId, r.s.subjectId)),
    }));
  }

  async function replaceSupportObjectives(
    tx: Tx,
    schoolId: string,
    supportId: string,
    ids: readonly string[],
  ) {
    await tx.delete(learningSupportObjective).where(eq(learningSupportObjective.supportId, supportId));
    if (ids.length > 0) {
      await tx
        .insert(learningSupportObjective)
        .values(ids.map((objectiveId) => ({ schoolId, supportId, objectiveId })));
    }
  }

  async function replaceParticipants(
    tx: Tx,
    ctx: TenantContext,
    supportId: string,
    scope: { classId: string; subjectId: string; semesterId: string },
    list: z.infer<typeof participantInput>[],
  ) {
    const { rows } = await rosterOf(tx, scope.classId);
    const allowed = new Set(rows.map((s) => s.id));
    // Siswa yang dikirim dua kali: yang terakhir berlaku.
    const records = [...new Map(list.map((r) => [r.studentId, r])).values()];
    if (records.some((r) => !allowed.has(r.studentId))) {
      throw invalidRef('Ada murid yang bukan anggota aktif kelas pendampingan ini.');
    }
    await assertStudentsTakeSubject(tx, { ...scope, studentIds: records.map((r) => r.studentId) });
    await tx.delete(learningSupportParticipant).where(eq(learningSupportParticipant.supportId, supportId));
    if (records.length > 0) {
      await tx.insert(learningSupportParticipant).values(
        records.map((r) => ({
          schoolId: ctx.schoolId,
          supportId,
          studentId: r.studentId,
          status: r.status,
          outcomeNote: r.outcomeNote || null,
          updatedBy: ctx.userId,
        })),
      );
    }
    return records.length;
  }

  /* ---------- CRUD pendampingan ---------- */

  app.get(
    '/v1/learning-supports',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar pendampingan belajar (remedial dan pengayaan)',
        description:
          'Izin: `grade:read`; modul `grades`. Pendampingan pada satu kelas, mapel, dan semester (`semesterId`, `classId`, ' +
          '`subjectId` wajib; `kind` opsional: `remedial` atau `enrichment`), terbaru dulu, beserta TP sasaran dan peserta. ' +
          'Pengguna selain pemegang configure/kepala sekolah/kurikulum hanya untuk kelas+mapel yang ia ampu (403). ' +
          'Semester/kelas/mapel harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        querystring: scopeQuery.extend({ kind: z.enum(LEARNING_SUPPORT_KINDS).optional() }),
        response: { 200: z.array(supportSchema), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, subjectId, kind } = request.query;
      return tenant(request, async (tx) => {
        await requirePairRefs(tx, { semesterId, classId, subjectId });
        if (!(await canReadPair(tx, ctx, classId, subjectId))) throw notAllowed();
        return supportViews(tx, ctx, { semesterId, classId, subjectId, ...(kind ? { kind } : {}) });
      });
    },
  );

  app.post(
    '/v1/learning-supports',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Buat pendampingan belajar',
        description:
          'Izin: `grade:input`; modul `grades`. Boleh bagi pemegang `grade:configure` atau guru yang mengampu kelas dan mapel itu ' +
          '(selain itu 403). `kind` `remedial` atau `enrichment` (pengayaan tidak menghasilkan skor yang memengaruhi nilai). ' +
          'Semester, kelas, dan mapel harus milik sekolah ini dan satu tahun ajaran (400 `invalid_reference`); `endsOn` tidak boleh ' +
          'sebelum `startsOn` (400 `invalid_dates`). `objectiveIds` (TP sasaran) dan `participants` opsional. Ditolak 409 ' +
          '`report_final` bila rapor kelas pada semester itu sudah final. Diaudit (`learning_support.create`).',
        headers: schoolHeader,
        body: supportCreateBody,
        response: { 201: supportSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { objectiveIds, participants, ...b } = request.body;
      const created = await tenant(request, async (tx) => {
        await requirePairRefs(tx, b);
        if (!(await canInputPair(tx, ctx, b.classId, b.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, b.semesterId, b.classId);
        assertDates(b.startsOn, b.endsOn);
        const links = await assertObjectivesForSubject(tx, b.subjectId, objectiveIds ?? []);
        // Pengampu pasangan itu bila ada; selain itu pembuatnya bila ia guru.
        const [assigned] = await tx
          .select({ teacherId: teachingAssignment.teacherId })
          .from(teachingAssignment)
          .where(
            and(eq(teachingAssignment.classId, b.classId), eq(teachingAssignment.subjectId, b.subjectId)),
          );
        const teacherId = assigned?.teacherId ?? (await myTeacherId(tx, ctx));
        const [row] = await tx
          .insert(learningSupport)
          .values({
            schoolId: ctx.schoolId,
            semesterId: b.semesterId,
            classId: b.classId,
            subjectId: b.subjectId,
            kind: b.kind,
            title: b.title,
            description: b.description || null,
            startsOn: b.startsOn ?? null,
            endsOn: b.endsOn ?? null,
            teacherId,
            createdBy: ctx.userId,
          })
          .returning({ id: learningSupport.id });
        await replaceSupportObjectives(tx, ctx.schoolId, row!.id, links);
        const count = participants
          ? await replaceParticipants(
              tx,
              ctx,
              row!.id,
              { classId: b.classId, subjectId: b.subjectId, semesterId: b.semesterId },
              participants,
            )
          : 0;
        await audit(tx, ctx, 'learning_support.create', 'learning_support', row!.id, {
          kind: b.kind,
          title: b.title,
          classId: b.classId,
          subjectId: b.subjectId,
          ...(links.length > 0 ? { objectiveIds: links } : {}),
          ...(count > 0 ? { participants: count } : {}),
        });
        return (await supportViews(tx, ctx, { id: row!.id }))[0]!;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/learning-supports/:id',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Ubah pendampingan belajar',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel pendampingan itu (selain itu 403); ' +
          'modul `grades`. Yang bisa diubah: judul, keterangan, tanggal, dan TP sasaran (`objectiveIds` dihilangkan = tetap, larik = ' +
          'ganti himpunan; TP yang sudah terkait boleh tetap walau sudah nonaktif). Jenis, kelas, mapel, dan semester tidak berubah. ' +
          '`endsOn` tidak boleh sebelum `startsOn` (400 `invalid_dates`). Ditolak 409 `report_final` bila rapor kelas pada semester ' +
          'itu sudah final. 404 `not_found` bila tidak ada. Diaudit (`learning_support.update`).',
        headers: schoolHeader,
        params: idParams,
        body: supportUpdateBody,
        response: { 200: supportSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { objectiveIds, ...b } = request.body;
      return tenant(request, async (tx) => {
        const current = await loadSupport(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
        assertDates(
          b.startsOn === undefined ? current.startsOn : b.startsOn,
          b.endsOn === undefined ? current.endsOn : b.endsOn,
        );
        let links: string[] | undefined;
        if (objectiveIds !== undefined) {
          const keep = new Set(
            (
              await tx
                .select({ id: learningSupportObjective.objectiveId })
                .from(learningSupportObjective)
                .where(eq(learningSupportObjective.supportId, current.id))
            ).map((r) => r.id),
          );
          links = await assertObjectivesForSubject(tx, current.subjectId, objectiveIds, { keep });
        }
        await tx
          .update(learningSupport)
          .set({
            title: b.title,
            ...(b.description !== undefined ? { description: b.description || null } : {}),
            ...(b.startsOn !== undefined ? { startsOn: b.startsOn } : {}),
            ...(b.endsOn !== undefined ? { endsOn: b.endsOn } : {}),
            updatedAt: new Date(),
          })
          .where(eq(learningSupport.id, current.id));
        if (links) await replaceSupportObjectives(tx, ctx.schoolId, current.id, links);
        await audit(tx, ctx, 'learning_support.update', 'learning_support', current.id, {
          title: b.title,
          ...(links ? { objectiveIds: links } : {}),
        });
        return (await supportViews(tx, ctx, { id: current.id }))[0]!;
      });
    },
  );

  app.put(
    '/v1/learning-supports/:id/participants',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Ganti peserta pendampingan belajar',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel pendampingan itu (selain itu 403); ' +
          'modul `grades`. MENGGANTI seluruh himpunan peserta (larik kosong = kosongkan): murid yang tidak disebut dikeluarkan. ' +
          '`status` `planned` (bawaan), `in_progress`, `completed`, atau `cancelled`; `outcomeNote` catatan hasil (maks 1000). ' +
          'Murid harus anggota aktif kelas pendampingan (400 `invalid_reference`) dan, bila rombel menandai mapelnya hanya diikuti murid ' +
          'yang memilih, mengambil mapel itu pada semester pendampingan (400 `student_not_taking_subject`); murid yang dikirim dua kali: yang terakhir berlaku. ' +
          'Ditolak 409 `report_final` bila rapor kelas pada semester itu sudah final. Diaudit (`learning_support.participants`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ participants: z.array(participantInput).max(200) }),
        response: { 200: supportSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadSupport(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
        const count = await replaceParticipants(
          tx,
          ctx,
          current.id,
          { classId: current.classId, subjectId: current.subjectId, semesterId: current.semesterId },
          request.body.participants,
        );
        await tx
          .update(learningSupport)
          .set({ updatedAt: new Date() })
          .where(eq(learningSupport.id, current.id));
        await audit(tx, ctx, 'learning_support.participants', 'learning_support', current.id, {
          participants: count,
        });
        return (await supportViews(tx, ctx, { id: current.id }))[0]!;
      });
    },
  );

  app.delete(
    '/v1/learning-supports/:id',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Hapus pendampingan belajar',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel pendampingan itu (selain itu 403); ' +
          'modul `grades`. Peserta dan TP sasaran ikut terhapus. Percobaan remedial yang menunjuk pendampingan ini TIDAK terhapus ' +
          '(hanya tautannya dilepas), jadi nilai efektif tidak berubah. Ditolak 409 `report_final` bila rapor kelas pada semester ' +
          'itu sudah final. Diaudit (`learning_support.delete`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadSupport(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
        await tx.delete(learningSupport).where(eq(learningSupport.id, current.id));
        await audit(tx, ctx, 'learning_support.delete', 'learning_support', current.id, {
          kind: current.kind,
          title: current.title,
        });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Percobaan remedial ---------- */

  /** Kebijakan dan KKM efektif (persen) untuk satu penilaian, dari konfigurasi efektif semesternya. */
  async function policyFor(tx: Tx, a: typeof assessment.$inferSelect) {
    const cfg = await loadGradingConfig(tx, a.semesterId);
    const policy = await cfg.remedialPolicy(tx);
    const kkm = (await kkmResolverForClass(tx, cfg, { classId: a.classId, subjectIds: [a.subjectId] }))(
      a.subjectId,
    );
    return { policy, kkm };
  }

  async function attemptSheet(tx: Tx, ctx: TenantContext, a: typeof assessment.$inferSelect) {
    const { policy, kkm } = await policyFor(tx, a);
    const { rows } = await subjectRosterOf(tx, a.classId, a.subjectId, a.semesterId, { historical: true });
    const scores = await tx.select().from(score).where(eq(score.assessmentId, a.id));
    const attempts = await tx
      .select()
      .from(scoreRemedialAttempt)
      .where(eq(scoreRemedialAttempt.assessmentId, a.id))
      .orderBy(asc(scoreRemedialAttempt.attemptNo));
    return {
      assessment: {
        id: a.id,
        semesterId: a.semesterId,
        classId: a.classId,
        subjectId: a.subjectId,
        title: a.title,
        date: a.date,
        maxScore: a.maxScore,
      },
      policy,
      kkm,
      canInput: await canInputPair(tx, ctx, a.classId, a.subjectId),
      students: rows.map((s) => {
        const original = scores.find((x) => x.studentId === s.id)?.value ?? null;
        const mine = attempts.filter((x) => x.studentId === s.id);
        const eff = effectiveScore(policy, {
          original,
          max: a.maxScore,
          attempts: mine.map((m) => ({ attemptNo: m.attemptNo, value: m.value })),
          kkmPercent: kkm,
        });
        const percent = original === null ? null : round2((original / a.maxScore) * 100);
        return {
          studentId: s.id,
          name: s.name,
          nis: s.nis,
          original,
          percent,
          needsRemedial: needsRemedial(percent, kkm),
          effective: eff.value,
          effectiveSource: eff.source,
          attempts: mine.map((m) => ({
            id: m.id,
            attemptNo: m.attemptNo,
            value: m.value,
            takenOn: m.takenOn,
            note: m.note,
            supportId: m.supportId,
          })),
        };
      }),
    };
  }

  const attemptSheetSchema = z.object({
    assessment: z.object({
      id: z.uuid(),
      semesterId: z.uuid(),
      classId: z.uuid(),
      subjectId: z.uuid(),
      title: z.string(),
      date: z.string(),
      maxScore: z.number().int(),
    }),
    policy: z
      .enum(REMEDIAL_POLICIES)
      .describe('Kebijakan remedial efektif semester ini (salinan beku bila ada)'),
    kkm: z
      .number()
      .describe(
        'KKM efektif mapel (persen dari skor maksimum) yang dipakai `needsRemedial` dan `cap_at_criteria`',
      ),
    canInput: z.boolean(),
    students: z.array(
      z.object({
        studentId: z.uuid(),
        name: z.string(),
        nis: z.string().nullable(),
        original: z.number().nullable().describe('Skor asli (`score.value`); tidak pernah ditimpa percobaan'),
        percent: z.number().nullable().describe('Skor asli sebagai persen skor maksimum'),
        needsRemedial: z.boolean().describe('Skor asli di bawah KKM efektif mapel'),
        effective: z
          .number()
          .nullable()
          .describe(
            'Nilai efektif menurut kebijakan (sama dengan `original` bila `record_only` atau tanpa percobaan berisi nilai)',
          ),
        effectiveSource: effectiveSourceSchema,
        attempts: z.array(attemptView).describe('Percobaan remedial, urut `attemptNo`'),
      }),
    ),
  });

  app.get(
    '/v1/assessments/:id/remedial-attempts',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Percobaan remedial satu penilaian',
        description:
          'Izin: `grade:read`; modul `grades`. Roster murid aktif dan lulusan kelas penilaian dengan skor asli, percobaan remedial ' +
          '(urut `attemptNo`), dan nilai efektif menurut kebijakan remedial semester (`policy`). `needsRemedial` = skor asli di bawah ' +
          'KKM efektif mapel (`kkm`, persen). Bila rombel menandai mapel ini hanya diikuti murid yang memilih, roster hanya murid yang ' +
          'mengambilnya pada semester penilaian. Pengguna selain pemegang configure/kepala sekolah/kurikulum hanya untuk kelas+mapel yang ' +
          'ia ampu (403). 404 `not_found` bila penilaian tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: attemptSheetSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const a = await loadAssessment(tx, request.params.id);
        if (!(await canReadPair(tx, ctx, a.classId, a.subjectId))) throw notAllowed();
        return attemptSheet(tx, ctx, a);
      });
    },
  );

  app.post(
    '/v1/assessments/:id/remedial-attempts',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Catat percobaan remedial',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel penilaian itu (selain itu 403); modul ' +
          '`grades`. Menambah percobaan baru (nomor berikutnya per murid) untuk 1..200 catatan; murid yang sama dikirim dua kali ' +
          'menghasilkan dua percobaan berurutan. `value` 0..skor maksimum penilaian (400 `score_out_of_range`) atau null (percobaan ' +
          'tanpa nilai: tercatat tetapi tidak dipakai nilai efektif). `takenOn` bawaan hari ini. `supportId` opsional menautkan ke ' +
          'pendampingan remedial pada kelas, mapel, dan semester yang sama (400 `invalid_reference`). Murid harus anggota aktif kelas ' +
          '(400 `invalid_reference`) dan, bila rombel menandai mapel ini hanya diikuti murid yang memilih, mengambil mapel itu ' +
          '(400 `student_not_taking_subject`). Maksimal 20 percobaan per murid dan penilaian (400 `too_many_attempts`). Skor asli TIDAK ' +
          'berubah. Pengaruhnya pada nilai akhir dan ketercapaian TP mengikuti kebijakan remedial sekolah (`record_only` hanya ' +
          'mencatat). Ditolak 409 `report_final` bila rapor salah satu murid itu pada semester tersebut sudah final. ' +
          'Diaudit (`remedial_attempt.save`). Respons sama dengan GET.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                value: z.number().min(0).max(1000).nullable(),
                takenOn: z.iso.date().optional(),
                note: z.string().trim().max(500).nullable().optional(),
                supportId: z.uuid().nullable().optional(),
              }),
            )
            .min(1)
            .max(200),
        }),
        response: {
          201: attemptSheetSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const sheet = await conflictAs409(
        'Percobaan remedial bentrok dengan penyimpanan lain; coba lagi.',
        () =>
          tenant(request, async (tx) => {
            const a = await loadAssessment(tx, request.params.id);
            if (!(await canInputPair(tx, ctx, a.classId, a.subjectId))) throw notAllowed();
            const { records } = request.body;
            await assertStudentsReportNotFinal(
              tx,
              a.semesterId,
              records.map((r) => r.studentId),
            );
            const { rows } = await rosterOf(tx, a.classId);
            const allowed = new Set(rows.map((s) => s.id));
            if (records.some((r) => !allowed.has(r.studentId))) {
              throw invalidRef('Ada murid yang bukan anggota aktif kelas penilaian ini.');
            }
            await assertStudentsTakeSubject(tx, {
              classId: a.classId,
              semesterId: a.semesterId,
              subjectId: a.subjectId,
              studentIds: records.map((r) => r.studentId),
            });
            if (records.some((r) => r.value !== null && r.value > a.maxScore)) {
              throw new HttpError(
                400,
                'score_out_of_range',
                `Nilai remedial harus antara 0 dan ${a.maxScore}.`,
              );
            }
            const supportIds = [...new Set(records.flatMap((r) => (r.supportId ? [r.supportId] : [])))];
            if (supportIds.length > 0) {
              const found = await tx
                .select()
                .from(learningSupport)
                .where(inArray(learningSupport.id, supportIds));
              const valid = (s: (typeof found)[number]) =>
                s.kind === 'remedial' &&
                s.semesterId === a.semesterId &&
                s.classId === a.classId &&
                s.subjectId === a.subjectId;
              if (found.length !== supportIds.length || !found.every(valid)) {
                throw invalidRef(
                  'Pendampingan harus berjenis remedial dan berada pada kelas, mapel, dan semester yang sama dengan penilaian.',
                );
              }
            }
            const existing = await loadAttempts(tx, [a.id]);
            const next = new Map<string, number>();
            for (const [key, list] of existing) {
              next.set(key.split(':')[1]!, Math.max(0, ...list.map((l) => l.attemptNo)));
            }
            for (const r of records) {
              const no = (next.get(r.studentId) ?? 0) + 1;
              if (no > MAX_REMEDIAL_ATTEMPTS) {
                throw new HttpError(
                  400,
                  'too_many_attempts',
                  `Satu murid paling banyak ${MAX_REMEDIAL_ATTEMPTS} percobaan remedial per penilaian.`,
                );
              }
              next.set(r.studentId, no);
              await tx.insert(scoreRemedialAttempt).values({
                schoolId: ctx.schoolId,
                assessmentId: a.id,
                studentId: r.studentId,
                supportId: r.supportId ?? null,
                attemptNo: no,
                value: r.value,
                takenOn: r.takenOn ?? today(),
                note: r.note || null,
                recordedBy: ctx.userId,
              });
            }
            await audit(tx, ctx, 'remedial_attempt.save', 'assessment', a.id, { count: records.length });
            return attemptSheet(tx, ctx, a);
          }),
      );
      return reply.code(201).send(sheet);
    },
  );

  app.delete(
    '/v1/remedial-attempts/:id',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Hapus percobaan remedial',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel penilaian percobaan itu (selain itu ' +
          '403); modul `grades`. Menghapus satu percobaan; nomor percobaan lain tidak berubah. Skor asli tidak tersentuh. Ditolak 409 ' +
          '`report_final` bila rapor murid itu pada semester tersebut sudah final. 404 `not_found` bila tidak ada. Diaudit ' +
          '(`remedial_attempt.delete`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [att] = await tx
          .select()
          .from(scoreRemedialAttempt)
          .where(eq(scoreRemedialAttempt.id, request.params.id));
        if (!att) throw notFound('Percobaan remedial');
        const a = await loadAssessment(tx, att.assessmentId);
        if (!(await canInputPair(tx, ctx, a.classId, a.subjectId))) throw notAllowed();
        await assertStudentsReportNotFinal(tx, a.semesterId, [att.studentId]);
        await tx.delete(scoreRemedialAttempt).where(eq(scoreRemedialAttempt.id, att.id));
        await audit(tx, ctx, 'remedial_attempt.delete', 'assessment', a.id, {
          studentId: att.studentId,
          attemptNo: att.attemptNo,
        });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Murid yang perlu remedial ---------- */

  app.get(
    '/v1/grading/remedial-candidates',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Murid yang perlu remedial',
        description:
          'Izin: `grade:read`; modul `grades`. Murid dengan skor asli di bawah KKM efektif mapel (`kkm`, persen skor maksimum) pada ' +
          'penilaian SUMATIF yang ikut nilai akhir (formatif dan asesmen awal tidak dihitung) untuk satu kelas, mapel, dan semester. ' +
          'Per penilaian: skor asli, persen, jumlah percobaan, nilai efektif menurut kebijakan remedial semester (`policy`), dan ' +
          '`stillBelow` (nilai efektif masih di bawah KKM). Hanya murid yang punya paling sedikit satu penilaian di bawah KKM yang ' +
          'tampil. Bila rombel menandai mapel ini hanya diikuti murid yang memilih, hanya murid yang mengambilnya pada semester itu tampil. Pengguna selain pemegang configure/kepala sekolah/kurikulum hanya untuk kelas+mapel yang ia ampu (403). ' +
          'Semester/kelas/mapel harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: {
          200: z.object({
            policy: z.enum(REMEDIAL_POLICIES),
            kkm: z.number().describe('KKM efektif mapel (persen)'),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                items: z.array(
                  z.object({
                    assessmentId: z.uuid(),
                    title: z.string(),
                    date: z.string(),
                    componentName: z.string(),
                    maxScore: z.number().int(),
                    original: z.number(),
                    percent: z.number(),
                    attempts: z.number().int(),
                    effective: z.number().nullable(),
                    effectivePercent: z.number().nullable(),
                    stillBelow: z.boolean(),
                  }),
                ),
              }),
            ),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, subjectId } = request.query;
      return tenant(request, async (tx) => {
        await requirePairRefs(tx, { semesterId, classId, subjectId });
        if (!(await canReadPair(tx, ctx, classId, subjectId))) throw notAllowed();
        const cfg = await loadGradingConfig(tx, semesterId);
        const policy = await cfg.remedialPolicy(tx);
        const kkm = (await kkmResolverForClass(tx, cfg, { classId, subjectIds: [subjectId] }))(subjectId);
        const componentOf = new Map(cfg.components.map((c) => [c.id, c]));
        const componentNames = new Map(
          (await tx.select({ id: gradeComponent.id, name: gradeComponent.name }).from(gradeComponent)).map(
            (c) => [c.id, c.name],
          ),
        );
        const counted = (
          await tx
            .select()
            .from(assessment)
            .where(
              and(
                eq(assessment.semesterId, semesterId),
                eq(assessment.classId, classId),
                eq(assessment.subjectId, subjectId),
              ),
            )
            .orderBy(asc(assessment.date), asc(assessment.title))
        ).filter((a) => {
          const c = componentOf.get(a.componentId);
          return c !== undefined && componentCounts(c) && assessmentCounts(a, c);
        });
        const { rows } = await subjectRosterOf(tx, classId, subjectId, semesterId, { historical: true });
        if (counted.length === 0) return { policy, kkm, students: [] };
        const ids = counted.map((a) => a.id);
        const scores = await tx
          .select({ assessmentId: score.assessmentId, studentId: score.studentId, value: score.value })
          .from(score)
          .where(inArray(score.assessmentId, ids));
        const scoreOf = new Map(scores.map((s) => [`${s.assessmentId}:${s.studentId}`, s.value]));
        const attempts = await loadAttempts(tx, ids);
        const students = rows.flatMap((s) => {
          const items = counted.flatMap((a) => {
            const key = `${a.id}:${s.id}`;
            const original = scoreOf.get(key) ?? null;
            if (original === null) return [];
            const percent = round2((original / a.maxScore) * 100);
            if (!needsRemedial(percent, kkm)) return [];
            const list = attempts.get(key) ?? [];
            const eff = effectiveScore(policy, {
              original,
              max: a.maxScore,
              attempts: list,
              kkmPercent: kkm,
            });
            const effectivePercent = eff.value === null ? null : round2((eff.value / a.maxScore) * 100);
            return [
              {
                assessmentId: a.id,
                title: a.title,
                date: a.date,
                componentName: componentNames.get(a.componentId) ?? '',
                maxScore: a.maxScore,
                original,
                percent,
                attempts: list.length,
                effective: eff.value,
                effectivePercent,
                stillBelow: needsRemedial(effectivePercent, kkm),
              },
            ];
          });
          return items.length > 0 ? [{ studentId: s.id, name: s.name, nis: s.nis, items }] : [];
        });
        return { policy, kkm, students };
      });
    },
  );
}
