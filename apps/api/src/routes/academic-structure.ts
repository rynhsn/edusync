import { RELIGION_VARIANTS, SUBJECT_KINDS } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  enrollment,
  eq,
  isNull,
  program,
  refSubject,
  refSubjectGroup,
  schoolLevel,
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
import { recordHomeroomChange, recordTeachingChange } from '../assignment-history-lib';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { assertClassYearNotClosed } from '../report-lock-lib';
import { assertLevelAllowed } from '../school-lib';
import { audit, conflictAs409, guarded, idParams, isForeignKeyViolation, ok, schoolHeader } from './helpers';

const name = z.string().trim().min(1).max(80);
const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung.');

const programSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  durationYears: z.number().int().nullable().optional(),
  finalLevelCode: z.string().nullable().optional(),
});
const programOut = (r: typeof program.$inferSelect) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  durationYears: r.durationYears,
  finalLevelCode: r.finalLevelCode,
});
const programExtra = {
  durationYears: z
    .union([z.literal(3), z.literal(4)])
    .nullable()
    .optional()
    .describe('Lama program (3 atau 4 tahun)'),
  finalLevelCode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .nullable()
    .optional()
    .describe(
      'Kode tingkat akhir program (harus ada di daftar tingkat sekolah, 400 `invalid_level`); kosong = tingkat dengan sort terbesar. ' +
        'Hanya field inilah yang menentukan tingkat akhir; `durationYears` bersifat informatif.',
    ),
};
const programBody = z.object({ code, name, ...programExtra });
/** Kunci kelompok mapel divalidasi terhadap tabel acuan `ref_subject_group` (400 `invalid_subject_group`), bukan enum kode. */
const subjectGroup = z.string().trim().min(1).max(40);
const subjectKind = z.enum(SUBJECT_KINDS);
const religionVariant = z.enum(RELIGION_VARIANTS);
/** Field metadata bersifat opsional di respons dan permintaan agar klien lama tetap diterima. */
const subjectSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  refSubjectId: z
    .uuid()
    .nullable()
    .optional()
    .describe('Mapel acuan platform asal salinan; null bila buatan sekolah'),
  subjectGroup: subjectGroup.nullable().optional(),
  kind: subjectKind.optional().describe('Jenis mapel; bawaan `compulsory`'),
  religionVariant: religionVariant
    .nullable()
    .optional()
    .describe('Varian pendidikan agama (hanya mapel agama)'),
  isLocalContent: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
const subjectBody = z.object({
  code,
  name,
  refSubjectId: z.uuid().nullable().optional(),
  subjectGroup: subjectGroup.nullable().optional(),
  kind: subjectKind.optional(),
  religionVariant: religionVariant.nullable().optional(),
  isLocalContent: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
const subjectOut = (r: typeof subject.$inferSelect) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  refSubjectId: r.refSubjectId,
  subjectGroup: r.subjectGroup,
  kind: r.kind,
  religionVariant: r.religionVariant,
  isLocalContent: r.isLocalContent,
  sortOrder: r.sortOrder,
  active: r.active,
});

/**
 * Jenis mapel dan penanda muatan lokal harus searah: `kind` = `local_content` berarti `isLocalContent` true.
 * Hanya field yang dikirim yang dihitung; `prev` = nilai tersimpan (PUT), kosong pada POST.
 * - kind `local_content` selalu menghasilkan isLocalContent true (kind menang bila keduanya dikirim dan bertentangan).
 * - isLocalContent true tanpa kind menjadi kind `local_content`.
 * - isLocalContent false tanpa kind: bila sebelumnya `local_content` menjadi `compulsory`.
 * - kind lain tanpa isLocalContent: bila sebelumnya `local_content` isLocalContent menjadi false.
 * Kombinasi kind bukan local_content + isLocalContent true yang sama-sama dikirim diterima apa adanya.
 */
