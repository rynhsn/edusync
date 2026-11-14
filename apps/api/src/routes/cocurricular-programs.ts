import {
  COCURRICULAR_PROGRAM_STATUSES,
  cocurricularFacilitatorInputSchema,
  cocurricularPeriodsLevelSchema,
  cocurricularProgramCreateSchema,
  cocurricularProgramDetailSchema,
  cocurricularProgramInputSchema,
  cocurricularProgramSummarySchema,
  duplicateKeys,
  facilitatorShapeValid,
  PROGRAM_CHILD_LIMIT,
} from '@edusync/contracts';
import {
  academicYear,
  asc,
  classRoom,
  cocurricularFacilitator,
  cocurricularProgram,
  cocurricularProgramClass,
  cocurricularProgramTarget,
  curriculumSubjectAllocation,
  desc,
  eq,
  inArray,
  schoolProfileItem,
  semester,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertNotAssessed } from '../cocurricular-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * Kokurikuler, tahap 4.2: program per tahun ajaran (bentuk, tema, rombel, butir sasaran, fasilitator, rencana JP vs alokasi).
 * Kokurikuler BUKAN mapel dan tidak memengaruhi nilai. Penilaian dan bukti ada di cocurricular-assessments.ts (tahap 4.3); program, rombel, atau butir yang sudah
 * dinilai ditolak 409 `cocurricular_assessed` (atau `report_final`).
 */

const tag = ['Cocurricular'];
const MODULE = 'grades';
const readGate = [requirePermission('cocurricular:read'), requireModule(MODULE)];
const manageGate = [requirePermission('cocurricular:manage'), requireModule(MODULE)];

const bad = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = () => new HttpError(404, 'not_found', 'Program kokurikuler tidak ditemukan.');
const dup = (message: string) => new HttpError(409, 'conflict', message);

type FacilitatorInput = z.infer<typeof cocurricularFacilitatorInputSchema>;
type Program = typeof cocurricularProgram.$inferSelect;

async function loadProgram(tx: Tx, id: string): Promise<Program> {
  const [row] = await tx.select().from(cocurricularProgram).where(eq(cocurricularProgram.id, id));
  if (!row) throw notFound();
  return row;
}

/** Semester harus milik tahun ajaran program (null = sepanjang tahun). */
async function assertSemester(tx: Tx, yearId: string, semesterId: string | null) {
  if (!semesterId) return;
  const [s] = await tx
    .select({ yearId: semester.academicYearId })
    .from(semester)
    .where(eq(semester.id, semesterId));
  if (!s || s.yearId !== yearId) throw bad('Semester tidak ditemukan pada tahun ajaran program.');
}

async function assertClasses(tx: Tx, yearId: string, classIds: string[]) {
  if (classIds.length === 0) return;
  const rows = await tx
    .select({ id: classRoom.id, yearId: classRoom.academicYearId })
    .from(classRoom)
    .where(inArray(classRoom.id, classIds));
  if (rows.length !== new Set(classIds).size || rows.some((r) => r.yearId !== yearId)) {
    throw bad('Rombel tidak ditemukan pada tahun ajaran program.');
  }
}

/** Butir sasaran harus milik sekolah dan aktif; `keep` = butir yang sudah menjadi sasaran (boleh tetap walau kini nonaktif). */
async function assertTargets(tx: Tx, ids: string[], keep: Set<string> = new Set()) {
  if (ids.length === 0) return;
  const rows = await tx
    .select({ id: schoolProfileItem.id, active: schoolProfileItem.active })
    .from(schoolProfileItem)
    .where(inArray(schoolProfileItem.id, ids));
  if (rows.length !== new Set(ids).size) throw bad('Butir sasaran tidak ditemukan.');
  if (rows.some((r) => !r.active && !keep.has(r.id))) throw bad('Butir sasaran nonaktif tidak bisa dipilih.');
}

