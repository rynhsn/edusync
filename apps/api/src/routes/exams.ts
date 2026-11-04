import { DEFAULT_EXAM_PAPER, examPaperConfigSchema, resolveExamPaper } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  eq,
  exam,
  examPaperSetting,
  examQuestion,
  examType,
  inArray,
  max,
  question,
  school,
  semester,
  subject,
  sum,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { examOrThrow, guardSubject, subjectScope } from '../exam-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';
import { readIdentity } from './school-identity';

const tag = ['Exams'];
const readGate = [requirePermission('exam:read'), requireModule('exams')];
const authorGate = [requirePermission('exam:author'), requireModule('exams')];
const manageGate = [requirePermission('exam:manage'), requireModule('exams')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const ZONE_LABEL: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM.');
const examBody = z.object({
  examTypeId: z.uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  semesterId: z.uuid(),
  subjectId: z.uuid(),
  classIds: z.array(z.uuid()).min(1, 'Pilih minimal satu kelas.').max(40),
  mode: z.enum(['cbt', 'paper', 'both']).default('paper'),
  examDate: z.iso.date().nullish(),
  startTime: hhmm.nullish(),
  durationMinutes: z.number().int().min(5).max(600).nullish(),
  status: z.enum(['draft', 'ready']).default('draft'),
});

const examSchema = z.object({
  id: z.uuid(),
  examTypeId: z.uuid().nullable(),
  typeName: z.string(),
  typeShort: z.string(),
  title: z.string(),
  semesterId: z.uuid(),
  semesterName: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  classIds: z.array(z.uuid()),
  classNames: z.array(z.string()),
  mode: z.enum(['cbt', 'paper', 'both']),
  examDate: z.string().nullable(),
  startTime: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  status: z.enum(['draft', 'ready']),
  customPaper: z.boolean().describe('Ujian ini punya pengaturan lembar sendiri'),
  questionCount: z.number().int(),
  totalPoints: z.number().int(),
  updatedAt: z.string(),
});

const examQuestionSchema = z.object({
  id: z.uuid(),
  sourceQuestionId: z.uuid().nullable(),
  sort: z.number().int(),
  type: z.enum(['mcq', 'essay']),
  body: z.string(),
  options: z.array(z.object({ key: z.string(), text: z.string() })),
  answer: z.string().nullable(),
  points: z.number().int(),
});

const detailSchema = examSchema.extend({ questions: z.array(examQuestionSchema) });
const paperSchema = z.object({ config: examPaperConfigSchema, custom: z.boolean() });

type ExamRow = typeof exam.$inferSelect;

/** Rujukan nama (semester, mapel, kelas) dan hitungan soal untuk sekumpulan ujian. */
async function describeExams(tx: Tx, rows: ExamRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sems = await tx.select({ id: semester.id, name: semester.name }).from(semester);
  const subs = await tx.select({ id: subject.id, name: subject.name }).from(subject);
  const classes = await tx.select({ id: classRoom.id, name: classRoom.name }).from(classRoom);
  const totals = await tx
    .select({ examId: examQuestion.examId, n: count(), pts: sum(examQuestion.points) })
    .from(examQuestion)
    .where(inArray(examQuestion.examId, ids))
    .groupBy(examQuestion.examId);
  const semName = new Map(sems.map((s) => [s.id, s.name]));
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  const clsName = new Map(classes.map((c) => [c.id, c.name]));
  const tot = new Map(totals.map((t) => [t.examId, t]));
  return rows.map((r) => ({
    id: r.id,
    examTypeId: r.examTypeId,
    typeName: r.typeName,
    typeShort: r.typeShort,
    title: r.title,
    semesterId: r.semesterId,
    semesterName: semName.get(r.semesterId) ?? '',
    subjectId: r.subjectId,
    subjectName: subName.get(r.subjectId) ?? '',
    classIds: r.classIds,
    classNames: r.classIds.map((c) => clsName.get(c) ?? '').filter(Boolean),
    mode: r.mode,
    examDate: r.examDate,
    startTime: r.startTime,
    durationMinutes: r.durationMinutes,
    status: r.status,
    customPaper: r.paper !== null,
    questionCount: Number(tot.get(r.id)?.n ?? 0),
    totalPoints: Number(tot.get(r.id)?.pts ?? 0),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function questionsOf(tx: Tx, examId: string) {
  return tx
    .select({
      id: examQuestion.id,
      sourceQuestionId: examQuestion.sourceQuestionId,
      sort: examQuestion.sort,
      type: examQuestion.type,
      body: examQuestion.body,
      options: examQuestion.options,
      answer: examQuestion.answer,
      points: examQuestion.points,
    })
    .from(examQuestion)
    .where(eq(examQuestion.examId, examId))
    .orderBy(asc(examQuestion.sort), asc(examQuestion.id));
}

async function detail(tx: Tx, row: ExamRow) {
  const [d] = await describeExams(tx, [row]);
  return { ...(d as NonNullable<typeof d>), questions: await questionsOf(tx, row.id) };
}

/** Ujian: susunan soal dari bank, pengaturan lembar cetak, dan data untuk dicetak (modul `exams`). */
export async function examRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Semester, mapel, kelas, dan jenis ujian harus milik sekolah ini; mengembalikan nama jenis untuk disalin. */
  async function validateRefs(tx: Tx, b: z.infer<typeof examBody>) {
    const [sem] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.id, b.semesterId));
    if (!sem) throw invalidRef('Semester tidak ditemukan.');
    const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, b.subjectId));
    if (!sub) throw invalidRef('Mata pelajaran tidak ditemukan.');
    const unique = [...new Set(b.classIds)];
    const found = await tx.select({ id: classRoom.id }).from(classRoom).where(inArray(classRoom.id, unique));
    if (found.length !== unique.length) throw invalidRef('Ada kelas yang tidak ditemukan.');
    if (!b.examTypeId) return { typeName: 'Ujian', typeShort: 'Ujian', classIds: unique };
    const [t] = await tx.select().from(examType).where(eq(examType.id, b.examTypeId));
    if (!t) throw invalidRef('Jenis ujian tidak ditemukan.');
    return { typeName: t.name, typeShort: t.shortName, classIds: unique };
  }

  /* ---------- Pengaturan lembar (sekolah) ---------- */

  app.get(
    '/v1/exam/paper-settings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan lembar ujian sekolah',
        description:
          'Izin: `exam:read`; modul `exams`. Kop, judul, blok keterangan, petunjuk umum, dan blok identitas siswa. ' +
          '`custom` false = belum pernah disimpan, nilai bawaan dikembalikan.',
        headers: schoolHeader,
        response: { 200: paperSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [row] = await tx.select().from(examPaperSetting);
        return { config: resolveExamPaper(row?.config), custom: !!row };
      }),
  );

  app.put(
    '/v1/exam/paper-settings',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Simpan pengaturan lembar ujian sekolah',
        description:
          'Izin: `exam:manage`; modul `exams`. Mengganti seluruh pengaturan (400 `validation` bila di luar rentang). ' +
          'Teks boleh memuat penampung seperti `{subject}`, `{class}`, `{dayDate}`, `{time}`.',
        headers: schoolHeader,
        body: examPaperConfigSchema,
        response: { 200: paperSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const values = { config: request.body as Record<string, unknown>, updatedAt: new Date() };
        await tx
          .insert(examPaperSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: examPaperSetting.schoolId, set: values });
        await audit(tx, ctx, 'exam.paper_settings_update', 'school', ctx.schoolId);
        return { config: resolveExamPaper(values.config), custom: true };
      });
    },
  );

  app.delete(
    '/v1/exam/paper-settings',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kembalikan pengaturan lembar ke bawaan',
        description:
          'Izin: `exam:manage`; modul `exams`. Menghapus pengaturan tersimpan; tidak error bila belum ada.',
        headers: schoolHeader,
        response: { 200: paperSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await tx.delete(examPaperSetting).where(eq(examPaperSetting.schoolId, ctx.schoolId));
        await audit(tx, ctx, 'exam.paper_settings_reset', 'school', ctx.schoolId);
        return { config: DEFAULT_EXAM_PAPER, custom: false };
      });
    },
  );

  /* ---------- Ujian ---------- */

  app.get(
    '/v1/exams',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Filter `semesterId`, `subjectId`, `status`. Guru hanya melihat ujian ' +
          'mapel yang ia ampu. Terbaru diubah lebih dulu.',
        headers: schoolHeader,
        querystring: z.object({
          semesterId: z.uuid().optional(),
          subjectId: z.uuid().optional(),
          status: z.enum(['draft', 'ready']).optional(),
        }),
        response: { 200: z.array(examSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { semesterId, subjectId, status } = request.query;
        const scope = await subjectScope(tx, request.ctx as TenantContext);
        if (scope && scope.length === 0) return [];
        const rows = await tx
          .select()
          .from(exam)
          .where(
            and(
              semesterId ? eq(exam.semesterId, semesterId) : undefined,
              subjectId ? eq(exam.subjectId, subjectId) : undefined,
              status ? eq(exam.status, status) : undefined,
              scope ? inArray(exam.subjectId, scope) : undefined,
            ),
          )
          .orderBy(desc(exam.updatedAt));
        return describeExams(tx, rows);
      }),
  );

  app.post(
    '/v1/exams',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Buat ujian',
        description:
          'Izin: `exam:author`; modul `exams`. Guru hanya untuk mapel yang ia ampu (403). Semester, mapel, kelas, ' +
          'dan jenis ujian harus milik sekolah (400 `invalid_reference`). Nama jenis ujian disalin ke ujian.',
        headers: schoolHeader,
        body: examBody,
        response: { 201: detailSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await tenant(request, async (tx) => {
        await guardSubject(tx, ctx, request.body.subjectId);
        const refs = await validateRefs(tx, request.body);
        const { examTypeId, ...rest } = request.body;
        const [row] = await tx
          .insert(exam)
          .values({
            ...rest,
            ...refs,
            examTypeId: examTypeId ?? null,
            examDate: rest.examDate ?? null,
            startTime: rest.startTime ?? null,
            durationMinutes: rest.durationMinutes ?? null,
            schoolId: ctx.schoolId,
            createdBy: ctx.userId,
          })
          .returning();
        await audit(tx, ctx, 'exam.create', 'exam', row!.id, { title: row!.title });
        return detail(tx, row!);
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/v1/exams/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail ujian beserta soalnya',
        description:
          'Izin: `exam:read`; modul `exams`. Soal berurutan menurut `sort`, memuat kunci jawaban. 404 `not_found` ' +
          '(juga bagi guru yang tidak mengampu mapelnya).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: detailSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        detail(tx, await examOrThrow(tx, request.ctx as TenantContext, request.params.id, false)),
      ),
  );

  app.put(
    '/v1/exams/:id',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Ubah ujian',
        description:
          'Izin: `exam:author`; modul `exams`. Validasi seperti saat membuat. Mengganti mapel membuang soal yang ' +
          'sudah dipilih (soal milik mapel lain); nama jenis ujian disalin ulang dari jenis yang dipilih.',
        headers: schoolHeader,
        params: idParams,
        body: examBody,
        response: { 200: detailSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const old = await examOrThrow(tx, ctx, request.params.id, true);
        await guardSubject(tx, ctx, request.body.subjectId);
        const refs = await validateRefs(tx, request.body);
        const { examTypeId, ...rest } = request.body;
        if (old.subjectId !== request.body.subjectId) {
          await tx.delete(examQuestion).where(eq(examQuestion.examId, old.id));
        }
        const [row] = await tx
          .update(exam)
          .set({
            ...rest,
            ...refs,
            examTypeId: examTypeId ?? null,
            examDate: rest.examDate ?? null,
            startTime: rest.startTime ?? null,
            durationMinutes: rest.durationMinutes ?? null,
            updatedAt: new Date(),
          })
          .where(eq(exam.id, old.id))
          .returning();
        await audit(tx, ctx, 'exam.update', 'exam', old.id, { title: row!.title });
        return detail(tx, row!);
      });
    },
  );

  app.delete(
    '/v1/exams/:id',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Hapus ujian',
        description:
          'Izin: `exam:author`; modul `exams`. Soal di dalam ujian ikut terhapus; soal di bank tidak.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const old = await examOrThrow(tx, ctx, request.params.id, true);
        await tx.delete(exam).where(eq(exam.id, old.id));
        await audit(tx, ctx, 'exam.delete', 'exam', old.id, { title: old.title });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Soal di dalam ujian ---------- */

  app.post(
    '/v1/exams/:id/questions',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Tambah soal dari bank ke ujian',
        description:
          'Izin: `exam:author`; modul `exams`. Isi soal disalin (perubahan di bank sesudahnya tidak ikut). Soal ' +
          'harus bermapel sama dengan ujian (400 `invalid_reference`); soal yang sudah ada di ujian dilewati. ' +
          'Ditambahkan di akhir sesuai urutan `questionIds`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ questionIds: z.array(z.uuid()).min(1).max(200) }),
        response: { 200: detailSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const ids = [...new Set(request.body.questionIds)];
        const bank = await tx.select().from(question).where(inArray(question.id, ids));
        if (bank.length !== ids.length || bank.some((q) => q.subjectId !== ex.subjectId)) {
          throw invalidRef('Soal harus ada di bank dan bermapel sama dengan ujian.');
        }
        const have = new Set(
          (await questionsOf(tx, ex.id)).map((q) => q.sourceQuestionId).filter((s): s is string => !!s),
        );
        const byId = new Map(bank.map((q) => [q.id, q]));
        const fresh = ids
          .map((i) => byId.get(i) as NonNullable<ReturnType<typeof byId.get>>)
          .filter((q) => !have.has(q.id));
        if (fresh.length > 0) {
          const [m] = await tx
            .select({ top: max(examQuestion.sort) })
            .from(examQuestion)
            .where(eq(examQuestion.examId, ex.id));
          const base = m?.top ?? 0;
          await tx.insert(examQuestion).values(
            fresh.map((q, i) => ({
              schoolId: ctx.schoolId,
              examId: ex.id,
              sourceQuestionId: q.id,
              sort: base + i + 1,
              type: q.type,
              body: q.body,
              options: q.options,
              answer: q.answer,
              points: q.points,
            })),
          );
        }
        await tx.update(exam).set({ updatedAt: new Date() }).where(eq(exam.id, ex.id));
        await audit(tx, ctx, 'exam.questions_add', 'exam', ex.id, { added: fresh.length });
        return detail(tx, ex);
      });
    },
  );

  app.put(
    '/v1/exams/:id/questions/order',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Atur urutan soal ujian',
        description:
          'Izin: `exam:author`; modul `exams`. `ids` harus memuat semua soal ujian tepat sekali (400 ' +
          '`invalid_reference` bila tidak).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ ids: z.array(z.uuid()).max(500) }),
        response: { 200: detailSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const current = (await questionsOf(tx, ex.id)).map((q) => q.id);
        const wanted = request.body.ids;
        if (
          wanted.length !== current.length ||
          new Set(wanted).size !== wanted.length ||
          !wanted.every((i) => current.includes(i))
        ) {
          throw invalidRef('Daftar urutan harus memuat semua soal ujian tepat sekali.');
        }
        for (const [i, qid] of wanted.entries()) {
          await tx
            .update(examQuestion)
            .set({ sort: i + 1 })
            .where(eq(examQuestion.id, qid));
        }
        return detail(tx, ex);
      });
    },
  );

  app.put(
    '/v1/exams/:id/questions/:questionId',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Ubah poin soal di ujian',
        description: 'Izin: `exam:author`; modul `exams`. Hanya poin; isi soal tetap salinan dari bank.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), questionId: z.uuid() }),
        body: z.object({ points: z.number().int().min(1).max(1000) }),
        response: { 200: detailSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const rows = await tx
          .update(examQuestion)
          .set({ points: request.body.points })
          .where(and(eq(examQuestion.id, request.params.questionId), eq(examQuestion.examId, ex.id)))
          .returning({ id: examQuestion.id });
        if (!rows[0]) throw notFound('Soal');
        return detail(tx, ex);
      });
    },
  );

  app.delete(
    '/v1/exams/:id/questions/:questionId',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Keluarkan soal dari ujian',
        description: 'Izin: `exam:author`; modul `exams`. Soal di bank tidak terhapus.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), questionId: z.uuid() }),
        response: { 200: detailSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const rows = await tx
          .delete(examQuestion)
          .where(and(eq(examQuestion.id, request.params.questionId), eq(examQuestion.examId, ex.id)))
          .returning({ id: examQuestion.id });
        if (!rows[0]) throw notFound('Soal');
        return detail(tx, ex);
      });
    },
  );

  /* ---------- Lembar ujian khusus dan data cetak ---------- */

  app.put(
    '/v1/exams/:id/paper',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Atur lembar khusus untuk satu ujian',
        description:
          'Izin: `exam:author`; modul `exams`. `config` terisi = ujian ini memakai pengaturan lembar sendiri; ' +
          '`null` = kembali mengikuti pengaturan sekolah.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ config: examPaperConfigSchema.nullable() }),
        response: { 200: paperSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const ex = await examOrThrow(tx, ctx, request.params.id, true);
        const [row] = await tx
          .update(exam)
          .set({ paper: request.body.config as Record<string, unknown> | null, updatedAt: new Date() })
          .where(eq(exam.id, ex.id))
          .returning();
        await audit(tx, ctx, 'exam.paper_update', 'exam', ex.id, { custom: !!request.body.config });
        return { config: resolveExamPaper(row!.paper), custom: row!.paper !== null };
      });
    },
  );

  app.get(
    '/v1/exams/:id/print',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Data lengkap untuk mencetak lembar ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Satu panggilan berisi ujian beserta soalnya, identitas sekolah (kop), ' +
          'tahun ajaran, nama guru pengampu, label zona waktu (WIB/WITA/WIT), dan pengaturan lembar yang berlaku ' +
          '(milik ujian bila ada, selain itu milik sekolah, selain itu bawaan).',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            exam: detailSchema,
            school: z.object({
              name: z.string(),
              officialName: z.string().nullable(),
              logoUrl: z.string().nullable(),
              street: z.string().nullable(),
              village: z.string().nullable(),
              district: z.string().nullable(),
              city: z.string().nullable(),
              province: z.string().nullable(),
              postalCode: z.string().nullable(),
              phone: z.string().nullable(),
              fax: z.string().nullable(),
              email: z.string().nullable(),
              website: z.string().nullable(),
            }),
            academicYear: z.string(),
            teacherNames: z.array(z.string()),
            zoneLabel: z.string(),
            config: examPaperConfigSchema,
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await examOrThrow(tx, ctx, request.params.id, false);
        const [sem] = await tx
          .select({ year: academicYear.name })
          .from(semester)
          .innerJoin(academicYear, eq(academicYear.id, semester.academicYearId))
          .where(eq(semester.id, row.semesterId));
        const [sch] = await tx
          .select({ tz: school.timezone })
          .from(school)
          .where(eq(school.id, ctx.schoolId));
        const teachers = row.classIds.length
          ? await tx
              .selectDistinct({ name: teacher.name })
              .from(teachingAssignment)
              .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
              .where(
                and(
                  eq(teachingAssignment.subjectId, row.subjectId),
                  inArray(teachingAssignment.classId, row.classIds),
                ),
              )
              .orderBy(asc(teacher.name))
          : [];
        let config = resolveExamPaper(row.paper);
        if (row.paper === null) {
          const [setting] = await tx.select().from(examPaperSetting);
          config = resolveExamPaper(setting?.config);
        }
        return {
          exam: await detail(tx, row),
          school: await readIdentity(tx, ctx.schoolId),
          academicYear: sem?.year ?? '',
          teacherNames: teachers.map((t) => t.name),
          zoneLabel: ZONE_LABEL[sch?.tz ?? ''] ?? 'WIB',
          config,
        };
      });
    },
  );
}