function syncLocalContent(
  body: { kind?: (typeof SUBJECT_KINDS)[number] | undefined; isLocalContent?: boolean | undefined },
  prev?: { kind: string; isLocalContent: boolean },
): { kind?: (typeof SUBJECT_KINDS)[number]; isLocalContent?: boolean } {
  let { kind, isLocalContent } = body;
  if (kind === 'local_content') {
    isLocalContent = true;
  } else if (kind === undefined) {
    if (isLocalContent === true) kind = 'local_content';
    else if (isLocalContent === false && prev?.kind === 'local_content') kind = 'compulsory';
  } else if (isLocalContent === undefined && prev?.kind === 'local_content') {
    isLocalContent = false;
  }
  return {
    ...(kind !== undefined ? { kind } : {}),
    ...(isLocalContent !== undefined ? { isLocalContent } : {}),
  };
}

/** Tingkat akhir program harus kode yang ada di daftar tingkat sekolah (bukan teks bebas). */
async function requireFinalLevel(tx: Tx, code: string | null | undefined) {
  if (!code) return;
  const rows = await tx
    .select({ code: schoolLevel.code })
    .from(schoolLevel)
    .where(eq(schoolLevel.code, code));
  if (rows.length === 0) {
    throw new HttpError(
      400,
      'invalid_level',
      `Tingkat akhir "${code}" tidak ada di daftar tingkat sekolah. Tambahkan di Pengaturan sekolah.`,
    );
  }
}

/** Kelompok mapel harus ada di tabel acuan (kelompok lama yang sudah nonaktif tetap diterima agar data lama bisa disimpan ulang). */
async function requireSubjectGroup(tx: Tx, key: string | null | undefined) {
  if (!key) return;
  const rows = await tx
    .select({ key: refSubjectGroup.key })
    .from(refSubjectGroup)
    .where(eq(refSubjectGroup.key, key));
  if (rows.length === 0) {
    throw new HttpError(400, 'invalid_subject_group', `Kelompok mapel "${key}" tidak dikenal.`);
  }
}

/** Mapel acuan harus ada (tabel acuan global, tidak dijaga RLS). */
async function requireRefSubject(tx: Tx, refSubjectId: string | null | undefined) {
  if (!refSubjectId) return;
  const rows = await tx.select({ id: refSubject.id }).from(refSubject).where(eq(refSubject.id, refSubjectId));
  if (rows.length === 0) throw new HttpError(400, 'invalid_reference', 'Mapel acuan tidak ditemukan.');
}
const classSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  programId: z.uuid().nullable(),
  programName: z.string().nullable(),
  name: z.string(),
  level: z.string(),
  homeroomTeacherId: z.uuid().nullable().describe('Wali kelas (guru), bila ada'),
  homeroomTeacherName: z.string().nullable(),
  studentCount: z.number().int(),
});
const classBody = z.object({
  academicYearId: z.uuid(),
  programId: z.uuid().nullable().default(null),
  name,
  level: z.string().trim().min(1).max(20),
  homeroomTeacherId: z
    .uuid()
    .nullable()
    .optional()
    .describe('Wali kelas; null mengosongkan, tanpa bidang ini wali kelas tidak berubah'),
});
const assignmentSchema = z.object({
  subjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  teacherId: z.uuid(),
  teacherName: z.string(),
});

/**
 * Kunci asing Postgres tidak tunduk pada RLS, jadi rujukan ke baris sekolah lain tidak ditolak database.
 * Pencarian di dalam transaksi tenant hanya melihat baris sekolah sendiri, sehingga rujukan asing tidak ketemu.
 */