async function assertFacilitators(tx: Tx, list: FacilitatorInput[], programClassIds: Set<string>) {
  if (list.some((f) => !facilitatorShapeValid(f))) {
    throw bad('Koordinator tidak memakai rombel; fasilitator wajib memilih satu rombel.');
  }
  if (duplicateKeys(list.map((f) => `${f.teacherId}\u0000${f.classId ?? ''}`)).length > 0) {
    throw dup('Guru yang sama tidak boleh dicatat dua kali untuk rombel yang sama.');
  }
  if (list.some((f) => f.classId !== null && !programClassIds.has(f.classId))) {
    throw bad('Rombel fasilitator harus termasuk rombel program.');
  }
  const teacherIds = [...new Set(list.map((f) => f.teacherId))];
  if (teacherIds.length === 0) return;
  const found = await tx.select({ id: teacher.id }).from(teacher).where(inArray(teacher.id, teacherIds));
  if (found.length !== teacherIds.length) throw bad('Guru tidak ditemukan.');
}

/** Ganti seluruh isi satu anak program. */
const replaceClasses = async (tx: Tx, schoolId: string, programId: string, classIds: string[]) => {
  await tx.delete(cocurricularProgramClass).where(eq(cocurricularProgramClass.programId, programId));
  const uniq = [...new Set(classIds)];
  if (uniq.length > 0) {
    await tx
      .insert(cocurricularProgramClass)
      .values(uniq.map((classId) => ({ schoolId, programId, classId })));
  }
};
const replaceTargets = async (tx: Tx, schoolId: string, programId: string, ids: string[]) => {
  await tx.delete(cocurricularProgramTarget).where(eq(cocurricularProgramTarget.programId, programId));
  const uniq = [...new Set(ids)];
  if (uniq.length > 0) {
    await tx
      .insert(cocurricularProgramTarget)
      .values(uniq.map((profileItemId) => ({ schoolId, programId, profileItemId })));
  }
};
const replaceFacilitators = async (tx: Tx, schoolId: string, programId: string, list: FacilitatorInput[]) => {
  await tx.delete(cocurricularFacilitator).where(eq(cocurricularFacilitator.programId, programId));
  if (list.length > 0) {
    await tx.insert(cocurricularFacilitator).values(list.map((f) => ({ schoolId, programId, ...f })));
  }
};

async function detail(tx: Tx, id: string) {
  const p = await loadProgram(tx, id);
  const classes = await tx
    .select({ classId: classRoom.id, name: classRoom.name, level: classRoom.level })
    .from(cocurricularProgramClass)
    .innerJoin(classRoom, eq(classRoom.id, cocurricularProgramClass.classId))
    .where(eq(cocurricularProgramClass.programId, id))
    .orderBy(asc(classRoom.level), asc(classRoom.name));
  const targets = await tx
    .select({
      profileItemId: schoolProfileItem.id,
      frameworkKey: schoolProfileItem.frameworkKey,
      code: schoolProfileItem.code,
      label: schoolProfileItem.label,
      active: schoolProfileItem.active,
    })
    .from(cocurricularProgramTarget)
    .innerJoin(schoolProfileItem, eq(schoolProfileItem.id, cocurricularProgramTarget.profileItemId))
    .where(eq(cocurricularProgramTarget.programId, id))
    .orderBy(asc(schoolProfileItem.frameworkKey), asc(schoolProfileItem.sort), asc(schoolProfileItem.code));
  const facilitators = await tx
    .select({
      teacherId: teacher.id,
      teacherName: teacher.name,
      classId: cocurricularFacilitator.classId,
      role: cocurricularFacilitator.role,
    })
    .from(cocurricularFacilitator)
    .innerJoin(teacher, eq(teacher.id, cocurricularFacilitator.teacherId))
    .where(eq(cocurricularFacilitator.programId, id))
    .orderBy(asc(cocurricularFacilitator.role), asc(teacher.name));
  return {
    ...toSummary(p, classes.length, targets.length, facilitators.length),
    classes,
    targets,
    facilitators,
  };
}

