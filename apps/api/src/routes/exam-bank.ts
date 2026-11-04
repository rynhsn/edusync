import {
  and,
  asc,
  count,
  desc,
  eq,
  examType,
  ilike,
  inArray,
  max,
  question,
  schoolFile,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { guardSubject, subjectScope } from '../exam-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Exams'];
const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_MAGIC = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
} as const;

const readGate = [requirePermission('exam:read'), requireModule('exams')];
const authorGate = [requirePermission('exam:author'), requireModule('exams')];
const manageGate = [requirePermission('exam:manage'), requireModule('exams')];

/** Jenis ujian bawaan; sekolah bebas mengganti namanya (kebijakan penamaan sering berubah). */
const DEFAULT_TYPES = [
  { name: 'Asesmen Sekolah Tengah Semester', shortName: 'ASTS' },
  { name: 'Asesmen Sekolah Akhir Semester', shortName: 'ASAS' },
];

const typeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  shortName: z.string(),
  sort: z.number().int(),
  active: z.boolean(),
});
const typeBody = z.object({
  name: z.string().trim().min(1).max(100),
  shortName: z.string().trim().min(1).max(20),
  sort: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().default(true),
});

const optionSchema = z.object({
  key: z.string().trim().min(1).max(4),
  text: z.string().trim().min(1).max(2000),
});
const questionSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  subjectCode: z.string().nullable(),
  level: z.string().nullable(),
  type: z.enum(['mcq', 'essay']),
  body: z.string(),
  options: z.array(optionSchema),
  answer: z.string().nullable(),
  explanation: z.string().nullable(),
  points: z.number().int(),
  updatedAt: z.string(),
});
const questionBody = z
  .object({
    subjectId: z.uuid(),
    level: z
      .string()
      .trim()
      .max(20)
      .nullish()
      .transform((v) => v || null),
    type: z.enum(['mcq', 'essay']),
    body: z.string().trim().min(1).max(10_000),
    options: z.array(optionSchema).max(6).default([]),
    answer: z
      .string()
      .trim()
      .max(5000)
      .nullish()
      .transform((v) => v || null),
    explanation: z
      .string()
      .trim()
      .max(5000)
      .nullish()
      .transform((v) => v || null),
    points: z.number().int().min(1).max(1000).default(1),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'essay') {
      if (q.options.length > 0)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Esai tidak memakai opsi.' });
      return;
    }
    const keys = q.options.map((o) => o.key.toUpperCase());
    if (q.options.length < 2)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Minimal dua opsi.' });
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Kunci opsi tidak boleh sama.' });
    if (!q.answer || !keys.includes(q.answer.toUpperCase()))
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Kunci jawaban harus salah satu opsi.' });
  });

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

type QuestionRow = typeof question.$inferSelect;
const view = (q: QuestionRow, s: { name: string; code: string | null }) => ({
  id: q.id,
  subjectId: q.subjectId,
  subjectName: s.name,
  subjectCode: s.code,
  level: q.level,
  type: q.type,
  body: q.body,
  options: q.options,
  answer: q.answer,
  explanation: q.explanation,
  points: q.points,
  updatedAt: q.updatedAt.toISOString(),
});

