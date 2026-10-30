import {
  and,
  asc,
  assessment,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  gradeComponent,
  gradingSetting,
  inArray,
  isNull,
  score,
  semester,
  sql,
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
import { computeGrades, loadComponents, loadSettings, round2 } from '../grading-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Grading'];
const MODULE = 'grades';

const readGate = [requirePermission('grade:read'), requireModule(MODULE)];
const inputGate = [requirePermission('grade:input'), requireModule(MODULE)];
const configureGate = [requirePermission('grade:configure'), requireModule(MODULE)];

/** Peran yang melihat nilai semua kelas dan mapel (bersama pemegang `grade:configure`). */
const WIDE_ROLES = ['principal', 'curriculum'];

const DEFAULT_COMPONENTS = [
  { name: 'Tugas', weight: 20 },
  { name: 'Ulangan Harian', weight: 30 },
  { name: 'UTS', weight: 20 },
  { name: 'UAS', weight: 30 },
] as const;

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const settingsSchema = z.object({
  kkm: z
    .number()
    .int()
    .describe('Kriteria ketuntasan minimal; nilai akhir di bawahnya ditandai belum tuntas'),
  predicateA: z.number().int().describe('Nilai minimal predikat A'),
  predicateB: z.number().int().describe('Nilai minimal predikat B'),
  predicateC: z.number().int().describe('Nilai minimal predikat C; di bawahnya predikat D'),
});

const settingsBody = z
  .object({
    kkm: z.number().int().min(1).max(100),
    predicateA: z.number().int().min(1).max(100),
    predicateB: z.number().int().min(1).max(100),
    predicateC: z.number().int().min(1).max(100),
  })
  .refine((b) => b.predicateA > b.predicateB && b.predicateB > b.predicateC && b.predicateC > 0, {
    message: 'Batas predikat harus berurutan: A > B > C > 0.',
    path: ['predicateA'],
  });

const componentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  weight: z.number().int(),
  sort: z.number().int(),
  assessmentCount: z.number().int().describe('Jumlah penilaian yang memakai komponen ini'),
});

const componentBody = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.number().int().min(1).max(100),
  sort: z.number().int().min(0).max(1000).optional(),
});

