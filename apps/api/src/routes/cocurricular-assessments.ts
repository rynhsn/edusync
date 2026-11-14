import {
  ASSESSMENT_BATCH_LIMIT,
  assessmentOptionsSchema,
  assessmentSheetSchema,
  assessmentsSaveSchema,
  evidenceInputSchema,
  evidenceSchema,
  isEvidenceUrl,
} from '@edusync/contracts';
import {
  and,
  asc,
  classRoom,
  cocurricularAssessment,
  cocurricularEvidence,
  cocurricularProgram,
  cocurricularProgramClass,
  cocurricularProgramTarget,
  cocurricularRubricLevel,
  eq,
  inArray,
  reportCard,
  semester,
  sql,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rosterOf } from '../attendance-lib';
import { canAssessCocurricular, viewableClasses } from '../cocurricular-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertStudentsReportNotFinal } from '../report-lock-lib';
import { semesterRosterOf } from '../student-mobility-lib';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * Kokurikuler, tahap 4.3: penilaian sumatif per semester (tingkat rubrik + catatan) dan bukti karya berupa tautan https.
 * Kokurikuler BUKAN mapel dan tidak memengaruhi nilai. Hak menilai kontekstual: `cocurricular:manage`, koordinator program, atau
 * fasilitator rombel itu (gerbang rute cukup `cocurricular:read`; keputusan akhir di handler).
 */

const tag = ['Cocurricular'];
const MODULE = 'grades';
const readGate = [requirePermission('cocurricular:read'), requireModule(MODULE)];

const bad = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = () => new HttpError(404, 'not_found', 'Program kokurikuler tidak ditemukan.');
const evidenceParams = z.object({ id: z.uuid(), evidenceId: z.uuid() });

type Program = typeof cocurricularProgram.$inferSelect;

async function loadProgram(tx: Tx, id: string): Promise<Program> {
  const [row] = await tx.select().from(cocurricularProgram).where(eq(cocurricularProgram.id, id));
  if (!row) throw notFound();
  return row;
}

async function assertProgramClass(tx: Tx, programId: string, classId: string) {
  const [row] = await tx
    .select({ id: cocurricularProgramClass.id })
    .from(cocurricularProgramClass)
    .where(
      and(eq(cocurricularProgramClass.programId, programId), eq(cocurricularProgramClass.classId, classId)),
    );
  if (!row) throw bad('Rombel bukan peserta program ini.');
}

/** Semester harus milik tahun program dan, bila program terikat satu semester, semester itu. */
async function loadSemester(tx: Tx, p: Program, semesterId: string) {
  const [s] = await tx
    .select({ id: semester.id, academicYearId: semester.academicYearId, endsOn: semester.endsOn })
    .from(semester)
    .where(eq(semester.id, semesterId));
  if (!s || s.academicYearId !== p.academicYearId || (p.semesterId !== null && p.semesterId !== s.id)) {
    throw bad('Semester tidak sesuai dengan program ini.');
  }
  return s;
}

const closedGuard = (p: Program) => {
  if (p.status === 'closed') {
    throw new HttpError(
      409,
      'program_closed',
      'Program ini sudah selesai (ditutup), jadi tidak bisa diubah. Ubah statusnya dulu.',
    );
  }
};

async function mustAssess(tx: Tx, ctx: TenantContext, programId: string, classId: string | null) {
  if (!(await canAssessCocurricular(tx, ctx, programId, classId))) {
    throw forbidden(
      'Hanya pengelola kokurikuler, koordinator, atau fasilitator rombel ini yang boleh melakukannya.',
    );
  }
}