/** Jenis ujian dan bank soal per mata pelajaran (modul `exams`). */
export async function examBankRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function subjectOrThrow(tx: Tx, subjectId: string) {
    const [s] = await tx
      .select({ id: subject.id, name: subject.name, code: subject.code })
      .from(subject)
      .where(eq(subject.id, subjectId));
    if (!s) throw new HttpError(400, 'invalid_reference', 'Mata pelajaran tidak ditemukan.');
    return s;
  }

  /* ---------- Jenis ujian ---------- */

  const listTypes = (tx: Tx) => tx.select().from(examType).orderBy(asc(examType.sort), asc(examType.name));

  app.get(
    '/v1/exam/types',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar jenis ujian',
        description:
          'Izin: `exam:read`; modul `exams`. Urut `sort` lalu nama. Daftar kosong bila belum diatur.',
        headers: schoolHeader,
        response: { 200: z.array(typeSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => listTypes(tx)),
  );

  app.post(
    '/v1/exam/types',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah jenis ujian',
        description: 'Izin: `exam:manage`; modul `exams`. Nama unik per sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: typeBody,
        response: { 201: typeSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama jenis ujian itu sudah ada.', () =>
        tenant(request, async (tx) => {
          let sort = request.body.sort;
          if (sort === undefined) {
            const [m] = await tx.select({ top: max(examType.sort) }).from(examType);
            sort = (m?.top ?? 0) + 10;
          }
          const [r] = await tx
            .insert(examType)
            .values({ ...request.body, sort, schoolId: ctx.schoolId })
            .returning();
          await audit(tx, ctx, 'exam.type_create', 'exam_type', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/v1/exam/types/defaults',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Isi jenis ujian bawaan',
        description:
          'Izin: `exam:manage`; modul `exams`. Menambah ASTS dan ASAS bila belum ada (dicocokkan dari singkatan); ' +
          'mengembalikan daftar lengkap.',
        headers: schoolHeader,
        response: { 200: z.array(typeSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const have = new Set((await listTypes(tx)).map((t) => t.shortName.toLowerCase()));
        const [m] = await tx.select({ top: max(examType.sort) }).from(examType);
        const base = m?.top ?? 0;
        const fresh = DEFAULT_TYPES.filter((t) => !have.has(t.shortName.toLowerCase()));
        if (fresh.length > 0) {
          await tx
            .insert(examType)
            .values(fresh.map((t, i) => ({ ...t, schoolId: ctx.schoolId, sort: base + (i + 1) * 10 })))
            .onConflictDoNothing();
        }
        await audit(tx, ctx, 'exam.type_defaults', 'school', ctx.schoolId, { added: fresh.length });
        return listTypes(tx);
      });
    },
  );

  app.put(
    '/v1/exam/types/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah jenis ujian',
        description:
          'Izin: `exam:manage`; modul `exams`. 404 `not_found`; nama bentrok 409 `conflict`. Mengubah nama tidak ' +
          'mengubah ujian yang sudah dibuat (nama disalin ke ujian saat dibuat).',
        headers: schoolHeader,
        params: idParams,
        body: typeBody,
        response: { 200: typeSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama jenis ujian itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const { sort, ...rest } = request.body;
          const [r] = await tx
            .update(examType)
            .set({ ...rest, ...(sort === undefined ? {} : { sort }) })
            .where(eq(examType.id, request.params.id))
            .returning();
          if (!r) throw notFound('Jenis ujian');
          await audit(tx, ctx, 'exam.type_update', 'exam_type', r.id, request.body);
          return r;
        }),
      );
    },
  );

  app.delete(
    '/v1/exam/types/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus jenis ujian',
        description: 'Izin: `exam:manage`; modul `exams`. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const rows = await tx.delete(examType).where(eq(examType.id, request.params.id)).returning();
        if (!rows[0]) throw notFound('Jenis ujian');
        await audit(tx, ctx, 'exam.type_delete', 'exam_type', rows[0].id, { name: rows[0].name });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Bank soal ---------- */

  app.get(
    '/v1/exam/subjects',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Mata pelajaran untuk bank soal',
        description:
          'Izin: `exam:read`; modul `exams`. Mapel yang boleh dikelola pengguna: semua mapel bagi pengelola ujian ' +
          'dan peran baca-saja; guru hanya mapel yang ia ampu. `questionCount` = jumlah soal di mapel itu.',
        headers: schoolHeader,
        response: {
          200: z.array(
            z.object({
              id: z.uuid(),
              name: z.string(),
              code: z.string().nullable(),
              questionCount: z.number().int(),
            }),
          ),
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const scope = await subjectScope(tx, request.ctx as TenantContext);
        if (scope && scope.length === 0) return [];
        const subjects = await tx
          .select({ id: subject.id, name: subject.name, code: subject.code })
          .from(subject)
          .where(scope ? inArray(subject.id, scope) : undefined)
          .orderBy(asc(subject.name));
        const counts = await tx
          .select({ subjectId: question.subjectId, n: count() })
          .from(question)
          .groupBy(question.subjectId);
        const byId = new Map(counts.map((c) => [c.subjectId, c.n]));
        return subjects.map((s) => ({
          ...s,
          questionCount: byId.get(s.id) ?? 0,
        }));
      }),
  );

  app.get(
    '/v1/exam/questions',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar soal',
        description:
          'Izin: `exam:read`; modul `exams`. Filter `subjectId`, `type`, `level`, dan `q` (cari di teks soal). Guru ' +
          'hanya melihat soal mapel yang ia ampu. Terbaru diubah lebih dulu; `limit` bawaan 50 (maks 200).',
        headers: schoolHeader,
        querystring: z.object({
          subjectId: z.uuid().optional(),
          type: z.enum(['mcq', 'essay']).optional(),
          level: z.string().trim().max(20).optional(),
          q: z.string().trim().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(questionSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { subjectId, type, level, q, limit, offset } = request.query;
        const scope = await subjectScope(tx, request.ctx as TenantContext);
        if (scope && scope.length === 0) return { items: [], total: 0 };
        const conds = [
          subjectId ? eq(question.subjectId, subjectId) : undefined,
          type ? eq(question.type, type) : undefined,
          level ? eq(question.level, level) : undefined,
          q ? ilike(question.body, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
          scope ? inArray(question.subjectId, scope) : undefined,
        ];
        const where = and(...conds);
        const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(question).where(where);
        const rows = await tx
          .select({ q: question, name: subject.name, code: subject.code })
          .from(question)
          .innerJoin(subject, eq(subject.id, question.subjectId))
          .where(where)
          .orderBy(desc(question.updatedAt))
          .limit(limit)
          .offset(offset);
        return { items: rows.map((r) => view(r.q, r)), total };
      }),
  );

  app.post(
    '/v1/exam/questions',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Tambah soal',
        description:
          'Izin: `exam:author`; modul `exams`. Guru hanya untuk mapel yang ia ampu (403). Pilihan ganda: 2-6 opsi ' +
          'berkunci unik dan `answer` = salah satu kunci. Esai: tanpa opsi; `answer` = pedoman jawaban. Teks boleh ' +
          'memuat rumus `$...$`/`$$...$$` dan gambar yang diunggah lewat `/v1/exam/images`.',
        headers: schoolHeader,
        body: questionBody,
        response: { 201: questionSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await tenant(request, async (tx) => {
        await guardSubject(tx, ctx, request.body.subjectId);
        const s = await subjectOrThrow(tx, request.body.subjectId);
        const [r] = await tx
          .insert(question)
          .values({ ...request.body, schoolId: ctx.schoolId, createdBy: ctx.userId })
          .returning();
        await audit(tx, ctx, 'exam.question_create', 'question', r!.id, { subjectId: s.id, type: r!.type });
        return view(r!, s);
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/exam/questions/:id',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Ubah soal',
        description: 'Izin: `exam:author`; modul `exams`. Validasi seperti saat menambah; 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: questionBody,
        response: { 200: questionSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [old] = await tx.select().from(question).where(eq(question.id, request.params.id));
        if (!old) throw notFound('Soal');
        await guardSubject(tx, ctx, old.subjectId);
        await guardSubject(tx, ctx, request.body.subjectId);
        const s = await subjectOrThrow(tx, request.body.subjectId);
        const [r] = await tx
          .update(question)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(question.id, old.id))
          .returning();
        await audit(tx, ctx, 'exam.question_update', 'question', old.id, { subjectId: s.id });
        return view(r!, s);
      });
    },
  );

  app.delete(
    '/v1/exam/questions/:id',
    {
      onRequest: authorGate,
      schema: {
        tags: tag,
        summary: 'Hapus soal',
        description:
          'Izin: `exam:author`; modul `exams`. Guru hanya untuk mapel yang ia ampu. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [old] = await tx.select().from(question).where(eq(question.id, request.params.id));
        if (!old) throw notFound('Soal');
        await guardSubject(tx, ctx, old.subjectId);
        await tx.delete(question).where(eq(question.id, old.id));
        await audit(tx, ctx, 'exam.question_delete', 'question', old.id, { subjectId: old.subjectId });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Gambar soal ---------- */

  app.post(
    '/v1/exam/images',
    {
      onRequest: authorGate,
      bodyLimit: 2 * 1024 * 1024,
      schema: {
        tags: tag,
        summary: 'Unggah gambar soal',
        description:
          'Izin: `exam:author`; modul `exams`. PNG, JPEG, atau WebP sampai 1 MB, dikirim sebagai base64 di `data` ' +
          '(tanpa awalan `data:`); isi berkas diperiksa terhadap `mime` (400 `validation`). `url` dipakai di teks soal ' +
          'sebagai `![](url)`. Berkas yang tidak lagi dirujuk soal tidak dibersihkan otomatis.',
        headers: schoolHeader,
        body: z.object({
          mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          data: z.string().min(1).max(1_500_000),
        }),
        response: { 201: z.object({ id: z.uuid(), url: z.string() }), 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const bytes = Buffer.from(request.body.data, 'base64');
      const magic = IMAGE_MAGIC[request.body.mime];
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !magic.every((b, i) => bytes[i] === b)) {
        throw new HttpError(400, 'validation', 'Gambar harus PNG, JPEG, atau WebP berukuran maksimal 1 MB.');
      }
      const file = await tenant(request, async (tx) => {
        const [f] = await tx
          .insert(schoolFile)
          .values({
            schoolId: ctx.schoolId,
            kind: 'question_image',
            mime: request.body.mime,
            size: bytes.length,
            data: bytes,
          })
          .returning({ id: schoolFile.id });
        return f!;
      });
      return reply.code(201).send({ id: file.id, url: `/v1/public/school-files/${file.id}` });
    },
  );
}