async function requireRefs(
  tx: Tx,
  refs: {
    academicYearId?: string;
    programId?: string | null;
    classId?: string;
    subjectId?: string;
    teacherId?: string;
    homeroomTeacherId?: string | null | undefined;
    level?: string;
  },
) {
  const exists = async (rows: Promise<unknown[]>, what: string) => {
    if ((await rows).length === 0) throw new HttpError(400, 'invalid_reference', `${what} tidak ditemukan.`);
  };
  const { academicYearId, programId, classId, subjectId, teacherId, homeroomTeacherId, level } = refs;
  await assertLevelAllowed(tx, level);
  if (academicYearId) {
    await exists(
      tx.select({ id: academicYear.id }).from(academicYear).where(eq(academicYear.id, academicYearId)),
      'Tahun ajaran',
    );
  }
  if (programId) {
    await exists(tx.select({ id: program.id }).from(program).where(eq(program.id, programId)), 'Jurusan');
  }
  if (classId) {
    await exists(tx.select({ id: classRoom.id }).from(classRoom).where(eq(classRoom.id, classId)), 'Kelas');
  }
  if (subjectId) {
    await exists(
      tx.select({ id: subject.id }).from(subject).where(eq(subject.id, subjectId)),
      'Mata pelajaran',
    );
  }
  if (teacherId) {
    await exists(tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, teacherId)), 'Guru');
  }
  if (homeroomTeacherId) {
    await exists(
      tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, homeroomTeacherId)),
      'Wali kelas',
    );
  }
}

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const inUse = (what: string) =>
  new HttpError(409, 'in_use', `${what} masih dipakai dan tidak dapat dihapus.`);