function toSummary(p: Program, classCount: number, targetCount: number, facilitatorCount: number) {
  return {
    id: p.id,
    academicYearId: p.academicYearId,
    semesterId: p.semesterId,
    form: p.form,
    title: p.title,
    theme: p.theme,
    description: p.description,
    plannedPeriods: p.plannedPeriods,
    showInReport: p.showInReport,
    status: p.status,
    classCount,
    targetCount,
    facilitatorCount,
    createdAt: p.createdAt.toISOString(),
  };
}

async function countBy(
  tx: Tx,
  table: typeof cocurricularProgramClass | typeof cocurricularProgramTarget | typeof cocurricularFacilitator,
  ids: string[],
) {
  const rows = await tx
    .select({ programId: table.programId })
    .from(table)
    .where(inArray(table.programId, ids));
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.programId, (map.get(r.programId) ?? 0) + 1);
  return map;
}

export async function cocurricularProgramRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/cocurricular/programs',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar program kokurikuler',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Program per tahun ajaran (bawaan: tahun ajaran aktif; daftar kosong bila ' +
          'belum ada tahun aktif), terbaru dulu, dengan jumlah rombel, butir sasaran, dan fasilitator. Saring dengan ' +
          '`semesterId` (program sepanjang tahun ikut tampil) dan `status`. Sekolah yang belum membuat program mendapat daftar kosong.',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid().optional(),
          semesterId: z.uuid().optional(),
          status: z.enum(COCURRICULAR_PROGRAM_STATUSES).optional(),
        }),
        response: {
          200: z.object({
            academicYearId: z.uuid().nullable(),
            programs: z.array(cocurricularProgramSummarySchema),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const { academicYearId, semesterId, status } = request.query;
        let yearId = academicYearId ?? null;
        if (yearId) {
          const [y] = await tx
            .select({ id: academicYear.id })
            .from(academicYear)
            .where(eq(academicYear.id, yearId));
          if (!y) throw bad('Tahun ajaran tidak ditemukan.');
        } else {
          const [y] = await tx
            .select({ id: academicYear.id })
            .from(academicYear)
            .where(eq(academicYear.isActive, true));
          yearId = y?.id ?? null;
        }
        if (!yearId) return { academicYearId: null, programs: [] };
        const rows = await tx
          .select()
          .from(cocurricularProgram)
          .where(eq(cocurricularProgram.academicYearId, yearId))
          .orderBy(desc(cocurricularProgram.createdAt), asc(cocurricularProgram.title));
        const filtered = rows.filter(
          (p) =>
            (!status || p.status === status) &&
            (!semesterId || p.semesterId === null || p.semesterId === semesterId),
        );
        if (filtered.length === 0) return { academicYearId: yearId, programs: [] };
        const ids = filtered.map((p) => p.id);
        const [cls, tgt, fac] = await Promise.all([
          countBy(tx, cocurricularProgramClass, ids),
          countBy(tx, cocurricularProgramTarget, ids),
          countBy(tx, cocurricularFacilitator, ids),
        ]);
        return {
          academicYearId: yearId,
          programs: filtered.map((p) =>
            toSummary(p, cls.get(p.id) ?? 0, tgt.get(p.id) ?? 0, fac.get(p.id) ?? 0),
          ),
        };
      }),
  );

  app.get(
    '/v1/cocurricular/programs/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail program kokurikuler',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Satu program beserta rombel, butir sasaran, dan fasilitator/koordinatornya. ' +
          'Galat: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: cocurricularProgramDetailSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => detail(tx, request.params.id)),
  );

  app.post(
    '/v1/cocurricular/programs',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Buat program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Membuat program pada satu tahun ajaran, opsional sekaligus rombel, butir ' +
          'sasaran, dan fasilitator. `semesterId` kosong = sepanjang tahun. Koordinator tidak memakai `classId`; fasilitator wajib ' +
          `memilih satu rombel program (maks. ${PROGRAM_CHILD_LIMIT} isi per daftar). Rencana JP hanya dibandingkan dengan alokasi ` +
          '(lihat `periods-summary`), tidak pernah menolak. Galat: 400 `invalid_reference` (tahun/semester/rombel/butir/guru tidak ' +
          'valid, butir nonaktif), 409 `conflict` (fasilitator ganda).',
        headers: schoolHeader,
        body: cocurricularProgramCreateSchema,
        response: { 201: cocurricularProgramDetailSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { academicYearId, classIds, profileItemIds, facilitators, ...fields } = request.body;
      const out = await tenant(request, async (tx) => {
        const [y] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.id, academicYearId));
        if (!y) throw bad('Tahun ajaran tidak ditemukan.');
        await assertSemester(tx, academicYearId, fields.semesterId);
        await assertClasses(tx, academicYearId, classIds);
        await assertTargets(tx, profileItemIds);
        await assertFacilitators(tx, facilitators, new Set(classIds));
        const [row] = await tx
          .insert(cocurricularProgram)
          .values({ schoolId: ctx.schoolId, academicYearId, createdBy: ctx.userId, ...fields })
          .returning({ id: cocurricularProgram.id });
        const id = (row as { id: string }).id;
        await replaceClasses(tx, ctx.schoolId, id, classIds);
        await replaceTargets(tx, ctx.schoolId, id, profileItemIds);
        await replaceFacilitators(tx, ctx.schoolId, id, facilitators);
        await audit(tx, ctx, 'cocurricular.program.create', 'cocurricular_program', id, {
          title: fields.title,
        });
        return detail(tx, id);
      });
      return reply.code(201).send(out);
    },
  );

  app.put(
    '/v1/cocurricular/programs/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti data pokok program (semester, bentuk, judul, tema, uraian, rencana ' +
          'JP, tampil di rapor, status). Tahun ajaran tidak dapat diubah. Arsipkan dengan `status: closed`. Rombel, butir, dan ' +
          'fasilitator diubah lewat endpoint khususnya. Galat: 404 `not_found`, 400 `invalid_reference` (semester bukan milik ' +
          'tahun program).',
        headers: schoolHeader,
        params: idParams,
        body: cocurricularProgramInputSchema,
        response: { 200: cocurricularProgramDetailSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await assertSemester(tx, p.academicYearId, request.body.semesterId);
        await tx
          .update(cocurricularProgram)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(cocurricularProgram.id, p.id));
        await audit(tx, ctx, 'cocurricular.program.update', 'cocurricular_program', p.id, {
          status: request.body.status,
        });
        return detail(tx, p.id);
      });
    },
  );

  app.delete(
    '/v1/cocurricular/programs/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Menghapus program beserta rombel, butir sasaran, dan fasilitatornya. ' +
          'Program yang sudah punya penilaian ditolak: 409 `report_final` bila ada penilaian pada rapor yang sudah final, selain itu ' +
          '409 `cocurricular_assessed` (gunakan `status: closed`). Bukti program ikut terhapus. Galat: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await assertNotAssessed(tx, p.id);
        await tx.delete(cocurricularProgram).where(eq(cocurricularProgram.id, p.id));
        await audit(tx, ctx, 'cocurricular.program.delete', 'cocurricular_program', p.id, { title: p.title });
        return { ok: true as const };
      });
    },
  );

  app.put(
    '/v1/cocurricular/programs/:id/classes',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ganti rombel program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti SELURUH daftar rombel peserta. Rombel harus milik tahun ajaran ' +
          'program. Rombel yang masih punya fasilitator tidak bisa dilepas (409 `conflict`; ubah fasilitator dulu), dan rombel yang ' +
          'muridnya sudah dinilai juga tidak (409 `cocurricular_assessed`, atau `report_final` bila rapornya final). Galat: 404 ' +
          '`not_found`, 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ classIds: z.array(z.uuid()).max(PROGRAM_CHILD_LIMIT) }),
        response: {
          200: cocurricularProgramDetailSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { classIds } = request.body;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        await assertClasses(tx, p.academicYearId, classIds);
        const facs = await tx
          .select({ classId: cocurricularFacilitator.classId })
          .from(cocurricularFacilitator)
          .where(eq(cocurricularFacilitator.programId, p.id));
        const keep = new Set(classIds);
        const current = (
          await tx
            .select({ id: cocurricularProgramClass.classId })
            .from(cocurricularProgramClass)
            .where(eq(cocurricularProgramClass.programId, p.id))
        ).map((c) => c.id);
        if (facs.some((f) => f.classId !== null && !keep.has(f.classId))) {
          throw dup('Rombel yang dilepas masih punya fasilitator; ubah fasilitator terlebih dahulu.');
        }
        await assertNotAssessed(tx, p.id, { classIds: current.filter((c) => !keep.has(c)) });
        await replaceClasses(tx, ctx.schoolId, p.id, classIds);
        await tx
          .update(cocurricularProgram)
          .set({ updatedAt: new Date() })
          .where(eq(cocurricularProgram.id, p.id));
        await audit(tx, ctx, 'cocurricular.program.classes', 'cocurricular_program', p.id, {
          total: keep.size,
        });
        return detail(tx, p.id);
      });
    },
  );

  app.put(
    '/v1/cocurricular/programs/:id/targets',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ganti butir sasaran program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti SELURUH daftar butir sasaran (dimensi profil / topik Panca Cinta ' +
          'milik sekolah). Butir baru harus aktif; butir yang sudah menjadi sasaran boleh tetap walau kini nonaktif. Butir yang sudah ' +
          'dinilai tidak bisa dilepas (409 `cocurricular_assessed`, atau `report_final` bila rapornya final). Galat: 404 ' +
          '`not_found`, 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ profileItemIds: z.array(z.uuid()).max(PROGRAM_CHILD_LIMIT) }),
        response: {
          200: cocurricularProgramDetailSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { profileItemIds } = request.body;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        const current = await tx
          .select({ id: cocurricularProgramTarget.profileItemId })
          .from(cocurricularProgramTarget)
          .where(eq(cocurricularProgramTarget.programId, p.id));
        await assertTargets(tx, profileItemIds, new Set(current.map((c) => c.id)));
        const next = new Set(profileItemIds);
        await assertNotAssessed(tx, p.id, {
          profileItemIds: current.map((c) => c.id).filter((i) => !next.has(i)),
        });
        await replaceTargets(tx, ctx.schoolId, p.id, profileItemIds);
        await tx
          .update(cocurricularProgram)
          .set({ updatedAt: new Date() })
          .where(eq(cocurricularProgram.id, p.id));
        await audit(tx, ctx, 'cocurricular.program.targets', 'cocurricular_program', p.id, {
          total: new Set(profileItemIds).size,
        });
        return detail(tx, p.id);
      });
    },
  );

  app.put(
    '/v1/cocurricular/programs/:id/facilitators',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ganti fasilitator program kokurikuler',
        description:
          'Izin: `cocurricular:manage`; modul `grades`. Mengganti SELURUH daftar koordinator (`role: coordinator`, tanpa `classId`, ' +
          'seluruh rombel program) dan fasilitator (`role: facilitator`, wajib `classId` rombel program). Data ini juga menjadi ' +
          'dasar hak menilai kontekstual (tahap 4.3). Galat: 404 `not_found`, 400 `invalid_reference`, 409 `conflict` (ganda).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          facilitators: z.array(cocurricularFacilitatorInputSchema).max(PROGRAM_CHILD_LIMIT),
        }),
        response: {
          200: cocurricularProgramDetailSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { facilitators } = request.body;
      return tenant(request, async (tx) => {
        const p = await loadProgram(tx, request.params.id);
        const cls = await tx
          .select({ id: cocurricularProgramClass.classId })
          .from(cocurricularProgramClass)
          .where(eq(cocurricularProgramClass.programId, p.id));
        await assertFacilitators(tx, facilitators, new Set(cls.map((c) => c.id)));
        await replaceFacilitators(tx, ctx.schoolId, p.id, facilitators);
        await tx
          .update(cocurricularProgram)
          .set({ updatedAt: new Date() })
          .where(eq(cocurricularProgram.id, p.id));
        await audit(tx, ctx, 'cocurricular.program.facilitators', 'cocurricular_program', p.id, {
          total: facilitators.length,
        });
        return detail(tx, p.id);
      });
    },
  );

  app.get(
    '/v1/cocurricular/periods-summary',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rencana JP kokurikuler vs alokasi per tingkat',
        description:
          'Izin: `cocurricular:read`; modul `grades`. Per tingkat: jumlah `plannedPeriods` program (semua status) yang memuat rombel ' +
          'tingkat itu, dibandingkan dengan JP kokurikuler tahunan pada alokasi kurikulum. Alokasi tingkat dihitung sebagai baris ' +
          'semua jurusan ditambah jurusan dengan total terbesar (batas atas yang paling longgar). Hanya peringatan: `exceeds` ' +
          'bernilai true bila rencana melebihi alokasi; tanpa alokasi `allocatedPeriods` null dan `exceeds` false.',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid() }),
        response: {
          200: z.object({ levels: z.array(cocurricularPeriodsLevelSchema) }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const yearId = request.query.academicYearId;
        const [y] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.id, yearId));
        if (!y) throw bad('Tahun ajaran tidak ditemukan.');
        const rows = await tx
          .select({
            programId: cocurricularProgram.id,
            planned: cocurricularProgram.plannedPeriods,
            level: classRoom.level,
          })
          .from(cocurricularProgram)
          .innerJoin(cocurricularProgramClass, eq(cocurricularProgramClass.programId, cocurricularProgram.id))
          .innerJoin(classRoom, eq(classRoom.id, cocurricularProgramClass.classId))
          .where(eq(cocurricularProgram.academicYearId, yearId));
        const perLevel = new Map<string, Map<string, number>>();
        for (const r of rows) {
          const m = perLevel.get(r.level) ?? new Map<string, number>();
          m.set(r.programId, r.planned ?? 0);
          perLevel.set(r.level, m);
        }
        const allocs = await tx
          .select({
            level: curriculumSubjectAllocation.levelCode,
            programId: curriculumSubjectAllocation.programId,
            periods: curriculumSubjectAllocation.cocurricularYearlyPeriods,
          })
          .from(curriculumSubjectAllocation)
          .where(eq(curriculumSubjectAllocation.academicYearId, yearId));
        const allocated = (level: string): number | null => {
          const mine = allocs.filter((a) => a.level === level && a.periods !== null);
          if (mine.length === 0) return null;
          const common = mine.filter((a) => a.programId === null).reduce((n, a) => n + (a.periods ?? 0), 0);
          const byProgram = new Map<string, number>();
          for (const a of mine.filter((x) => x.programId !== null)) {
            byProgram.set(
              a.programId as string,
              (byProgram.get(a.programId as string) ?? 0) + (a.periods ?? 0),
            );
          }
          return common + Math.max(0, ...byProgram.values());
        };
        const levels = [...perLevel.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true }))
          .map(([levelCode, programs]) => {
            const plannedPeriods = [...programs.values()].reduce((n, v) => n + v, 0);
            const allocatedPeriods = allocated(levelCode);
            return {
              levelCode,
              programCount: programs.size,
              plannedPeriods,
              allocatedPeriods,
              exceeds: allocatedPeriods !== null && plannedPeriods > allocatedPeriods,
            };
          });
        return { levels };
      }),
  );
}
