import { createHash } from 'node:crypto';
import { zonedTimeToDate } from '@edusync/contracts';
import {
  and,
  asc,
  enrollment,
  eq,
  exam,
  examAnswer,
  examAttempt,
  examQuestion,
  inArray,
  portalLink,
  type QuestionOption,
  school,
  semester,
  sql,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Exams (siswa)'];
const gate = [requirePermission('portal:read'), requireModule('exams')];
/** Ujian selesai lebih dari ini tidak lagi dimunculkan di daftar siswa. */
const LIST_DAYS_BACK = 30;

type ExamRow = typeof exam.$inferSelect;
type AttemptRow = typeof examAttempt.$inferSelect;

const stateEnum = z.enum(['unscheduled', 'upcoming', 'open', 'in_progress', 'submitted', 'closed']);
const listItem = z.object({
  id: z.uuid(),
  title: z.string(),
  typeShort: z.string(),
  subjectName: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  questionCount: z.number().int(),
  state: stateEnum,
});

const sessionSchema = z.object({
  state: z.enum(['in_progress', 'submitted']),
  exam: z.object({ id: z.uuid(), title: z.string(), subjectName: z.string() }),
  startedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  serverNow: z.string(),
  questions: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(['mcq', 'essay']),
      body: z.string(),
      points: z.number().int(),
      options: z.array(z.object({ key: z.string(), text: z.string() })),
    }),
  ),
  answers: z.record(z.string(), z.string().nullable()),
});

/** Urutan acak yang tetap untuk satu percobaan: pengurutan menurut hash(id percobaan + id butir). */
const stable = (seed: string, key: string) => createHash('sha1').update(`${seed}:${key}`).digest('hex');
const shuffled = <T>(items: T[], seed: string, keyOf: (x: T) => string) =>
  [...items].sort((a, b) => stable(seed, keyOf(a)).localeCompare(stable(seed, keyOf(b))));

/** Waktu jendela ujian dari tanggal, jam mulai, dan durasi (zona waktu sekolah); null bila belum dijadwalkan. */
function windowOf(ex: ExamRow, tz: string) {
  if (!ex.examDate || !ex.startTime || !ex.durationMinutes) return null;
  const start = zonedTimeToDate(ex.examDate, ex.startTime, tz);
  return { start, end: new Date(start.getTime() + ex.durationMinutes * 60_000) };
}