export async function cocurricularAssessmentRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/cocurricular/programs/:id/assessment-options',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pilihan semester dan rombel untuk penilaian kokurikuler',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Semester yang boleh dinilai (satu semester bila program terikat semester, ' +
          'selain itu seluruh semester tahun ajaran program) dan rombel program yang boleh dilihat pengguna (fasilitator hanya ' +
          'rombelnya). Tidak memerlukan izin tahun ajaran atau rombel, sehingga guru fasilitator tetap dapat memilih. Galat: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: assessmentOptionsSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        const scope = await viewableClasses(tx, ctx, p.id);
        const sems = await tx
          .select({
            id: semester.id,
            name: semester.name,
            startsOn: semester.startsOn,
            endsOn: semester.endsOn,
          })
          .from(semester)
          .where(eq(semester.academicYearId, p.academicYearId))
          .orderBy(asc(semester.startsOn));
        const classes = await tx
          .select({ classId: classRoom.id, name: classRoom.name, level: classRoom.level })
          .from(cocurricularProgramClass)
          .innerJoin(classRoom, eq(classRoom.id, cocurricularProgramClass.classId))
          .where(eq(cocurricularProgramClass.programId, p.id))
          .orderBy(asc(classRoom.level), asc(classRoom.name));
        return {
          semesters: sems.filter((s) => p.semesterId === null || s.id === p.semesterId),
          classes: classes.filter((c) => scope === null || scope.has(c.classId)),
        };
      });
    },
  );

  app.get(
    '/v1/cocurricular/programs/:id/assessments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Lembar penilaian kokurikuler satu rombel',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Murid rombel pada semester itu (termasuk murid pindah yang keluar setelah ' +
          'semester berakhir) beserta penilaian tiap butir sasaran. Pengelola, kepala sekolah, kurikulum, operator, dan koordinator ' +
          'melihat semua rombel; fasilitator hanya rombelnya (selain itu 403). `canAssess` menunjukkan hak menyimpan, `locked` ' +
          'rapor rombel sudah final, `programClosed` program selesai. Galat: 404 `not_found`, 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ semesterId: z.uuid(), classId: z.uuid() }),
        response: { 200: assessmentSheetSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId } = request.query;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await assertProgramClass(tx, p.id, classId);
        const sem = await loadSemester(tx, p, semesterId);
        const scope = await viewableClasses(tx, ctx, p.id);
        if (scope !== null && !scope.has(classId)) throw forbidden('Anda bukan fasilitator rombel ini.');
        const { rows } = await semesterRosterOf(tx, classId, sem);
        const ids = rows.map((r) => r.id);
        const cells =
          ids.length === 0
            ? []
            : await tx
                .select({
                  profileItemId: cocurricularAssessment.profileItemId,
                  studentId: cocurricularAssessment.studentId,
                  rubricLevelId: cocurricularAssessment.rubricLevelId,
                  note: cocurricularAssessment.note,
                })
                .from(cocurricularAssessment)
                .where(
                  and(
                    eq(cocurricularAssessment.programId, p.id),
                    eq(cocurricularAssessment.semesterId, semesterId),
                    inArray(cocurricularAssessment.studentId, ids),
                  ),
                );
        const [final] = await tx
          .select({ id: reportCard.id })
          .from(reportCard)
          .where(
            and(
              eq(reportCard.classId, classId),
              eq(reportCard.semesterId, semesterId),
              eq(reportCard.status, 'final'),
            ),
          )
          .limit(1);
        return {
          programId: p.id,
          semesterId,
          classId,
          students: rows.map(({ id, name, nis }) => ({ id, name, nis })),
          cells,
          canAssess: await canAssessCocurricular(tx, ctx, p.id, classId),
          locked: !!final,
          programClosed: p.status === 'closed',
        };
      });
    },
  );

  app.put(
    '/v1/cocurricular/programs/:id/assessments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan penilaian kokurikuler satu rombel',
        description:
          'Izin: `cocurricular:read` di gerbang; hak menyimpan kontekstual: `cocurricular:manage`, koordinator program, atau ' +
          `fasilitator rombel itu (selain itu 403). Satu permintaan menyimpan sampai ${ASSESSMENT_BATCH_LIMIT} sel (butir x murid) ` +
          'sebagai upsert; sel dengan tingkat dan catatan sama-sama kosong menghapus penilaian sel itu. Hanya penilaian sumatif ' +
          'per semester. Murid harus aktif di rombel, butir harus sasaran program, tingkat harus aktif. Galat: 404 `not_found`, ' +
          '400 `invalid_reference`, 400 `student_not_in_class`, 400 `too_many_items`, 409 `program_closed`, 409 `report_final` ' +
          '(rapor murid itu pada semester itu sudah final; buka kembali dulu).',
        headers: schoolHeader,
        params: idParams,
        body: assessmentsSaveSchema,
        response: {
          200: z.object({ saved: z.number().int(), cleared: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, cells } = request.body;
      if (cells.length > ASSESSMENT_BATCH_LIMIT) {
        throw new HttpError(400, 'too_many_items', `Maksimal ${ASSESSMENT_BATCH_LIMIT} sel per simpan.`);
      }
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await mustAssess(tx, ctx, p.id, classId);
        closedGuard(p);
        await assertProgramClass(tx, p.id, classId);
        await loadSemester(tx, p, semesterId);

        const keys = cells.map((c) => `${c.profileItemId}\u0000${c.studentId}`);
        if (new Set(keys).size !== keys.length) throw bad('Sel penilaian ganda (butir dan murid yang sama).');

        const studentIds = [...new Set(cells.map((c) => c.studentId))];
        const { rows: roster } = await rosterOf(tx, classId);
        const inClass = new Set(roster.map((r) => r.id));
        if (studentIds.some((s) => !inClass.has(s))) {
          throw new HttpError(400, 'student_not_in_class', 'Ada murid yang bukan peserta aktif rombel ini.');
        }
        const targets = new Set(
          (
            await tx
              .select({ id: cocurricularProgramTarget.profileItemId })
              .from(cocurricularProgramTarget)
              .where(eq(cocurricularProgramTarget.programId, p.id))
          ).map((t) => t.id),
        );
        if (cells.some((c) => !targets.has(c.profileItemId)))
          throw bad('Ada butir yang bukan sasaran program ini.');
        const levelIds = [...new Set(cells.flatMap((c) => (c.rubricLevelId ? [c.rubricLevelId] : [])))];
        if (levelIds.length > 0) {
          const levels = await tx
            .select({ id: cocurricularRubricLevel.id })
            .from(cocurricularRubricLevel)
            .where(
              and(inArray(cocurricularRubricLevel.id, levelIds), eq(cocurricularRubricLevel.active, true)),
            );
          if (levels.length !== levelIds.length) throw bad('Tingkat rubrik tidak ditemukan atau nonaktif.');
        }
        await assertStudentsReportNotFinal(tx, semesterId, studentIds);

        const toSave = cells.filter((c) => c.rubricLevelId !== null || c.note !== null);
        const toClear = cells.filter((c) => c.rubricLevelId === null && c.note === null);
        const now = new Date();
        if (toSave.length > 0) {
          await tx
            .insert(cocurricularAssessment)
            .values(
              toSave.map((c) => ({
                schoolId: ctx.schoolId,
                programId: p.id,
                semesterId,
                profileItemId: c.profileItemId,
                studentId: c.studentId,
                rubricLevelId: c.rubricLevelId,
                note: c.note,
                updatedBy: ctx.userId,
                updatedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [
                cocurricularAssessment.programId,
                cocurricularAssessment.profileItemId,
                cocurricularAssessment.studentId,
                cocurricularAssessment.semesterId,
              ],
              set: {
                rubricLevelId: sql`excluded.rubric_level_id`,
                note: sql`excluded.note`,
                updatedBy: ctx.userId,
                updatedAt: now,
              },
            });
        }
        for (const c of toClear) {
          await tx
            .delete(cocurricularAssessment)
            .where(
              and(
                eq(cocurricularAssessment.programId, p.id),
                eq(cocurricularAssessment.semesterId, semesterId),
                eq(cocurricularAssessment.profileItemId, c.profileItemId),
                eq(cocurricularAssessment.studentId, c.studentId),
              ),
            );
        }
        await audit(tx, ctx, 'cocurricular.assessments.save', 'cocurricular_program', p.id, {
          classId,
          semesterId,
          saved: toSave.length,
          cleared: toClear.length,
        });
        return { saved: toSave.length, cleared: toClear.length };
      });
    },
  );

  app.get(
    '/v1/cocurricular/programs/:id/evidence',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar bukti kokurikuler',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Bukti karya berupa tautan https untuk program, terbaru dulu; saring dengan ' +
          '`classId`. Fasilitator hanya melihat bukti rombelnya (koordinator, pengelola, kepala sekolah, kurikulum, dan operator ' +
          'melihat semua). `canAssess` = boleh menambah/menghapus bukti untuk `classId` itu (tanpa `classId`: bukti tingkat program).',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ classId: z.uuid().optional() }),
        response: {
          200: z.object({
            canAssess: z.boolean(),
            programClosed: z.boolean(),
            evidence: z.array(evidenceSchema),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classId } = request.query;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        const scope = await viewableClasses(tx, ctx, p.id);
        if (scope !== null && classId && !scope.has(classId))
          throw forbidden('Anda bukan fasilitator rombel ini.');
        const rows = await tx
          .select({
            id: cocurricularEvidence.id,
            programId: cocurricularEvidence.programId,
            classId: cocurricularEvidence.classId,
            studentId: cocurricularEvidence.studentId,
            studentName: student.name,
            title: cocurricularEvidence.title,
            url: cocurricularEvidence.url,
            createdAt: cocurricularEvidence.createdAt,
          })
          .from(cocurricularEvidence)
          .leftJoin(student, eq(student.id, cocurricularEvidence.studentId))
          .where(
            and(
              eq(cocurricularEvidence.programId, p.id),
              classId ? eq(cocurricularEvidence.classId, classId) : undefined,
            ),
          )
          .orderBy(asc(cocurricularEvidence.createdAt));
        const visible = rows.filter((r) => scope === null || (r.classId !== null && scope.has(r.classId)));
        return {
          canAssess: await canAssessCocurricular(tx, ctx, p.id, classId ?? null),
          programClosed: p.status === 'closed',
          evidence: visible.reverse().map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        };
      });
    },
  );

  app.post(
    '/v1/cocurricular/programs/:id/evidence',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Tambah bukti kokurikuler',
        description:
          'Izin: `cocurricular:read` di gerbang; hak kontekstual seperti penyimpanan penilaian (pengelola, koordinator, atau ' +
          'fasilitator `classId` itu; bukti tanpa `classId` hanya pengelola/koordinator). Bukti hanya TAUTAN https (maks. 500 ' +
          'karakter); unggah berkas belum ada. `studentId` opsional dan harus murid aktif di `classId`. Galat: 404 `not_found`, ' +
          '400 `invalid_url`, 400 `invalid_reference`, 400 `student_not_in_class`, 409 `program_closed`.',
        headers: schoolHeader,
        params: idParams,
        body: evidenceInputSchema,
        response: { 201: evidenceSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { title, url, classId, studentId } = request.body;
      const out = await tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await mustAssess(tx, ctx, p.id, classId);
        closedGuard(p);
        if (!isEvidenceUrl(url)) {
          throw new HttpError(400, 'invalid_url', 'Bukti harus berupa tautan https (maksimal 500 karakter).');
        }
        let studentName: string | null = null;
        if (classId) await assertProgramClass(tx, p.id, classId);
        if (studentId) {
          if (!classId) throw bad('Bukti untuk murid harus menyebut rombelnya.');
          const { rows } = await rosterOf(tx, classId);
          const hit = rows.find((r) => r.id === studentId);
          if (!hit) throw new HttpError(400, 'student_not_in_class', 'Murid bukan peserta aktif rombel ini.');
          studentName = hit.name;
        }
        const [row] = await tx
          .insert(cocurricularEvidence)
          .values({
            schoolId: ctx.schoolId,
            programId: p.id,
            classId,
            studentId,
            title,
            url: url.trim(),
            createdBy: ctx.userId,
          })
          .returning();
        const r = row as typeof cocurricularEvidence.$inferSelect;
        await audit(tx, ctx, 'cocurricular.evidence.add', 'cocurricular_program', p.id, { evidenceId: r.id });
        return {
          id: r.id,
          programId: r.programId,
          classId: r.classId,
          studentId: r.studentId,
          studentName,
          title: r.title,
          url: r.url,
          createdAt: r.createdAt.toISOString(),
        };
      });
      return reply.code(201).send(out);
    },
  );

  app.delete(
    '/v1/cocurricular/programs/:id/evidence/:evidenceId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Hapus bukti kokurikuler',
        description:
          'Izin: `cocurricular:read` di gerbang; hak kontekstual seperti menambah bukti. Galat: 404 `not_found`, 409 `program_closed`.',
        headers: schoolHeader,
        params: evidenceParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        const [ev] = await tx
          .select()
          .from(cocurricularEvidence)
          .where(
            and(
              eq(cocurricularEvidence.id, request.params.evidenceId),
              eq(cocurricularEvidence.programId, p.id),
            ),
          );
        if (!ev) throw new HttpError(404, 'not_found', 'Bukti tidak ditemukan.');
        await mustAssess(tx, ctx, p.id, ev.classId);
        closedGuard(p);
        await tx.delete(cocurricularEvidence).where(eq(cocurricularEvidence.id, ev.id));
        await audit(tx, ctx, 'cocurricular.evidence.delete', 'cocurricular_program', p.id, {
          evidenceId: ev.id,
        });
        return { ok: true as const };
      });
    },
  );
}
