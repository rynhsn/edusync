import {
  academicYear,
  and,
  asc,
  assessment,
  classRoom,
  enrollment,
  eq,
  type exam,
  examAnswer,
  examAttempt,
  examQuestion,
  gradeComponent,
  inArray,
  type QuestionOption,
  score as scoreTable,
  semester,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { examOrThrow, guardSubject } from '../exam-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, schoolHeader } from './helpers';

const tag = ['Exams'];
const readGate = [requirePermission('exam:read'), requireModule('exams')];
const writeGate = [requirePermission('exam:author'), requireModule('exams')];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const round2 = (n: number) => Math.round(n * 100) / 100;

const answerCell = z.object({
  answer: z.string().nullable(),
  score: z.number().nullable(),
});
const sheetSchema = z.object({
  examId: z.uuid(),
  maxTotal: z.number(),
  questions: z.array(
    z.object({
      id: z.uuid(),
      sort: z.number().int(),
      type: z.enum(['mcq', 'essay']),
      points: z.number().int(),
      /** Kunci pilihan ganda (huruf); null untuk esai. */
      key: z.string().nullable(),
      optionKeys: z.array(z.string()),
    }),
  ),
  students: z.array(
    z.object({
      studentId: z.uuid(),
      name: z.string(),
      nis: z.string().nullable(),
      classId: z.uuid(),
      className: z.string(),
      entered: z.boolean().describe('Sudah ada data hasil untuk siswa ini'),
      absent: z.boolean(),
      answers: z.record(z.string(), answerCell).describe('Kunci = id soal ujian'),
      total: z.number().describe('Jumlah skor yang sudah terisi'),
      percent: z
        .number()
        .nullable()
        .describe('total / maxTotal x 100; null bila belum ada data atau tidak hadir'),
      essayPending: z.boolean().describe('Ada esai yang belum diberi skor'),
    }),
  ),
});

const recordsBody = z.object({
  records: z
    .array(
      z.object({
        studentId: z.uuid(),
        absent: z.boolean().default(false),
        answers: z
          .array(
            z.object({
              questionId: z.uuid(),
              answer: z.string().trim().max(10).nullish(),
              score: z.number().min(0).max(100_000).nullish(),
            }),
          )
          .max(500)
          .default([]),
      }),
    )
    .min(1)
    .max(500),
});

/** Hasil ujian: input jawaban dan skor siswa (kertas), lalu kirim ke buku nilai (modul `exams` + `grades`). */
export async function examScoreRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function roster(tx: Tx, ex: typeof exam.$inferSelect) {
    if (ex.classIds.length === 0) return [];
    const [sem] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, ex.semesterId));
    if (!sem) return [];
    return tx
      .select({
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        classId: classRoom.id,
        className: classRoom.name,
      })
      .from(enrollment)
      .innerJoin(student, eq(student.id, enrollment.studentId))
      .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(
        and(
          inArray(enrollment.classId, ex.classIds),
          eq(enrollment.academicYearId, sem.yearId),
          eq(student.status, 'active'),
        ),
      )
      .orderBy(asc(classRoom.name), asc(student.name));
  }

  async function sheet(tx: Tx, ex: typeof exam.$inferSelect) {
    const qs = await tx
      .select()
      .from(examQuestion)
      .where(eq(examQuestion.examId, ex.id))
      .orderBy(asc(examQuestion.sort), asc(examQuestion.id));
    const people = await roster(tx, ex);
    const attempts = await tx.select().from(examAttempt).where(eq(examAttempt.examId, ex.id));
    const answers = attempts.length
      ? await tx
          .select()
          .from(examAnswer)
          .where(
            inArray(
              examAnswer.attemptId,
              attempts.map((a) => a.id),
            ),
          )
      : [];
    const maxTotal = qs.reduce((n, q) => n + q.points, 0);
    const attemptOf = new Map(attempts.map((a) => [a.studentId, a]));
    const byAttempt = new Map<string, typeof answers>();
    for (const a of answers) byAttempt.set(a.attemptId, [...(byAttempt.get(a.attemptId) ?? []), a]);

    return {
      examId: ex.id,
      maxTotal,
      questions: qs.map((q) => ({
        id: q.id,
        sort: q.sort,
        type: q.type,
        points: q.points,
        key: q.type === 'mcq' ? (q.answer ?? null) : null,
        optionKeys: (q.options as QuestionOption[]).map((o) => o.key),
      })),
      students: people.map((p) => {
        const at = attemptOf.get(p.studentId);
        const rows = at ? (byAttempt.get(at.id) ?? []) : [];
        const cells: Record<string, { answer: string | null; score: number | null }> = {};
        for (const r of rows) cells[r.examQuestionId] = { answer: r.answer, score: r.score };
        const total = round2(rows.reduce((n, r) => n + (r.score ?? 0), 0));
        const absent = at?.absent ?? false;
        return {
          ...p,
          entered: !!at,
          absent,
          answers: cells,
          total,
          percent: at && !absent && maxTotal > 0 ? round2((total / maxTotal) * 100) : null,
          essayPending: !absent && !!at && qs.some((q) => q.type === 'essay' && cells[q.id]?.score == null),
        };
      }),
    };
  }

  app.get(
    '/v1/exams/:id/scoresheet',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Lembar nilai ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Siswa aktif kelas peserta (menurut pendaftaran tahun ajaran semester ' +
          'ujian) dengan jawaban dan skor yang sudah dimasukkan, jumlah skor, dan persentase. 404 `not_found` ' +
          '(juga bagi guru yang tidak mengampu mapelnya).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: sheetSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        sheet(tx, await examOrThrow(tx, request.ctx as TenantContext, request.params.id, false)),
      ),
  );

  app.put(
    '/v1/exams/:id/scoresheet',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Simpan hasil ujian siswa',
        description:
          'Izin: `exam:author`; modul `exams`; guru hanya untuk mapel yang ia ampu (403). Per siswa: `absent` ' +
          '(tidak hadir menghapus jawabannya) dan `answers`. Pilihan ganda: `answer` = huruf opsi atau kosong; skor ' +
          'dihitung otomatis (benar = poin soal, selain itu 0) dan `score` kiriman diabaikan. Esai: `score` 0 sampai poin ' +
          'soal (kosong = belum dinilai). Soal yang tidak disebut tidak berubah. Siswa di luar kelas peserta, soal ' +
          'di luar ujian, huruf di luar opsi, atau skor di luar rentang: 400 `invalid_reference`/`validation`.',
        headers: schoolHeader,
        params: idParams,
        body: recordsBody,
        response: { 200: sheetSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const qs = await tx.select().from(examQuestion).where(eq(examQuestion.examId, ex.id));
        const qById = new Map(qs.map((q) => [q.id, q]));
        const allowed = new Set((await roster(tx, ex)).map((p) => p.studentId));

        for (const rec of request.body.records) {
          if (!allowed.has(rec.studentId)) throw invalidRef('Ada siswa yang bukan peserta ujian ini.');
          for (const a of rec.answers) {
            const q = qById.get(a.questionId);
            if (!q) throw invalidRef('Ada soal yang bukan bagian dari ujian ini.');
            if (q.type === 'mcq') {
              const keys = (q.options as QuestionOption[]).map((o) => o.key.toUpperCase());
              if (a.answer && !keys.includes(a.answer.toUpperCase())) {
                throw new HttpError(400, 'validation', `Pilihan ${a.answer} tidak ada pada soal.`);
              }
            } else if (a.score != null && a.score > q.points) {
              throw new HttpError(400, 'validation', `Skor esai maksimal ${q.points}.`);
            }
          }
        }

        const now = new Date();
        for (const rec of request.body.records) {
          const [at] = await tx
            .insert(examAttempt)
            .values({
              schoolId: ctx.schoolId,
              examId: ex.id,
              studentId: rec.studentId,
              absent: rec.absent,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [examAttempt.examId, examAttempt.studentId],
              set: { absent: rec.absent, updatedBy: ctx.userId, updatedAt: now },
            })
            .returning({ id: examAttempt.id });
          if (rec.absent) {
            await tx.delete(examAnswer).where(eq(examAnswer.attemptId, at!.id));
            continue;
          }
          for (const a of rec.answers) {
            const q = qById.get(a.questionId) as NonNullable<ReturnType<typeof qById.get>>;
            const answer = q.type === 'mcq' ? a.answer?.toUpperCase() || null : null;
            const value =
              q.type === 'mcq'
                ? answer && answer === q.answer?.toUpperCase()
                  ? q.points
                  : 0
                : (a.score ?? null);
            await tx
              .insert(examAnswer)
              .values({
                schoolId: ctx.schoolId,
                attemptId: at!.id,
                examQuestionId: q.id,
                answer,
                score: value,
              })
              .onConflictDoUpdate({
                target: [examAnswer.attemptId, examAnswer.examQuestionId],
                set: { answer, score: value },
              });
          }
        }
        await audit(tx, ctx, 'exam.scores_save', 'exam', ex.id, { students: request.body.records.length });
        return sheet(tx, ex);
      });
    },
  );

  app.post(
    '/v1/exams/:id/grades',
    {
      onRequest: [requirePermission('exam:author'), requireModule('exams'), requireModule('grades')],
      schema: {
        tags: tag,
        summary: 'Kirim hasil ujian ke buku nilai',
        description:
          'Izin: `exam:author`; modul `exams` dan `grades`; guru hanya untuk mapel yang ia ampu (403). Membuat atau ' +
          'memperbarui satu penilaian per kelas peserta pada komponen `componentId` (skala 100 = jumlah skor / total ' +
          'poin x 100, dua desimal) dan mengisi skor siswa yang sudah punya data; siswa tidak hadir diberi skor kosong. ' +
          'Dipanggil ulang menimpa penilaian yang sama (tidak ganda). Ujian tanpa soal: 400 `no_questions`; ' +
          'komponen tidak ada: 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ componentId: z.uuid(), date: z.iso.date().optional() }),
        response: {
          200: z.object({ assessments: z.number().int(), scores: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const [comp] = await tx
          .select({ id: gradeComponent.id })
          .from(gradeComponent)
          .where(eq(gradeComponent.id, request.body.componentId));
        if (!comp) throw invalidRef('Komponen nilai tidak ditemukan.');
        const data = await sheet(tx, ex);
        if (data.maxTotal <= 0) throw new HttpError(400, 'no_questions', 'Ujian belum memiliki soal.');
        const [me] = await tx
          .select({ id: teacher.id })
          .from(teacher)
          .where(eq(teacher.memberId, ctx.memberId));
        const date = request.body.date ?? ex.examDate ?? new Date().toISOString().slice(0, 10);

        let scores = 0;
        const classIds = [...new Set(data.students.map((s) => s.classId))];
        for (const classId of classIds) {
          const values = {
            semesterId: ex.semesterId,
            subjectId: ex.subjectId,
            componentId: comp.id,
            teacherId: me?.id ?? null,
            title: ex.title,
            date,
            maxScore: 100,
          };
          const [existing] = await tx
            .select({ id: assessment.id })
            .from(assessment)
            .where(and(eq(assessment.examId, ex.id), eq(assessment.classId, classId)));
          const assessmentId = existing
            ? existing.id
            : (
                await tx
                  .insert(assessment)
                  .values({ ...values, schoolId: ctx.schoolId, classId, examId: ex.id })
                  .returning({ id: assessment.id })
              )[0]!.id;
          if (existing) await tx.update(assessment).set(values).where(eq(assessment.id, existing.id));

          for (const s of data.students.filter((x) => x.classId === classId && x.entered)) {
            const value = s.absent ? null : round2((s.total / data.maxTotal) * 100);
            await tx
              .insert(scoreTable)
              .values({
                schoolId: ctx.schoolId,
                assessmentId,
                studentId: s.studentId,
                value,
                updatedBy: ctx.userId,
              })
              .onConflictDoUpdate({
                target: [scoreTable.assessmentId, scoreTable.studentId],
                set: { value, updatedBy: ctx.userId, updatedAt: new Date() },
              });
            scores += 1;
          }
        }
        await audit(tx, ctx, 'exam.grades_push', 'exam', ex.id, { assessments: classIds.length, scores });
        return { assessments: classIds.length, scores };
      });
    },
  );
}
