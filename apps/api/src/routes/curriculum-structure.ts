import { isValidPeriods } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  curriculumSubjectAllocation,
  eq,
  inArray,
  program,
  refCurriculum,
  schoolCurriculumVersion,
  schoolLevel,
  sql,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, schoolHeader } from './helpers';

/**
 * Struktur kurikulum per tahun ajaran (fase 2B tahap 1): alokasi jam pelajaran (JP) per tingkat, program, dan mapel,
 * serta versi kurikulum per tingkat. Baca dengan `subject:read`, tulis dengan `curriculum:manage`.
 */

const MAX_ITEMS = 500;
const bad = (code: string, message: string) => new HttpError(400, code, message);

async function requireYear(tx: Tx, id: string) {
  const [row] = await tx.select({ id: academicYear.id }).from(academicYear).where(eq(academicYear.id, id));
  if (!row) throw new HttpError(404, 'not_found', 'Tahun ajaran tidak ditemukan.');
}

/** Kode tingkat harus ada di daftar tingkat sekolah (daftar kosong berarti tidak ada tingkat yang sah). */
async function requireLevels(tx: Tx, codes: string[]) {
  const have = new Set((await tx.select({ code: schoolLevel.code }).from(schoolLevel)).map((l) => l.code));
  const missing = [...new Set(codes)].filter((c) => !have.has(c));
  if (missing.length > 0) {
    throw bad('invalid_level', `Tingkat tidak ada di daftar tingkat sekolah: ${missing.join(', ')}.`);
  }
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const allocKey = (levelCode: string, programId: string | null, subjectId: string) =>
  `${levelCode}|${programId ?? NIL_UUID}|${subjectId}`;

const periods = z.number().int().min(0).max(9999).nullable().optional();

const allocationOut = z.object({
  id: z.uuid(),
  levelCode: z.string(),
  programId: z.uuid().nullable(),
  subjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  weeklyPeriods: z.number().int().nullable().describe('JP mingguan intrakurikuler'),
  yearlyPeriods: z.number().int().nullable().describe('JP tahunan intrakurikuler'),
  cocurricularYearlyPeriods: z.number().int().nullable().optional().describe('JP kokurikuler tahunan'),
  weeks: z.number().int().nullable().optional().describe('Durasi dalam minggu (mis. PKL)'),
  note: z.string().nullable(),
});

const allocationsBody = z.object({
  allocations: z
    .array(
      z.object({
        levelCode: z.string().trim().min(1).max(20),
        programId: z.uuid().nullable().optional(),
        subjectId: z.uuid(),
        weeklyPeriods: periods,
        yearlyPeriods: periods,
        cocurricularYearlyPeriods: periods,
        weeks: periods,
        note: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .max(MAX_ITEMS),
});

const versionOut = z.object({
  id: z.uuid(),
  levelCode: z.string(),
  curriculumKey: z.string(),
  curriculumName: z.string(),
  effectiveFrom: z.iso.date().nullable(),
  note: z.string().nullable(),
});

const versionsBody = z.object({
  versions: z
    .array(
      z.object({
        levelCode: z.string().trim().min(1).max(20),
        curriculumKey: z.string().trim().min(1).max(40).nullable(),
        effectiveFrom: z.iso.date().nullable().optional(),
        note: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .max(MAX_ITEMS),
});

/**
 * Salin alokasi JP dan versi kurikulum dari satu tahun ke tahun lain dengan tingkat yang sama (dipakai rollover).
 * Idempoten: baris yang sudah ada di tahun tujuan tidak ditimpa. `write` false hanya menghitung.
 */
export async function copyCurriculumStructure(
  tx: Tx,
  ctx: TenantContext,
  sourceYearId: string,
  targetYearId: string,
  write: boolean,
): Promise<{ allocationsCreated: number; versionsCreated: number }> {
  const srcAlloc = await tx
    .select()
    .from(curriculumSubjectAllocation)
    .where(eq(curriculumSubjectAllocation.academicYearId, sourceYearId));
  const haveAlloc = new Set(
    (
      await tx
        .select()
        .from(curriculumSubjectAllocation)
        .where(eq(curriculumSubjectAllocation.academicYearId, targetYearId))
    ).map((a) => allocKey(a.levelCode, a.programId, a.subjectId)),
  );
  const allocRows = srcAlloc
    .filter((a) => !haveAlloc.has(allocKey(a.levelCode, a.programId, a.subjectId)))
    .map((a) => ({
      schoolId: ctx.schoolId,
      academicYearId: targetYearId,
      levelCode: a.levelCode,
      programId: a.programId,
      subjectId: a.subjectId,
      weeklyPeriods: a.weeklyPeriods,
      yearlyPeriods: a.yearlyPeriods,
      cocurricularYearlyPeriods: a.cocurricularYearlyPeriods,
      weeks: a.weeks,
      note: a.note,
    }));

  const srcVer = await tx
    .select()
    .from(schoolCurriculumVersion)
    .where(eq(schoolCurriculumVersion.academicYearId, sourceYearId));
  const haveVer = new Set(
    (
      await tx
        .select({ levelCode: schoolCurriculumVersion.levelCode })
        .from(schoolCurriculumVersion)
        .where(eq(schoolCurriculumVersion.academicYearId, targetYearId))
    ).map((v) => v.levelCode),
  );
  const verRows = srcVer
    .filter((v) => !haveVer.has(v.levelCode))
    .map((v) => ({
      schoolId: ctx.schoolId,
      academicYearId: targetYearId,
      levelCode: v.levelCode,
      curriculumKey: v.curriculumKey,
      // Tanggal berlaku milik tahun sumber tidak ikut: tahun baru menentukan sendiri.
      effectiveFrom: null,
      note: v.note,
    }));

  if (!write) return { allocationsCreated: allocRows.length, versionsCreated: verRows.length };
  const allocInserted = allocRows.length
    ? await tx
        .insert(curriculumSubjectAllocation)
        .values(allocRows)
        .onConflictDoNothing()
        .returning({ id: curriculumSubjectAllocation.id })
    : [];
  const verInserted = verRows.length
    ? await tx
        .insert(schoolCurriculumVersion)
        .values(verRows)
        .onConflictDoNothing()
        .returning({ id: schoolCurriculumVersion.id })
    : [];
  return { allocationsCreated: allocInserted.length, versionsCreated: verInserted.length };
}

export async function curriculumStructureRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };
  const lock = (tx: Tx, kind: string, yearId: string) =>
    tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${yearId}`}))`);

  /* ---------- Alokasi JP ---------- */

  app.get(
    '/v1/academic-years/:id/curriculum/allocations',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Alokasi jam pelajaran (JP) satu tahun ajaran',
        description:
          'Izin: `subject:read`. Alokasi JP mingguan/tahunan (intrakurikuler), kokurikuler tahunan, dan minggu per (tingkat, program, mapel) beserta nama mapel. ' +
          '`programId` null berarti berlaku untuk semua program. Filter opsional `levelCode` dan `programId`.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ levelCode: z.string().max(20).optional(), programId: z.uuid().optional() }),
        response: {
          200: z.object({ allocations: z.array(allocationOut) }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requireYear(tx, request.params.id);
        const { levelCode, programId } = request.query;
        const rows = await tx
          .select({
            id: curriculumSubjectAllocation.id,
            levelCode: curriculumSubjectAllocation.levelCode,
            programId: curriculumSubjectAllocation.programId,
            subjectId: curriculumSubjectAllocation.subjectId,
            subjectCode: subject.code,
            subjectName: subject.name,
            weeklyPeriods: curriculumSubjectAllocation.weeklyPeriods,
            yearlyPeriods: curriculumSubjectAllocation.yearlyPeriods,
            cocurricularYearlyPeriods: curriculumSubjectAllocation.cocurricularYearlyPeriods,
            weeks: curriculumSubjectAllocation.weeks,
            note: curriculumSubjectAllocation.note,
          })
          .from(curriculumSubjectAllocation)
          .innerJoin(subject, eq(subject.id, curriculumSubjectAllocation.subjectId))
          .where(
            and(
              eq(curriculumSubjectAllocation.academicYearId, request.params.id),
              levelCode ? eq(curriculumSubjectAllocation.levelCode, levelCode) : undefined,
              programId ? eq(curriculumSubjectAllocation.programId, programId) : undefined,
            ),
          )
          .orderBy(
            asc(curriculumSubjectAllocation.levelCode),
            asc(subject.sortOrder),
            asc(subject.name),
            asc(curriculumSubjectAllocation.id),
          );
        return { allocations: rows };
      }),
  );

  app.put(
    '/v1/academic-years/:id/curriculum/allocations',
    {
      onRequest: [requirePermission('curriculum:manage')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Simpan alokasi jam pelajaran (JP) satu tahun ajaran',
        description:
          'Izin: `curriculum:manage`. Upsert per (`levelCode`, `programId`, `subjectId`); bagian yang tidak dikirim tidak ' +
          'disentuh. Tiap baris menggantikan baris yang ada: `weeklyPeriods`, `yearlyPeriods`, `note` yang dihilangkan menjadi ' +
          'kosong. `cocurricularYearlyPeriods` dan `weeks` yang dihilangkan mempertahankan nilai tersimpan (null mengosongkan); `weeklyPeriods`/`yearlyPeriods` berarti intrakurikuler. Bila semua JP/minggu kosong, baris itu dihapus. Maksimal 500 baris, semua atau tidak sama sekali. ' +
          '400 `invalid_level`: tingkat tidak ada di daftar tingkat sekolah. 400 `invalid_reference`: mapel atau jurusan ' +
          'bukan milik sekolah ini. 400 `duplicate_entry`: kombinasi yang sama muncul dua kali.',
        headers: schoolHeader,
        params: idParams,
        body: allocationsBody,
        response: {
          200: z.object({ upserted: z.number().int(), deleted: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const items = request.body.allocations;
      return conflictAs409('Alokasi bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          await requireYear(tx, request.params.id);
          await requireLevels(
            tx,
            items.map((i) => i.levelCode),
          );
          for (const i of items) {
            if (
              !isValidPeriods(i.weeklyPeriods) ||
              !isValidPeriods(i.yearlyPeriods) ||
              !isValidPeriods(i.cocurricularYearlyPeriods) ||
              !isValidPeriods(i.weeks)
            ) {
              throw bad('invalid_periods', 'JP harus bilangan bulat tidak negatif.');
            }
          }
          const keys = items.map((i) => allocKey(i.levelCode, i.programId ?? null, i.subjectId));
          if (new Set(keys).size !== keys.length) {
            throw bad('duplicate_entry', 'Kombinasi tingkat, jurusan, dan mapel hanya boleh muncul sekali.');
          }
          const subjectIds = [...new Set(items.map((i) => i.subjectId))];
          if (subjectIds.length > 0) {
            const found = await tx
              .select({ id: subject.id })
              .from(subject)
              .where(inArray(subject.id, subjectIds));
            if (found.length !== subjectIds.length) {
              throw bad('invalid_reference', 'Mata pelajaran tidak ditemukan.');
            }
          }
          const programIds = [...new Set(items.flatMap((i) => (i.programId ? [i.programId] : [])))];
          if (programIds.length > 0) {
            const found = await tx
              .select({ id: program.id })
              .from(program)
              .where(inArray(program.id, programIds));
            if (found.length !== programIds.length)
              throw bad('invalid_reference', 'Jurusan tidak ditemukan.');
          }

          await lock(tx, 'curriculum-allocations', request.params.id);
          const existing = new Map(
            (
              await tx
                .select()
                .from(curriculumSubjectAllocation)
                .where(eq(curriculumSubjectAllocation.academicYearId, request.params.id))
            ).map((a) => [allocKey(a.levelCode, a.programId, a.subjectId), a]),
          );
          let upserted = 0;
          let deleted = 0;
          for (const [idx, i] of items.entries()) {
            const key = keys[idx] as string;
            const prev = existing.get(key);
            const rowId = prev?.id;
            const weekly = i.weeklyPeriods ?? null;
            const yearly = i.yearlyPeriods ?? null;
            // Field baru: dihilangkan (undefined) mempertahankan nilai tersimpan, supaya klien lama tidak menghapusnya.
            const cocurricular =
              i.cocurricularYearlyPeriods === undefined
                ? (prev?.cocurricularYearlyPeriods ?? null)
                : i.cocurricularYearlyPeriods;
            const weeks = i.weeks === undefined ? (prev?.weeks ?? null) : i.weeks;
            if (weekly === null && yearly === null && cocurricular === null && weeks === null) {
              if (rowId) {
                await tx.delete(curriculumSubjectAllocation).where(eq(curriculumSubjectAllocation.id, rowId));
                deleted++;
              }
              continue;
            }
            const values = {
              weeklyPeriods: weekly,
              yearlyPeriods: yearly,
              cocurricularYearlyPeriods: cocurricular,
              weeks,
              note: i.note ?? null,
              updatedAt: new Date(),
            };
            if (rowId) {
              await tx
                .update(curriculumSubjectAllocation)
                .set(values)
                .where(eq(curriculumSubjectAllocation.id, rowId));
            } else {
              await tx.insert(curriculumSubjectAllocation).values({
                schoolId: ctx.schoolId,
                academicYearId: request.params.id,
                levelCode: i.levelCode,
                programId: i.programId ?? null,
                subjectId: i.subjectId,
                ...values,
              });
            }
            upserted++;
          }
          await audit(tx, ctx, 'curriculum.allocations_save', 'academic_year', request.params.id, {
            upserted,
            deleted,
          });
          return { upserted, deleted };
        }),
      );
    },
  );

  /* ---------- Versi kurikulum ---------- */

  app.get(
    '/v1/academic-years/:id/curriculum/versions',
    {
      onRequest: [requirePermission('subject:read')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Versi kurikulum per tingkat pada satu tahun ajaran',
        description: 'Izin: `subject:read`. Kurikulum acuan yang dipakai tiap tingkat pada tahun ajaran itu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.object({ versions: z.array(versionOut) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await requireYear(tx, request.params.id);
        const rows = await tx
          .select({
            id: schoolCurriculumVersion.id,
            levelCode: schoolCurriculumVersion.levelCode,
            curriculumKey: schoolCurriculumVersion.curriculumKey,
            curriculumName: refCurriculum.name,
            effectiveFrom: schoolCurriculumVersion.effectiveFrom,
            note: schoolCurriculumVersion.note,
          })
          .from(schoolCurriculumVersion)
          .innerJoin(refCurriculum, eq(refCurriculum.key, schoolCurriculumVersion.curriculumKey))
          .where(eq(schoolCurriculumVersion.academicYearId, request.params.id))
          .orderBy(asc(schoolCurriculumVersion.levelCode));
        return { versions: rows };
      }),
  );

  app.put(
    '/v1/academic-years/:id/curriculum/versions',
    {
      onRequest: [requirePermission('curriculum:manage')],
      schema: {
        tags: ['Curriculum'],
        summary: 'Simpan versi kurikulum per tingkat pada satu tahun ajaran',
        description:
          'Izin: `curriculum:manage`. Upsert per `levelCode`; `curriculumKey` null menghapus versi tingkat itu. Bagian yang ' +
          'tidak dikirim tidak disentuh; `effectiveFrom` dan `note` yang dihilangkan menjadi kosong. Maksimal 500 baris, ' +
          'semua atau tidak sama sekali. 400 `invalid_level`: tingkat tidak ada di daftar tingkat sekolah. 400 ' +
          '`invalid_curriculum`: kurikulum tidak ada di bank data. 400 `duplicate_entry`: tingkat yang sama muncul dua kali.',
        headers: schoolHeader,
        params: idParams,
        body: versionsBody,
        response: {
          200: z.object({ saved: z.number().int(), deleted: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const items = request.body.versions;
      return conflictAs409('Versi kurikulum bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          await requireYear(tx, request.params.id);
          await requireLevels(
            tx,
            items.map((i) => i.levelCode),
          );
          const levels = items.map((i) => i.levelCode);
          if (new Set(levels).size !== levels.length) {
            throw bad('duplicate_entry', 'Satu tingkat hanya boleh muncul sekali dalam satu permintaan.');
          }
          const keys = [...new Set(items.flatMap((i) => (i.curriculumKey ? [i.curriculumKey] : [])))];
          if (keys.length > 0) {
            const found = await tx
              .select({ key: refCurriculum.key })
              .from(refCurriculum)
              .where(inArray(refCurriculum.key, keys));
            if (found.length !== keys.length) {
              throw bad('invalid_curriculum', 'Kurikulum tidak ditemukan di bank data.');
            }
          }
          await lock(tx, 'curriculum-versions', request.params.id);
          let saved = 0;
          let deleted = 0;
          for (const i of items) {
            if (i.curriculumKey === null) {
              const rows = await tx
                .delete(schoolCurriculumVersion)
                .where(
                  and(
                    eq(schoolCurriculumVersion.academicYearId, request.params.id),
                    eq(schoolCurriculumVersion.levelCode, i.levelCode),
                  ),
                )
                .returning({ id: schoolCurriculumVersion.id });
              deleted += rows.length;
              continue;
            }
            const values = {
              curriculumKey: i.curriculumKey,
              effectiveFrom: i.effectiveFrom ?? null,
              note: i.note ?? null,
            };
            await tx
              .insert(schoolCurriculumVersion)
              .values({
                schoolId: ctx.schoolId,
                academicYearId: request.params.id,
                levelCode: i.levelCode,
                ...values,
              })
              .onConflictDoUpdate({
                target: [schoolCurriculumVersion.academicYearId, schoolCurriculumVersion.levelCode],
                set: values,
              });
            saved++;
          }
          await audit(tx, ctx, 'curriculum.versions_save', 'academic_year', request.params.id, {
            saved,
            deleted,
          });
          return { saved, deleted };
        }),
      );
    },
  );
}