const assessmentSchema = z.object({
  id: z.uuid(),
  semesterId: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  componentId: z.uuid(),
  componentName: z.string(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  title: z.string(),
  date: z.string(),
  maxScore: z.number().int(),
  filled: z.number().int().describe('Jumlah siswa aktif kelas yang sudah punya skor'),
  total: z.number().int().describe('Jumlah siswa aktif di kelas'),
  canInput: z.boolean().describe('Pengguna ini boleh mengubah penilaian dan skornya'),
});

const assessmentBody = z.object({
  semesterId: z.uuid(),
  classId: z.uuid(),
  subjectId: z.uuid(),
  componentId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  date: z.iso.date(),
  maxScore: z.number().int().min(1).max(1000).default(100),
});

const assessmentUpdateBody = assessmentBody.pick({
  componentId: true,
  title: true,
  date: true,
  maxScore: true,
});

const scopeQuery = z.object({ semesterId: z.uuid(), classId: z.uuid(), subjectId: z.uuid() });

const predicateEnum = z.enum(['A', 'B', 'C', 'D']);

/** Penilaian: pengaturan KKM/predikat, komponen berbobot, penilaian per kelas+mapel, skor, dan rekap. Modul `grades`. */
export async function gradingRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Otorisasi ---------- */

  /** Pemegang `grade:configure`, kepala sekolah, dan kurikulum melihat semua kelas dan mapel. */
  const isWide = (ctx: TenantContext) =>
    ctx.permissions.has('grade:configure') || ctx.roles.some((r) => WIDE_ROLES.includes(r));

  /** Pasangan (kelas, mapel) yang diampu pengguna ini (guru dengan `teacher.memberId` = anggota ini). */
  function myAssignments(tx: Tx, ctx: TenantContext) {
    return tx
      .select({ classId: teachingAssignment.classId, subjectId: teachingAssignment.subjectId })
      .from(teachingAssignment)
      .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
      .where(eq(teacher.memberId, ctx.memberId));
  }

  type Assignment = Awaited<ReturnType<typeof myAssignments>>[number];
  const teaches = (mine: Assignment[], classId: string, subjectId: string) =>
    mine.some((a) => a.classId === classId && a.subjectId === subjectId);

  /** Boleh membaca nilai kelas+mapel itu. */
  async function canReadPair(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
    if (isWide(ctx)) return true;
    return teaches(await myAssignments(tx, ctx), classId, subjectId);
  }

  /** Boleh mengelola penilaian dan skor kelas+mapel itu: pemegang configure, atau guru pengampu dengan `grade:input`. */
  async function canInputPair(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
    if (ctx.permissions.has('grade:configure')) return true;
    if (!ctx.permissions.has('grade:input')) return false;
    return teaches(await myAssignments(tx, ctx), classId, subjectId);
  }

  async function myTeacherId(tx: Tx, ctx: TenantContext) {
    const [mine] = await tx
      .select({ id: teacher.id })
      .from(teacher)
      .where(eq(teacher.memberId, ctx.memberId));
    return mine?.id ?? null;
  }

  const notAllowed = () =>
    forbidden('Anda hanya boleh mengakses penilaian untuk kelas dan mata pelajaran yang Anda ampu.');

  /* ---------- Rujukan ---------- */

  async function requireComponent(tx: Tx, componentId: string) {
    const [c] = await tx
      .select({ id: gradeComponent.id })
      .from(gradeComponent)
      .where(eq(gradeComponent.id, componentId));
    if (!c) throw invalidRef('Komponen penilaian tidak ditemukan.');
  }

  /** Rujukan ke baris sekolah lain tidak ditolak FK; pencarian di transaksi tenant hanya melihat sekolah ini. */
  async function requireRefs(
    tx: Tx,
    refs: { semesterId: string; classId: string; subjectId: string; componentId: string },
  ) {
    const [sem] = await tx.select().from(semester).where(eq(semester.id, refs.semesterId));
    if (!sem) throw invalidRef('Semester tidak ditemukan.');
    const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, refs.classId));
    if (!cls) throw invalidRef('Kelas tidak ditemukan.');
    if (cls.academicYearId !== sem.academicYearId) {
      throw invalidRef('Semester dan kelas harus berada pada tahun ajaran yang sama.');
    }
    const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, refs.subjectId));
    if (!sub) throw invalidRef('Mata pelajaran tidak ditemukan.');
    await requireComponent(tx, refs.componentId);
  }

  async function loadAssessment(tx: Tx, id: string) {
    const [a] = await tx.select().from(assessment).where(eq(assessment.id, id));
    if (!a) throw notFound('Penilaian');
    return a;
  }

  /* ---------- Tampilan penilaian ---------- */

  async function assessmentViews(
    tx: Tx,
    ctx: TenantContext,
    filter: {
      id?: string;
      semesterId?: string | undefined;
      classId?: string | undefined;
      subjectId?: string | undefined;
    },
  ) {
    const conds = [
      filter.id ? eq(assessment.id, filter.id) : undefined,
      filter.semesterId ? eq(assessment.semesterId, filter.semesterId) : undefined,
      filter.classId ? eq(assessment.classId, filter.classId) : undefined,
      filter.subjectId ? eq(assessment.subjectId, filter.subjectId) : undefined,
    ].filter((c) => c !== undefined);
    const rows = await tx
      .select({
        a: assessment,
        className: classRoom.name,
        subjectName: subject.name,
        componentName: gradeComponent.name,
        teacherName: teacher.name,
      })
      .from(assessment)
      .innerJoin(classRoom, eq(classRoom.id, assessment.classId))
      .innerJoin(subject, eq(subject.id, assessment.subjectId))
      .innerJoin(gradeComponent, eq(gradeComponent.id, assessment.componentId))
      .leftJoin(teacher, eq(teacher.id, assessment.teacherId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(assessment.date), asc(assessment.title));

    const wide = isWide(ctx);
    const mine = await myAssignments(tx, ctx);
    const visible = rows.filter((r) => wide || teaches(mine, r.a.classId, r.a.subjectId));
    if (visible.length === 0) return [];

    const classIds = [...new Set(visible.map((r) => r.a.classId))];
    const totals = await tx
      .select({ classId: enrollment.classId, n: count() })
      .from(enrollment)
      .innerJoin(student, eq(student.id, enrollment.studentId))
      .where(
        and(inArray(enrollment.classId, classIds), isNull(student.deletedAt), eq(student.status, 'active')),
      )
      .groupBy(enrollment.classId);
    const filled = await tx
      .select({ assessmentId: score.assessmentId, n: count() })
      .from(score)
      .innerJoin(assessment, eq(assessment.id, score.assessmentId))
      .innerJoin(
        enrollment,
        and(eq(enrollment.studentId, score.studentId), eq(enrollment.classId, assessment.classId)),
      )
      .innerJoin(student, eq(student.id, score.studentId))
      .where(
        and(
          inArray(
            score.assessmentId,
            visible.map((r) => r.a.id),
          ),
          sql`${score.value} is not null`,
          isNull(student.deletedAt),
          eq(student.status, 'active'),
        ),
      )
      .groupBy(score.assessmentId);

    const configure = ctx.permissions.has('grade:configure');
    const input = ctx.permissions.has('grade:input');
    return visible.map((r) => ({
      id: r.a.id,
      semesterId: r.a.semesterId,
      classId: r.a.classId,
      className: r.className,
      subjectId: r.a.subjectId,
      subjectName: r.subjectName,
      componentId: r.a.componentId,
      componentName: r.componentName,
      teacherId: r.a.teacherId,
      teacherName: r.teacherName,
      title: r.a.title,
      date: r.a.date,
      maxScore: r.a.maxScore,
      filled: filled.find((f) => f.assessmentId === r.a.id)?.n ?? 0,
      total: totals.find((t) => t.classId === r.a.classId)?.n ?? 0,
      canInput: configure || (input && teaches(mine, r.a.classId, r.a.subjectId)),
    }));
  }

  /* ---------- Pengaturan ---------- */

  app.get(
    '/v1/grading/settings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan penilaian',
        description:
          'Izin: `grade:read`; modul `grades`. KKM dan batas predikat A/B/C. Sekolah yang belum mengaturnya ' +
          'mendapat nilai bawaan (KKM 75; A 90, B 80, C 70).',
        headers: schoolHeader,
        response: { 200: settingsSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => loadSettings(tx)),
  );

  app.put(
    '/v1/grading/settings',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan penilaian',
        description:
          'Izin: `grade:configure`; modul `grades`. `kkm` 1..100; batas predikat harus berurutan `predicateA` > ' +
          '`predicateB` > `predicateC` > 0 (selain itu 400 galat validasi).',
        headers: schoolHeader,
        body: settingsBody,
        response: { 200: settingsSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await tx
          .insert(gradingSetting)
          .values({ schoolId: ctx.schoolId, ...request.body })
          .onConflictDoUpdate({
            target: gradingSetting.schoolId,
            set: { ...request.body, updatedAt: new Date() },
          });
        await audit(tx, ctx, 'grading.settings_update', 'grading_setting', ctx.schoolId, request.body);
        return loadSettings(tx);
      });
    },
  );

  /* ---------- Komponen ---------- */

  async function componentViews(tx: Tx) {
    const rows = await loadComponents(tx);
    const counts = await tx
      .select({ id: assessment.componentId, n: count() })
      .from(assessment)
      .groupBy(assessment.componentId);
    return rows.map((c) => ({ ...c, assessmentCount: counts.find((x) => x.id === c.id)?.n ?? 0 }));
  }

  app.get(
    '/v1/grading/components',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar komponen penilaian',
        description:
          'Izin: `grade:read`; modul `grades`. Komponen berbobot (mis. Tugas, UTS), urut `sort` lalu nama. ' +
          '`assessmentCount` = jumlah penilaian yang memakainya.',
        headers: schoolHeader,
        response: { 200: z.array(componentSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => componentViews(tx)),
  );

  app.post(
    '/v1/grading/components',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Tambah komponen penilaian',
        description:
          'Izin: `grade:configure`; modul `grades`. Nama unik di sekolah (409 `conflict`). `weight` 1..100; bobot ' +
          'tidak harus berjumlah 100 karena dinormalisasi saat nilai akhir dihitung. `sort` bawaan: paling akhir.',
        headers: schoolHeader,
        body: componentBody,
        response: { 201: componentSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama komponen itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const existing = await loadComponents(tx);
          const sort = request.body.sort ?? Math.max(-1, ...existing.map((c) => c.sort)) + 1;
          const [row] = await tx
            .insert(gradeComponent)
            .values({ schoolId: ctx.schoolId, name: request.body.name, weight: request.body.weight, sort })
            .returning({ id: gradeComponent.id });
          await audit(tx, ctx, 'grading.component_create', 'grade_component', row!.id, {
            name: request.body.name,
            weight: request.body.weight,
          });
          return (await componentViews(tx)).find((c) => c.id === row!.id)!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/grading/components/:id',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Ubah komponen penilaian',
        description:
          'Izin: `grade:configure`; modul `grades`. Nama unik (409 `conflict`); 404 `not_found` bila tak ada. ' +
          'Mengubah bobot langsung memengaruhi nilai akhir semua penilaian yang ada.',
        headers: schoolHeader,
        params: idParams,
        body: componentBody,
        response: { 200: componentSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama komponen itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [current] = await tx
            .select()
            .from(gradeComponent)
            .where(eq(gradeComponent.id, request.params.id));
          if (!current) throw notFound('Komponen');
          await tx
            .update(gradeComponent)
            .set({
              name: request.body.name,
              weight: request.body.weight,
              sort: request.body.sort ?? current.sort,
            })
            .where(eq(gradeComponent.id, request.params.id));
          await audit(tx, ctx, 'grading.component_update', 'grade_component', request.params.id, {
            name: request.body.name,
            weight: request.body.weight,
          });
          return (await componentViews(tx)).find((c) => c.id === request.params.id)!;
        }),
      );
    },
  );

  app.delete(
    '/v1/grading/components/:id',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Hapus komponen penilaian',
        description:
          'Izin: `grade:configure`; modul `grades`. Ditolak 409 `in_use` bila sudah dipakai penilaian; 404 ' +
          '`not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        const [current] = await tx.select().from(gradeComponent).where(eq(gradeComponent.id, id));
        if (!current) throw notFound('Komponen');
        const [used] = await tx.select({ n: count() }).from(assessment).where(eq(assessment.componentId, id));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Komponen ini sudah dipakai penilaian; ubah saja bobotnya.');
        }
        await tx.delete(gradeComponent).where(eq(gradeComponent.id, id));
        await audit(tx, ctx, 'grading.component_delete', 'grade_component', id, { name: current.name });
        return { ok: true as const };
      });
    },
  );

  app.post(
    '/v1/grading/components/defaults',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Pasang komponen bawaan',
        description:
          'Izin: `grade:configure`; modul `grades`. Membuat Tugas (20), Ulangan Harian (30), UTS (20), dan UAS (30) ' +
          'hanya bila sekolah belum punya komponen; selain itu 409 `not_empty`.',
        headers: schoolHeader,
        response: { 201: z.array(componentSchema), 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await tenant(request, async (tx) => {
        if ((await loadComponents(tx)).length > 0) {
          throw new HttpError(409, 'not_empty', 'Sekolah sudah punya komponen penilaian.');
        }
        await tx.insert(gradeComponent).values(
          DEFAULT_COMPONENTS.map((c, i) => ({
            schoolId: ctx.schoolId,
            name: c.name,
            weight: c.weight,
            sort: i,
          })),
        );
        await audit(tx, ctx, 'grading.components_defaults', 'grade_component', ctx.schoolId);
        return componentViews(tx);
      });
      return reply.code(201).send(created);
    },
  );

  /* ---------- Penilaian ---------- */

  app.get(
    '/v1/grading/my-assignments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pasangan kelas dan mapel yang boleh dilihat pengguna',
        description:
          'Izin: `grade:read`; modul `grades`. `all: true` untuk pemegang `grade:configure`, kepala sekolah, dan ' +
          'kurikulum (semua kelas dan mapel; `items` kosong). Pengguna lain mendapat pasangan (kelas, mapel) yang ia ' +
          'ampu, dipakai web untuk menyaring pilihan mapel.',
        headers: schoolHeader,
        response: {
          200: z.object({
            all: z.boolean(),
            items: z.array(z.object({ classId: z.uuid(), subjectId: z.uuid() })),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      if (isWide(ctx)) return { all: true, items: [] };
      return tenant(request, async (tx) => ({ all: false, items: await myAssignments(tx, ctx) }));
    },
  );

  app.get(
    '/v1/assessments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar penilaian',
        description:
          'Izin: `grade:read`; modul `grades`. Filter `semesterId`, `classId`, `subjectId` (opsional), terbaru lebih ' +
          'dulu. Pemegang `grade:configure`, kepala sekolah, dan kurikulum melihat semuanya; pengguna lain hanya ' +
          'penilaian untuk pasangan (kelas, mapel) yang ia ampu (daftar kosong bila tidak mengampu). `filled`/`total` ' +
          'menghitung siswa aktif kelas.',
        headers: schoolHeader,
        querystring: z.object({
          semesterId: z.uuid().optional(),
          classId: z.uuid().optional(),
          subjectId: z.uuid().optional(),
        }),
        response: { 200: z.array(assessmentSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) => assessmentViews(tx, request.ctx as TenantContext, request.query)),
  );

  app.post(
    '/v1/assessments',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Buat penilaian',
        description:
          'Izin: `grade:input`; modul `grades`. Boleh bagi pemegang `grade:configure` atau guru yang mengampu ' +
          'kelas dan mapel itu (selain itu 403). Semester, kelas, mapel, dan komponen harus milik sekolah ini dan ' +
          'semester sama tahun ajarannya dengan kelas (400 `invalid_reference`). `maxScore` 1..1000 (bawaan 100).',
        headers: schoolHeader,
        body: assessmentBody,
        response: { 201: assessmentSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const created = await tenant(request, async (tx) => {
        await requireRefs(tx, b);
        if (!(await canInputPair(tx, ctx, b.classId, b.subjectId))) throw notAllowed();
        // Pengampu pasangan itu bila ada; selain itu pembuatnya bila ia guru.
        const [assigned] = await tx
          .select({ teacherId: teachingAssignment.teacherId })
          .from(teachingAssignment)
          .where(
            and(eq(teachingAssignment.classId, b.classId), eq(teachingAssignment.subjectId, b.subjectId)),
          );
        const teacherId = assigned?.teacherId ?? (await myTeacherId(tx, ctx));
        const [row] = await tx
          .insert(assessment)
          .values({ schoolId: ctx.schoolId, ...b, teacherId })
          .returning({ id: assessment.id });
        await audit(tx, ctx, 'assessment.create', 'assessment', row!.id, {
          title: b.title,
          classId: b.classId,
          subjectId: b.subjectId,
        });
        return (await assessmentViews(tx, ctx, { id: row!.id }))[0]!;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/assessments/:id',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Ubah penilaian',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel penilaian itu (selain ' +
          'itu 403). Yang bisa diubah: komponen, judul, tanggal, skor maksimum. Skor maksimum tidak boleh di bawah ' +
          'skor yang sudah diisi (409 `score_exceeds_max`). Komponen harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        params: idParams,
        body: assessmentUpdateBody,
        response: { 200: assessmentSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await requireComponent(tx, b.componentId);
        const [over] = await tx
          .select({ n: count() })
          .from(score)
          .where(and(eq(score.assessmentId, current.id), sql`${score.value} > ${b.maxScore}`));
        if ((over?.n ?? 0) > 0) {
          throw new HttpError(409, 'score_exceeds_max', 'Ada skor yang lebih besar dari skor maksimum baru.');
        }
        await tx.update(assessment).set(b).where(eq(assessment.id, current.id));
        await audit(tx, ctx, 'assessment.update', 'assessment', current.id, { title: b.title });
        return (await assessmentViews(tx, ctx, { id: current.id }))[0]!;
      });
    },
  );

  app.delete(
    '/v1/assessments/:id',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Hapus penilaian',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel penilaian itu (selain ' +
          'itu 403). Seluruh skor penilaian itu ikut terhapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await tx.delete(score).where(eq(score.assessmentId, current.id));
        await tx.delete(assessment).where(eq(assessment.id, current.id));
        await audit(tx, ctx, 'assessment.delete', 'assessment', current.id, { title: current.title });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Skor ---------- */

  app.get(
    '/v1/assessments/:id/scores',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Skor satu penilaian',
        description:
          'Izin: `grade:read`; modul `grades`. Roster siswa aktif kelas penilaian (urut nama) dengan skor ' +
          '(`value` null bila belum diisi). Pengguna selain pemegang configure/kepala sekolah/kurikulum hanya boleh ' +
          'untuk kelas+mapel yang ia ampu (403). `canInput` menandai hak mengisi.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            assessment: assessmentSchema,
            canInput: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                value: z.number().nullable(),
                note: z.string().nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canReadPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        const view = (await assessmentViews(tx, ctx, { id: current.id }))[0]!;
        const { rows } = await rosterOf(tx, current.classId);
        const scores = await tx.select().from(score).where(eq(score.assessmentId, current.id));
        return {
          assessment: view,
          canInput: view.canInput,
          students: rows.map((s) => {
            const sc = scores.find((x) => x.studentId === s.id);
            return {
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              value: sc?.value ?? null,
              note: sc?.note ?? null,
            };
          }),
        };
      });
    },
  );

  app.put(
    '/v1/assessments/:id/scores',
    {
      onRequest: inputGate,
      schema: {
        tags: tag,
        summary: 'Simpan skor',
        description:
          'Izin: `grade:input`, dan pemegang `grade:configure` atau guru pengampu kelas+mapel (selain itu 403). ' +
          '`value` 0..skor maksimum penilaian (400 `invalid_score`) atau null untuk mengosongkan; siswa harus anggota ' +
          'aktif kelas (400 `invalid_reference`). Mengirim ulang siswa yang sama menimpa skor sebelumnya.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          records: z
            .array(
              z.object({
                studentId: z.uuid(),
                value: z.number().min(0).max(1000).nullable(),
                note: z.string().trim().max(200).nullable().default(null),
              }),
            )
            .min(1)
            .max(500),
        }),
        response: {
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        const { rows } = await rosterOf(tx, current.classId);
        const allowed = new Set(rows.map((s) => s.id));
        // Siswa yang dikirim dua kali: yang terakhir berlaku.
        const records = [...new Map(request.body.records.map((r) => [r.studentId, r])).values()];
        if (records.some((r) => !allowed.has(r.studentId))) {
          throw invalidRef('Ada siswa yang bukan anggota aktif kelas penilaian ini.');
        }
        if (records.some((r) => r.value !== null && r.value > current.maxScore)) {
          throw new HttpError(400, 'invalid_score', `Skor harus antara 0 dan ${current.maxScore}.`);
        }
        for (const r of records) {
          await tx
            .insert(score)
            .values({
              schoolId: ctx.schoolId,
              assessmentId: current.id,
              studentId: r.studentId,
              value: r.value,
              note: r.note,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: [score.assessmentId, score.studentId],
              set: { value: r.value, note: r.note, updatedBy: ctx.userId, updatedAt: new Date() },
            });
        }
        await audit(tx, ctx, 'score.save', 'assessment', current.id, { count: records.length });
        return { saved: records.length };
      });
    },
  );

  /* ---------- Rekap ---------- */

  app.get(
    '/v1/grading/recap',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rekap nilai kelas dan mapel',
        description:
          'Izin: `grade:read`; modul `grades`. Per siswa aktif: rata-rata persen tiap komponen, nilai akhir ' +
          '(rata-rata tertimbang; bobot dinormalisasi atas komponen yang punya skor), predikat, dan `belowKkm`. ' +
          '`stats` merangkum siswa yang sudah punya nilai akhir. Semester/kelas/mapel harus milik sekolah ini ' +
          '(400 `invalid_reference`); pengguna selain pemegang configure/kepala sekolah/kurikulum hanya untuk ' +
          'kelas+mapel yang ia ampu (403).',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: {
          200: z.object({
            settings: settingsSchema,
            components: z.array(z.object({ id: z.uuid(), name: z.string(), weight: z.number().int() })),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                perComponent: z.array(z.object({ componentId: z.uuid(), average: z.number().nullable() })),
                final: z.number().nullable(),
                predicate: predicateEnum.nullable(),
                belowKkm: z.boolean(),
              }),
            ),
            stats: z.object({
              average: z.number().nullable(),
              min: z.number().nullable(),
              max: z.number().nullable(),
              belowKkmCount: z.number().int(),
              filled: z.number().int().describe('Jumlah siswa yang sudah punya nilai akhir'),
            }),
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
        const [sem] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.id, semesterId));
        if (!sem) throw invalidRef('Semester tidak ditemukan.');
        const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, subjectId));
        if (!sub) throw invalidRef('Mata pelajaran tidak ditemukan.');
        const [cls] = await tx.select({ id: classRoom.id }).from(classRoom).where(eq(classRoom.id, classId));
        if (!cls) throw invalidRef('Kelas tidak ditemukan.');
        if (!(await canReadPair(tx, ctx, classId, subjectId))) throw notAllowed();

        const settings = await loadSettings(tx);
        const components = await loadComponents(tx);
        const { rows } = await rosterOf(tx, classId);
        const grades = await computeGrades(tx, {
          semesterId,
          classId,
          subjectIds: [subjectId],
          studentIds: rows.map((s) => s.id),
          components,
          settings,
        });
        const bySubject = grades.get(subjectId)!;
        const students = rows.map((s) => {
          const g = bySubject.get(s.id)!;
          return {
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            perComponent: g.perComponent,
            final: g.final,
            predicate: g.predicate,
            belowKkm: g.final !== null && g.final < settings.kkm,
          };
        });
        const finals = students.flatMap((s) => (s.final === null ? [] : [s.final]));
        return {
          settings,
          components: components.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
          students,
          stats: {
            average: finals.length ? round2(finals.reduce((a, b) => a + b, 0) / finals.length) : null,
            min: finals.length ? Math.min(...finals) : null,
            max: finals.length ? Math.max(...finals) : null,
            belowKkmCount: students.filter((s) => s.belowKkm).length,
            filled: finals.length,
          },
        };
      });
    },
  );

  app.get(
    '/v1/grading/recap/class',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rekap nilai satu kelas (leger)',
        description:
          'Izin: `grade:read`; modul `grades`. Matriks mapel x siswa berisi nilai akhir dan predikat, bahan rapor dan ' +
          'leger. Mapel yang ditampilkan: yang diampu di kelas itu atau yang sudah punya penilaian pada semester itu. ' +
          'Hanya pemegang `grade:configure`, kepala sekolah, kurikulum, atau guru yang mengajar di kelas itu (selain ' +
          'itu 403). Semester/kelas harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid(), classId: z.uuid() }),
        response: {
          200: z.object({
            subjects: z.array(z.object({ id: z.uuid(), name: z.string() })),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                grades: z.array(
                  z.object({
                    subjectId: z.uuid(),
                    final: z.number().nullable(),
                    predicate: predicateEnum.nullable(),
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
      const { semesterId, classId } = request.query;
      return tenant(request, async (tx) => {
        const [sem] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.id, semesterId));
        if (!sem) throw invalidRef('Semester tidak ditemukan.');
        const [cls] = await tx.select({ id: classRoom.id }).from(classRoom).where(eq(classRoom.id, classId));
        if (!cls) throw invalidRef('Kelas tidak ditemukan.');
        if (!isWide(ctx) && !(await myAssignments(tx, ctx)).some((a) => a.classId === classId)) {
          throw notAllowed();
        }

        const taught = await tx
          .select({ subjectId: teachingAssignment.subjectId })
          .from(teachingAssignment)
          .where(eq(teachingAssignment.classId, classId));
        const assessed = await tx
          .selectDistinct({ subjectId: assessment.subjectId })
          .from(assessment)
          .where(and(eq(assessment.semesterId, semesterId), eq(assessment.classId, classId)));
        const subjectIds = [...new Set([...taught, ...assessed].map((s) => s.subjectId))];
        const subjects = subjectIds.length
          ? await tx
              .select({ id: subject.id, name: subject.name })
              .from(subject)
              .where(inArray(subject.id, subjectIds))
              .orderBy(asc(subject.name))
          : [];

        const settings = await loadSettings(tx);
        const components = await loadComponents(tx);
        const { rows } = await rosterOf(tx, classId);
        const grades = await computeGrades(tx, {
          semesterId,
          classId,
          subjectIds: subjects.map((s) => s.id),
          studentIds: rows.map((s) => s.id),
          components,
          settings,
        });
        return {
          subjects,
          students: rows.map((s) => ({
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            grades: subjects.map((sub) => {
              const g = grades.get(sub.id)!.get(s.id)!;
              return { subjectId: sub.id, final: g.final, predicate: g.predicate };
            }),
          })),
        };
      });
    },
  );
}