/** Ujian CBT untuk siswa: peserta (kelas di tahun ajaran semester ujian), mode cbt/both, dan sudah `ready`. */
export async function portalExamsRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Id siswa milik akun ini; null untuk akun wali/staf (bukan peserta ujian). */
  async function myStudentId(tx: Tx, ctx: TenantContext) {
    const [link] = await tx.select().from(portalLink).where(eq(portalLink.memberId, ctx.memberId));
    return link?.kind === 'student' && link.studentId ? link.studentId : null;
  }

  /** Untuk rute satu ujian: bukan siswa = ujian tidak ada baginya. */
  async function studentOrThrow(tx: Tx, ctx: TenantContext) {
    const sid = await myStudentId(tx, ctx);
    if (!sid) throw new HttpError(404, 'not_found', 'Ujian tidak ditemukan.');
    return sid;
  }

  async function schoolTz(tx: Tx, ctx: TenantContext) {
    const [s] = await tx.select({ tz: school.timezone }).from(school).where(eq(school.id, ctx.schoolId));
    return s?.tz ?? 'Asia/Jakarta';
  }

  /** Ujian CBT yang boleh diikuti siswa ini, dengan nama mapel. */
  async function eligible(tx: Tx, studentId: string) {
    const enrolled = await tx
      .select({ yearId: enrollment.academicYearId, classId: enrollment.classId })
      .from(enrollment)
      .where(eq(enrollment.studentId, studentId));
    if (enrolled.length === 0) return [];
    const classByYear = new Map(enrolled.map((e) => [e.yearId, e.classId]));
    const rows = await tx
      .select({ e: exam, yearId: semester.academicYearId, subjectName: subject.name })
      .from(exam)
      .innerJoin(semester, eq(semester.id, exam.semesterId))
      .innerJoin(subject, eq(subject.id, exam.subjectId))
      .where(and(eq(exam.status, 'ready'), inArray(exam.mode, ['cbt', 'both'])));
    return rows.filter((r) => {
      const cls = classByYear.get(r.yearId);
      return !!cls && r.e.classIds.includes(cls);
    });
  }

  async function ownExam(tx: Tx, studentId: string, id: string) {
    const found = (await eligible(tx, studentId)).find((r) => r.e.id === id);
    if (!found) throw new HttpError(404, 'not_found', 'Ujian tidak ditemukan.');
    return found;
  }

  const attemptOf = async (tx: Tx, examId: string, studentId: string) =>
    (
      await tx
        .select()
        .from(examAttempt)
        .where(and(eq(examAttempt.examId, examId), eq(examAttempt.studentId, studentId)))
    )[0];

  /** Waktu habis: tandai terkumpul pada batas akhir (jawaban sesudahnya tidak diterima). */
  async function finalizeIfExpired(tx: Tx, at: AttemptRow | undefined) {
    if (!at || at.submittedAt || !at.deadlineAt || at.deadlineAt.getTime() > Date.now()) return at;
    const [row] = await tx
      .update(examAttempt)
      .set({ submittedAt: at.deadlineAt, updatedAt: new Date() })
      .where(eq(examAttempt.id, at.id))
      .returning();
    return row;
  }

  app.get(
    '/v1/portal/exams',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Daftar ujian di layar untuk siswa',
        description:
          'Izin: `portal:read`; modul `exams`. Akun yang bukan siswa (wali, staf) mendapat daftar kosong. Ujian bermode `cbt`/`both` berstatus ' +
          '`ready` untuk kelas siswa pada tahun ajaran semester ujian. `state`: `unscheduled` (belum ada jadwal), ' +
          '`upcoming`, `open` (boleh mulai), `in_progress`, `submitted`, `closed` (waktu lewat tanpa dikerjakan). ' +
          `Ujian yang selesai lebih dari ${LIST_DAYS_BACK} hari lalu tidak ditampilkan.`,
        headers: schoolHeader,
        response: { 200: z.array(listItem), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const sid = await myStudentId(tx, ctx);
        if (!sid) return [];
        const tz = await schoolTz(tx, ctx);
        const now = Date.now();
        const mine = await eligible(tx, sid);
        const items = [];
        for (const { e, subjectName } of mine) {
          const at = await finalizeIfExpired(tx, await attemptOf(tx, e.id, sid));
          const win = windowOf(e, tz);
          let state: z.infer<typeof stateEnum>;
          if (at?.submittedAt) state = 'submitted';
          else if (at?.startedAt) state = 'in_progress';
          else if (!win) state = 'unscheduled';
          else if (now < win.start.getTime()) state = 'upcoming';
          else if (now >= win.end.getTime()) state = 'closed';
          else state = 'open';
          if (win && win.end.getTime() < now - LIST_DAYS_BACK * 86_400_000) continue;
          const qs = await tx
            .select({ id: examQuestion.id })
            .from(examQuestion)
            .where(eq(examQuestion.examId, e.id));
          items.push({
            id: e.id,
            title: e.title,
            typeShort: e.typeShort,
            subjectName,
            startsAt: win?.start.toISOString() ?? null,
            endsAt: win?.end.toISOString() ?? null,
            durationMinutes: e.durationMinutes,
            questionCount: qs.length,
            state,
          });
        }
        return items.sort((a, b) => (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9'));
      });
    },
  );

  async function session(
    tx: Tx,
    ctx: TenantContext,
    found: { e: ExamRow; subjectName: string },
    at: AttemptRow,
  ) {
    const qs = await tx
      .select()
      .from(examQuestion)
      .where(eq(examQuestion.examId, found.e.id))
      .orderBy(asc(examQuestion.sort), asc(examQuestion.id));
    const ordered = found.e.shuffleQuestions ? shuffled(qs, at.id, (q) => q.id) : qs;
    const saved = await tx.select().from(examAnswer).where(eq(examAnswer.attemptId, at.id));
    const answers: Record<string, string | null> = {};
    for (const a of saved) answers[a.examQuestionId] = a.answer;
    void ctx;
    return {
      state: at.submittedAt ? ('submitted' as const) : ('in_progress' as const),
      exam: { id: found.e.id, title: found.e.title, subjectName: found.subjectName },
      startedAt: at.startedAt?.toISOString() ?? null,
      deadlineAt: at.deadlineAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      // Tanpa kunci jawaban dan pedoman esai: hanya yang perlu dilihat siswa.
      questions: ordered.map((q) => {
        const options = q.options as QuestionOption[];
        return {
          id: q.id,
          type: q.type,
          body: q.body,
          points: q.points,
          options:
            q.type === 'mcq' && found.e.shuffleOptions
              ? shuffled(options, `${at.id}:${q.id}`, (o) => o.key)
              : options,
        };
      }),
      answers,
    };
  }

  app.post(
    '/v1/portal/exams/:id/start',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Mulai (atau lanjutkan) ujian',
        description:
          'Izin: `portal:read` (akun siswa); modul `exams`. Hanya saat `state` = `open`/`in_progress`. Waktu dihitung ' +
          'server: batas akhir = yang lebih awal antara mulai + durasi dan akhir jendela ujian. Memanggil lagi ' +
          'melanjutkan percobaan yang sama (tidak mengulang waktu). Sudah dikumpulkan: 409 `already_submitted`; ' +
          'belum waktunya/lewat: 409 `not_open`. Soal dikirim tanpa kunci jawaban.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: sessionSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const sid = await studentOrThrow(tx, ctx);
        const found = await ownExam(tx, sid, request.params.id);
        let at = await finalizeIfExpired(tx, await attemptOf(tx, found.e.id, sid));
        if (at?.submittedAt) throw new HttpError(409, 'already_submitted', 'Ujian ini sudah dikumpulkan.');
        if (!at?.startedAt) {
          const win = windowOf(found.e, await schoolTz(tx, ctx));
          const now = Date.now();
          if (!win || now < win.start.getTime() || now >= win.end.getTime()) {
            throw new HttpError(409, 'not_open', 'Ujian belum dibuka atau waktunya sudah lewat.');
          }
          // Jawaban yang dimasukkan guru dari kertas tidak boleh terbawa ke percobaan CBT siswa.
          if (at) await tx.delete(examAnswer).where(eq(examAnswer.attemptId, at.id));
          const startedAt = new Date(now);
          const deadlineAt = new Date(
            Math.min(now + (found.e.durationMinutes as number) * 60_000, win.end.getTime()),
          );
          [at] = await tx
            .insert(examAttempt)
            .values({
              schoolId: ctx.schoolId,
              examId: found.e.id,
              studentId: sid,
              startedAt,
              deadlineAt,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [examAttempt.examId, examAttempt.studentId],
              set: { startedAt, deadlineAt, absent: false, updatedBy: ctx.userId, updatedAt: startedAt },
            })
            .returning();
          await audit(tx, ctx, 'exam.cbt_start', 'exam', found.e.id, { studentId: sid });
        }
        return session(tx, ctx, found, at as AttemptRow);
      });
    },
  );

  app.get(
    '/v1/portal/exams/:id/session',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Muat ulang sesi ujian yang sedang berjalan',
        description:
          'Izin: `portal:read` (akun siswa); modul `exams`. Soal (tanpa kunci), jawaban tersimpan, dan batas akhir; ' +
          'dipakai saat halaman dimuat ulang. 404 `not_found` bila belum dimulai. Bila waktu sudah habis, percobaan ' +
          'otomatis dikumpulkan dan `state` = `submitted`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: sessionSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const sid = await studentOrThrow(tx, ctx);
        const found = await ownExam(tx, sid, request.params.id);
        const at = await finalizeIfExpired(tx, await attemptOf(tx, found.e.id, sid));
        if (!at?.startedAt) throw new HttpError(404, 'not_found', 'Ujian belum dimulai.');
        return session(tx, ctx, found, at);
      });
    },
  );

  app.put(
    '/v1/portal/exams/:id/answers',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Simpan jawaban (otomatis, berkala)',
        description:
          'Izin: `portal:read` (akun siswa); modul `exams`. Menyimpan jawaban yang disebut saja. Pilihan ganda: huruf ' +
          'opsi atau kosong (400 `validation` bila huruf tidak ada); esai: teks sampai 10.000 karakter. `blurs` = ' +
          'jumlah siswa meninggalkan tab (hanya naik). Sesudah dikumpulkan atau waktu habis: 409 `closed`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          answers: z
            .array(z.object({ questionId: z.uuid(), answer: z.string().max(10_000).nullable() }))
            .max(500),
          blurs: z.number().int().min(0).max(10_000).optional(),
        }),
        response: {
          200: z.object({ saved: z.number().int(), serverNow: z.string() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const sid = await studentOrThrow(tx, ctx);
        const found = await ownExam(tx, sid, request.params.id);
        const at = await finalizeIfExpired(tx, await attemptOf(tx, found.e.id, sid));
        if (!at?.startedAt) throw new HttpError(404, 'not_found', 'Ujian belum dimulai.');
        if (at.submittedAt)
          throw new HttpError(409, 'closed', 'Ujian sudah dikumpulkan atau waktunya habis.');
        const qs = await tx.select().from(examQuestion).where(eq(examQuestion.examId, found.e.id));
        const byId = new Map(qs.map((q) => [q.id, q]));
        for (const a of request.body.answers) {
          const q = byId.get(a.questionId);
          if (!q) throw new HttpError(400, 'validation', 'Ada soal yang bukan bagian dari ujian ini.');
          if (q.type === 'mcq' && a.answer) {
            const keys = (q.options as QuestionOption[]).map((o) => o.key.toUpperCase());
            if (!keys.includes(a.answer.toUpperCase()))
              throw new HttpError(400, 'validation', 'Pilihan tidak ada pada soal.');
          }
        }
        for (const a of request.body.answers) {
          const q = byId.get(a.questionId) as NonNullable<ReturnType<typeof byId.get>>;
          const answer = q.type === 'mcq' ? a.answer?.toUpperCase() || null : a.answer?.trim() || null;
          // Pilihan ganda dinilai di server saat disimpan; esai dinilai guru nanti (skor tidak disentuh).
          const mcqScore = answer && answer === q.answer?.toUpperCase() ? q.points : 0;
          await tx
            .insert(examAnswer)
            .values({
              schoolId: ctx.schoolId,
              attemptId: at.id,
              examQuestionId: q.id,
              answer,
              score: q.type === 'mcq' ? mcqScore : null,
            })
            .onConflictDoUpdate({
              target: [examAnswer.attemptId, examAnswer.examQuestionId],
              set: q.type === 'mcq' ? { answer, score: mcqScore } : { answer },
            });
        }
        if (request.body.blurs !== undefined) {
          await tx
            .update(examAttempt)
            .set({ blurCount: sql`greatest(${examAttempt.blurCount}, ${request.body.blurs})` })
            .where(eq(examAttempt.id, at.id));
        }
        return { saved: request.body.answers.length, serverNow: new Date().toISOString() };
      });
    },
  );

  app.post(
    '/v1/portal/exams/:id/submit',
    {
      onRequest: gate,
      schema: {
        tags: tag,
        summary: 'Kumpulkan ujian',
        description:
          'Izin: `portal:read` (akun siswa); modul `exams`. Menutup percobaan; sesudahnya jawaban tidak bisa diubah. ' +
          'Memanggil ulang pada percobaan yang sudah terkumpul tidak error. Skor tidak dikembalikan ke siswa.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const sid = await studentOrThrow(tx, ctx);
        const found = await ownExam(tx, sid, request.params.id);
        const at = await finalizeIfExpired(tx, await attemptOf(tx, found.e.id, sid));
        if (!at?.startedAt) throw new HttpError(404, 'not_found', 'Ujian belum dimulai.');
        if (at.submittedAt) return;
        await tx
          .update(examAttempt)
          .set({ submittedAt: new Date(), updatedAt: new Date() })
          .where(eq(examAttempt.id, at.id));
        await audit(tx, ctx, 'exam.cbt_submit', 'exam', found.e.id, { studentId: sid });
      });
      return { ok: true as const };
    },
  );
}