/** Struktur akademik: jurusan, kelas, mata pelajaran, dan penugasan guru per kelas. */
export async function academicStructureRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ---------- Jurusan ---------- */

  app.get(
    '/v1/programs',
    {
      onRequest: [requirePermission('class:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar jurusan',
        description: 'Izin: `class:read`.',
        headers: schoolHeader,
        response: { 200: z.array(programSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        (await tx.select().from(program).orderBy(asc(program.name))).map(programOut),
      ),
  );

  app.post(
    '/v1/programs',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat jurusan',
        description:
          'Izin: `class:manage`. Kode harus unik di sekolah. Opsional: `durationYears` (3 atau 4) dan `finalLevelCode` ' +
          '(tingkat akhir program, mis. XIII untuk SMK 4 tahun; dipakai kenaikan kelas dan rollover; harus kode tingkat sekolah, 400 ' +
          '`invalid_level`). Hanya `finalLevelCode` yang menentukan tingkat akhir; `durationYears` tanpa `finalLevelCode` sah tetapi informatif.',
        headers: schoolHeader,
        body: programBody,
        response: { 201: programSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode jurusan itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireFinalLevel(tx, request.body.finalLevelCode);
          const [r] = await tx
            .insert(program)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(tx, ctx, 'program.create', 'program', r!.id, request.body);
          return r!;
        }),
      );
      return reply.code(201).send(programOut(row));
    },
  );

  app.put(
    '/v1/programs/:id',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Ubah jurusan',
        description:
          'Izin: `class:manage`. Field opsional (`durationYears`, `finalLevelCode`) yang tidak dikirim tidak berubah; null mengosongkan. ' +
          '`finalLevelCode` harus kode tingkat sekolah (400 `invalid_level`) dan satu-satunya penentu tingkat akhir.',
        headers: schoolHeader,
        params: idParams,
        body: programBody,
        response: { 200: programSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode jurusan itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireFinalLevel(tx, request.body.finalLevelCode);
          const [r] = await tx
            .update(program)
            .set(request.body)
            .where(eq(program.id, request.params.id))
            .returning();
          if (!r) throw notFound('Jurusan');
          await audit(tx, ctx, 'program.update', 'program', r.id, request.body);
          return r;
        }),
      );
      return programOut(row);
    },
  );

  app.delete(
    '/v1/programs/:id',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Hapus jurusan',
        description:
          'Izin: `class:manage`. Ditolak 409 `in_use` bila masih dipakai kelas, alokasi JP kurikulum, atau KKTP.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(program)
            .where(eq(program.id, request.params.id))
            .returning({ id: program.id });
          if (rows.length === 0) throw notFound('Jurusan');
          await audit(tx, ctx, 'program.delete', 'program', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Jurusan');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Mata pelajaran ---------- */

  app.get(
    '/v1/subjects',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar mata pelajaran',
        description: 'Izin: `subject:read`.',
        headers: schoolHeader,
        response: { 200: z.array(subjectSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        (await tx.select().from(subject).orderBy(asc(subject.name))).map(subjectOut),
      ),
  );

  app.post(
    '/v1/subjects',
    {
      onRequest: [requirePermission('subject:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat mata pelajaran',
        description:
          'Izin: `subject:manage`. Kode harus unik di sekolah. Metadata opsional: `refSubjectId` (mapel acuan; 400 ' +
          '`invalid_reference` bila tidak ada), `subjectGroup` (kunci `GET /v1/reference/subject-groups`; 400 `invalid_subject_group`), ' +
          '`kind` (compulsory, elective, local_content, project, internship; bawaan compulsory), `religionVariant`, `isLocalContent`, `sortOrder`, `active`. ' +
          '`kind` dan `isLocalContent` disinkronkan server: `kind` local_content menghasilkan `isLocalContent` true; `isLocalContent` true ' +
          'tanpa `kind` menjadikan `kind` local_content.',
        headers: schoolHeader,
        body: subjectBody,
        response: { 201: subjectSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode mata pelajaran itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireRefSubject(tx, request.body.refSubjectId);
          await requireSubjectGroup(tx, request.body.subjectGroup);
          const values = { ...request.body, ...syncLocalContent(request.body) };
          const [r] = await tx
            .insert(subject)
            .values({ schoolId: ctx.schoolId, ...values })
            .returning();
          await audit(tx, ctx, 'subject.create', 'subject', r!.id, values);
          return r!;
        }),
      );
      return reply.code(201).send(subjectOut(row));
    },
  );

  app.put(
    '/v1/subjects/:id',
    {
      onRequest: [requirePermission('subject:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Ubah mata pelajaran',
        description:
          'Izin: `subject:manage`. Hanya field yang dikirim yang diubah; metadata (`refSubjectId`, `subjectGroup`, `kind`, ' +
          '`religionVariant`, `isLocalContent`, `sortOrder`, `active`) yang tidak dikirim tidak berubah, kecuali penyelarasan `kind`/`isLocalContent`: ' +
          '`kind` local_content mengatur `isLocalContent` true; `isLocalContent` true tanpa `kind` mengatur `kind` local_content; ' +
          '`isLocalContent` false tanpa `kind` pada mapel local_content mengatur `kind` compulsory; `kind` lain tanpa `isLocalContent` ' +
          'pada mapel local_content mengatur `isLocalContent` false.',
        headers: schoolHeader,
        params: idParams,
        body: subjectBody,
        response: { 200: subjectSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const row = await conflictAs409('Kode mata pelajaran itu sudah dipakai.', () =>
        tenant(request, async (tx) => {
          await requireRefSubject(tx, request.body.refSubjectId);
          await requireSubjectGroup(tx, request.body.subjectGroup);
          const [prev] = await tx
            .select({ kind: subject.kind, isLocalContent: subject.isLocalContent })
            .from(subject)
            .where(eq(subject.id, request.params.id));
          if (!prev) throw notFound('Mata pelajaran');
          const values = { ...request.body, ...syncLocalContent(request.body, prev) };
          const [r] = await tx
            .update(subject)
            .set(values)
            .where(eq(subject.id, request.params.id))
            .returning();
          if (!r) throw notFound('Mata pelajaran');
          await audit(tx, ctx, 'subject.update', 'subject', r.id, values);
          return r;
        }),
      );
      return subjectOut(row);
    },
  );

  app.delete(
    '/v1/subjects/:id',
    {
      onRequest: [requirePermission('subject:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Hapus mata pelajaran',
        description:
          'Izin: `subject:manage`. Ditolak 409 `in_use` bila sudah ditugaskan ke guru, dipakai alokasi JP kurikulum, CP, ATP, atau KKTP.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(subject)
            .where(eq(subject.id, request.params.id))
            .returning({ id: subject.id });
          if (rows.length === 0) throw notFound('Mata pelajaran');
          await audit(tx, ctx, 'subject.delete', 'subject', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Mata pelajaran');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Kelas ---------- */

  app.get(
    '/v1/classes',
    {
      onRequest: [requirePermission('class:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar kelas',
        description:
          'Izin: `class:read`. Tanpa `academicYearId`, semua tahun ajaran ditampilkan. Memuat wali kelas ' +
          '(`homeroomTeacherId`, `homeroomTeacherName`).',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: { 200: z.array(classSchema), ...guarded },
      },
    },
    async (request) => {
      const { academicYearId } = request.query;
      return tenant(request, async (tx) => {
        const rows = await tx
          .select({
            id: classRoom.id,
            academicYearId: classRoom.academicYearId,
            programId: classRoom.programId,
            programName: program.name,
            name: classRoom.name,
            level: classRoom.level,
            homeroomTeacherId: classRoom.homeroomTeacherId,
            homeroomTeacherName: teacher.name,
          })
          .from(classRoom)
          .leftJoin(program, eq(program.id, classRoom.programId))
          .leftJoin(teacher, eq(teacher.id, classRoom.homeroomTeacherId))
          .where(academicYearId ? eq(classRoom.academicYearId, academicYearId) : undefined)
          .orderBy(asc(classRoom.level), asc(classRoom.name));
        const counts = await tx
          .select({ classId: enrollment.classId, n: count() })
          .from(enrollment)
          .innerJoin(student, and(eq(student.id, enrollment.studentId), isNull(student.deletedAt)))
          .groupBy(enrollment.classId);
        return rows.map((r) => ({ ...r, studentCount: counts.find((c) => c.classId === r.id)?.n ?? 0 }));
      });
    },
  );

  async function classRow(tx: Parameters<Parameters<typeof withTenant>[2]>[0], id: string) {
    const [r] = await tx
      .select({
        id: classRoom.id,
        academicYearId: classRoom.academicYearId,
        programId: classRoom.programId,
        programName: program.name,
        name: classRoom.name,
        level: classRoom.level,
        homeroomTeacherId: classRoom.homeroomTeacherId,
        homeroomTeacherName: teacher.name,
      })
      .from(classRoom)
      .leftJoin(program, eq(program.id, classRoom.programId))
      .leftJoin(teacher, eq(teacher.id, classRoom.homeroomTeacherId))
      .where(eq(classRoom.id, id));
    if (!r) throw notFound('Kelas');
    const [c] = await tx.select({ n: count() }).from(enrollment).where(eq(enrollment.classId, id));
    return { ...r, studentCount: c?.n ?? 0 };
  }

  app.post(
    '/v1/classes',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Buat kelas',
        description:
          'Izin: `class:manage`. Kelas terikat pada satu tahun ajaran; nama harus unik pada tahun ajaran itu. ' +
          'Tahun ajaran, jurusan, dan wali kelas (`homeroomTeacherId`, opsional) harus milik sekolah ini ' +
          '(400 `invalid_reference`). `level` harus ada di daftar tingkat sekolah bila daftar itu terisi (400 `invalid_level`).',
        headers: schoolHeader,
        body: classBody,
        response: { 201: classSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      try {
        const row = await conflictAs409('Nama kelas itu sudah ada pada tahun ajaran ini.', () =>
          tenant(request, async (tx) => {
            await requireRefs(tx, request.body);
            const [r] = await tx
              .insert(classRoom)
              .values({ schoolId: ctx.schoolId, ...request.body })
              .returning();
            await audit(tx, ctx, 'class.create', 'class', r!.id, request.body);
            if (r!.homeroomTeacherId) {
              await recordHomeroomChange(tx, {
                schoolId: ctx.schoolId,
                classId: r!.id,
                teacherId: r!.homeroomTeacherId,
                previousTeacherId: null,
                actorId: ctx.userId,
              });
            }
            return classRow(tx, r!.id);
          }),
        );
        return reply.code(201).send(row);
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new HttpError(
            400,
            'invalid_reference',
            'Tahun ajaran, jurusan, atau wali kelas tidak ditemukan.',
          );
        }
        throw error;
      }
    },
  );

  app.put(
    '/v1/classes/:id',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Ubah kelas',
        description:
          'Izin: `class:manage`. Tahun ajaran kelas tidak dapat dipindah. `homeroomTeacherId` null mengosongkan wali ' +
          'kelas; bila dihilangkan, wali kelas tidak berubah; guru harus milik sekolah ini (400 `invalid_reference`). ' +
          'Pergantian wali kelas dicatat di riwayat dan ditolak 409 `report_final` bila semua semester tahun ajaran ' +
          'kelas itu sudah final.',
        headers: schoolHeader,
        params: idParams,
        body: classBody.omit({ academicYearId: true }),
        response: { 200: classSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        return await conflictAs409('Nama kelas itu sudah ada pada tahun ajaran ini.', () =>
          tenant(request, async (tx) => {
            await requireRefs(tx, request.body);
            const [before] = await tx
              .select({ homeroomTeacherId: classRoom.homeroomTeacherId })
              .from(classRoom)
              .where(eq(classRoom.id, request.params.id));
            const newHomeroom = request.body.homeroomTeacherId ?? null;
            // Dihilangkan = wali kelas tidak berubah; null = dikosongkan.
            const homeroomChanged =
              !!before &&
              request.body.homeroomTeacherId !== undefined &&
              (before.homeroomTeacherId ?? null) !== newHomeroom;
            if (homeroomChanged) await assertClassYearNotClosed(tx, request.params.id);
            const rows = await tx
              .update(classRoom)
              .set(request.body)
              .where(eq(classRoom.id, request.params.id))
              .returning({ id: classRoom.id });
            if (rows.length === 0) throw notFound('Kelas');
            await audit(tx, ctx, 'class.update', 'class', request.params.id, request.body);
            if (homeroomChanged) {
              await recordHomeroomChange(tx, {
                schoolId: ctx.schoolId,
                classId: request.params.id,
                teacherId: newHomeroom,
                previousTeacherId: before?.homeroomTeacherId ?? null,
                actorId: ctx.userId,
              });
            }
            return classRow(tx, request.params.id);
          }),
        );
      } catch (error) {
        if (isForeignKeyViolation(error))
          throw new HttpError(400, 'invalid_reference', 'Jurusan atau wali kelas tidak ditemukan.');
        throw error;
      }
    },
  );

  app.delete(
    '/v1/classes/:id',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Hapus kelas',
        description:
          'Izin: `class:manage`. Ditolak 409 `in_use` bila masih ada siswa, penugasan guru, atau keputusan kenaikan kelas yang merujuk kelas itu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          const rows = await tx
            .delete(classRoom)
            .where(eq(classRoom.id, request.params.id))
            .returning({ id: classRoom.id });
          if (rows.length === 0) throw notFound('Kelas');
          await audit(tx, ctx, 'class.delete', 'class', request.params.id);
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) throw inUse('Kelas');
        throw error;
      }
      return { ok: true as const };
    },
  );

  /* ---------- Penugasan guru per kelas ---------- */

  app.get(
    '/v1/classes/:id/assignments',
    {
      onRequest: [requirePermission('class:read')],
      schema: {
        tags: ['Academic'],
        summary: 'Guru pengampu mata pelajaran di sebuah kelas',
        description: 'Izin: `class:read`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.array(assignmentSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [c] = await tx
          .select({ id: classRoom.id })
          .from(classRoom)
          .where(eq(classRoom.id, request.params.id));
        if (!c) throw notFound('Kelas');
        return tx
          .select({
            subjectId: subject.id,
            subjectCode: subject.code,
            subjectName: subject.name,
            teacherId: teacher.id,
            teacherName: teacher.name,
          })
          .from(teachingAssignment)
          .innerJoin(subject, eq(subject.id, teachingAssignment.subjectId))
          .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
          .where(eq(teachingAssignment.classId, request.params.id))
          .orderBy(asc(subject.name));
      }),
  );

  app.put(
    '/v1/classes/:id/assignments/:subjectId',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Tetapkan guru pengampu mata pelajaran di sebuah kelas',
        description:
          'Izin: `class:manage`. Satu mata pelajaran di satu kelas punya satu guru; menetapkan ulang mengganti gurunya ' +
          'dan dicatat di riwayat penugasan. Ditolak 409 `report_final` bila semua semester tahun ajaran kelas itu ' +
          'sudah final.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), subjectId: z.uuid() }),
        body: z.object({ teacherId: z.uuid() }),
        response: { 200: ok, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      try {
        await tenant(request, async (tx) => {
          await requireRefs(tx, {
            classId: request.params.id,
            subjectId: request.params.subjectId,
            teacherId: request.body.teacherId,
          });
          const [current] = await tx
            .select({ teacherId: teachingAssignment.teacherId })
            .from(teachingAssignment)
            .where(
              and(
                eq(teachingAssignment.classId, request.params.id),
                eq(teachingAssignment.subjectId, request.params.subjectId),
              ),
            );
          const changed = current?.teacherId !== request.body.teacherId;
          if (changed) await assertClassYearNotClosed(tx, request.params.id);
          await tx
            .insert(teachingAssignment)
            .values({
              schoolId: ctx.schoolId,
              classId: request.params.id,
              subjectId: request.params.subjectId,
              teacherId: request.body.teacherId,
            })
            .onConflictDoUpdate({
              target: [teachingAssignment.classId, teachingAssignment.subjectId],
              set: { teacherId: request.body.teacherId },
            });
          await audit(tx, ctx, 'assignment.set', 'class', request.params.id, {
            subjectId: request.params.subjectId,
            teacherId: request.body.teacherId,
          });
          if (changed) {
            await recordTeachingChange(tx, {
              schoolId: ctx.schoolId,
              classId: request.params.id,
              subjectId: request.params.subjectId,
              teacherId: request.body.teacherId,
              previousTeacherId: current?.teacherId ?? null,
              actorId: ctx.userId,
            });
          }
        });
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new HttpError(400, 'invalid_reference', 'Kelas, mata pelajaran, atau guru tidak ditemukan.');
        }
        throw error;
      }
      return { ok: true as const };
    },
  );

  app.delete(
    '/v1/classes/:id/assignments/:subjectId',
    {
      onRequest: [requirePermission('class:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Lepas guru dari mata pelajaran di sebuah kelas',
        description:
          'Izin: `class:manage`. Dicatat di riwayat penugasan. Ditolak 409 `report_final` bila semua semester ' +
          'tahun ajaran kelas itu sudah final.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), subjectId: z.uuid() }),
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [current] = await tx
          .select({ teacherId: teachingAssignment.teacherId })
          .from(teachingAssignment)
          .where(
            and(
              eq(teachingAssignment.classId, request.params.id),
              eq(teachingAssignment.subjectId, request.params.subjectId),
            ),
          );
        if (!current) throw notFound('Penugasan');
        await assertClassYearNotClosed(tx, request.params.id);
        await tx
          .delete(teachingAssignment)
          .where(
            and(
              eq(teachingAssignment.classId, request.params.id),
              eq(teachingAssignment.subjectId, request.params.subjectId),
            ),
          );
        await audit(tx, ctx, 'assignment.remove', 'class', request.params.id, {
          subjectId: request.params.subjectId,
        });
        await recordTeachingChange(tx, {
          schoolId: ctx.schoolId,
          classId: request.params.id,
          subjectId: request.params.subjectId,
          teacherId: null,
          previousTeacherId: current.teacherId,
          actorId: ctx.userId,
        });
      });
      return { ok: true as const };
    },
  );
}
