import {
  and,
  enrollment,
  eq,
  inArray,
  isNull,
  reportCard,
  reportSetting,
  semester,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { notifyReportCards } from '../messaging-lib';
import {
  buildDocument,
  documentSummary,
  liveSummary,
  loadClassContext,
  loadReportSettings,
  type ReportDocument,
  requireSemesterClass,
} from '../report-card-lib';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Report cards'];
const MODULE = 'grades';

const readGate = [requirePermission('report_card:read'), requireModule(MODULE)];

/** Peran yang melihat rapor semua kelas (bersama pemegang `report_card:manage`). */
const WIDE_ROLES = ['principal', 'curriculum'];

const predicateEnum = z.enum(['A', 'B', 'C', 'D']);

const settingsSchema = z.object({
  principalName: z.string().nullable().describe('Nama kepala sekolah untuk tanda tangan'),
  principalNip: z.string().nullable(),
  city: z.string().nullable().describe('Kota tempat rapor diterbitkan'),
  address: z.string().nullable().describe('Alamat sekolah pada kop rapor'),
  descA: z.string().describe('Deskripsi capaian untuk predikat A'),
  descB: z.string(),
  descC: z.string(),
  descD: z.string(),
  showRank: z.boolean().describe('Tampilkan peringkat kelas pada rapor'),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => (v === '' ? null : v));
const descText = z.string().trim().min(1).max(500);

const settingsBody = z.object({
  principalName: optionalText(120),
  principalNip: optionalText(40),
  city: optionalText(80),
  address: optionalText(300),
  descA: descText,
  descB: descText,
  descC: descText,
  descD: descText,
  showRank: z.boolean().default(false),
});

const documentSchema = z.object({
  status: z.enum(['draft', 'final']),
  school: z.object({ name: z.string(), address: z.string().nullable(), city: z.string().nullable() }),
  semester: z.object({ id: z.uuid(), name: z.string(), academicYear: z.string() }),
  student: z.object({
    id: z.uuid(),
    name: z.string(),
    nis: z.string().nullable(),
    nisn: z.string().nullable(),
    className: z.string(),
    level: z.string(),
  }),
  subjects: z.array(
    z.object({
      subjectId: z.uuid(),
      name: z.string(),
      kkm: z.number().int(),
      final: z.number().nullable(),
      predicate: predicateEnum.nullable(),
      description: z.string().nullable().describe('Deskripsi capaian otomatis menurut predikat'),
      belowKkm: z.boolean(),
    }),
  ),
  extracurriculars: z.array(
    z.object({ name: z.string(), predicate: predicateEnum.nullable(), note: z.string().nullable() }),
  ),
  attendance: z.object({
    sick: z.number().int(),
    excused: z.number().int(),
    absent: z.number().int(),
    late: z.number().int(),
  }),
  homeroomNote: z.string().nullable(),
  homeroomTeacher: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  principal: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
  rank: z
    .object({ position: z.number().int(), of: z.number().int() })
    .nullable()
    .describe('Hanya bila pengaturan menampilkan peringkat'),
  generatedAt: z.string().describe('Waktu dokumen disusun (saat final: waktu finalisasi)'),
});

const semesterQuery = z.object({ semesterId: z.uuid() });
const listQuery = z.object({ semesterId: z.uuid(), classId: z.uuid() });
const studentParams = z.object({ studentId: z.uuid() });

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const notAllowed = () =>
  forbidden('Anda hanya boleh mengakses rapor kelas yang Anda walikan, kecuali pemegang izin kelola rapor.');

/** Rapor: pengaturan, daftar kelas, dokumen per siswa, catatan wali kelas, finalisasi. Modul `grades`. */
export async function reportCardRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Otorisasi ---------- */

  const isWide = (ctx: TenantContext) =>
    ctx.permissions.has('report_card:manage') || ctx.roles.some((r) => WIDE_ROLES.includes(r));

  async function isHomeroom(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
    if (!homeroomTeacherId) return false;
    const [t] = await tx
      .select({ memberId: teacher.memberId })
      .from(teacher)
      .where(eq(teacher.id, homeroomTeacherId));
    return t?.memberId === ctx.memberId;
  }

  /** Melihat rapor kelas: pemegang kelola, kepala sekolah, kurikulum, atau wali kelas itu. */
  async function canViewClass(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
    return isWide(ctx) || (await isHomeroom(tx, ctx, homeroomTeacherId));
  }

  /** Mengubah catatan dan memfinalkan: pemegang kelola atau wali kelas itu. */
  async function canWriteClass(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
    return ctx.permissions.has('report_card:manage') || (await isHomeroom(tx, ctx, homeroomTeacherId));
  }

  /** Kelas siswa itu pada tahun ajaran semester: rapor final mengikuti kelas saat difinalkan. */
  async function resolveStudent(tx: Tx, sem: typeof semester.$inferSelect, studentId: string) {
    const [stu] = await tx
      .select()
      .from(student)
      .where(and(eq(student.id, studentId), isNull(student.deletedAt)));
    if (!stu) throw notFound('Siswa');
    const [row] = await tx
      .select()
      .from(reportCard)
      .where(and(eq(reportCard.semesterId, sem.id), eq(reportCard.studentId, studentId)));
    const [enr] = await tx
      .select({ classId: enrollment.classId })
      .from(enrollment)
      .where(and(eq(enrollment.studentId, studentId), eq(enrollment.academicYearId, sem.academicYearId)));
    const classId = row?.status === 'final' ? row.classId : (enr?.classId ?? row?.classId);
    if (!classId) throw notFound('Siswa di kelas pada semester itu');
    return { stu, row: row ?? null, classId };
  }

  async function requireSemester(tx: Tx, semesterId: string) {
    const [sem] = await tx.select().from(semester).where(eq(semester.id, semesterId));
    if (!sem) throw new HttpError(400, 'invalid_reference', 'Semester tidak ditemukan.');
    return sem;
  }

  /* ---------- Pengaturan ---------- */

  app.get(
    '/v1/report-cards/settings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan rapor',
        description:
          'Izin: `report_card:read`; modul `grades`. Penanda tangan, kota, alamat, deskripsi capaian per predikat ' +
          '(A-D), dan tampilan peringkat. Sekolah yang belum mengaturnya mendapat nilai bawaan (deskripsi bawaan ' +
          'bahasa Indonesia, tanpa peringkat).',
        headers: schoolHeader,
        response: { 200: settingsSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => loadReportSettings(tx)),
  );

  app.put(
    '/v1/report-cards/settings',
    {
      onRequest: [requirePermission('report_card:manage'), requireModule(MODULE)],
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan rapor',
        description:
          'Izin: `report_card:manage`; modul `grades`. Mengganti seluruh pengaturan. Teks kosong pada nama, NIP, ' +
          'kota, dan alamat disimpan sebagai kosong (null); deskripsi capaian wajib terisi (400 galat validasi).',
        headers: schoolHeader,
        body: settingsBody,
        response: { 200: settingsSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await tx
          .insert(reportSetting)
          .values({ schoolId: ctx.schoolId, ...request.body })
          .onConflictDoUpdate({
            target: reportSetting.schoolId,
            set: { ...request.body, updatedAt: new Date() },
          });
        await audit(tx, ctx, 'report_card.settings_update', 'report_setting', ctx.schoolId, {
          showRank: request.body.showRank,
        });
        return loadReportSettings(tx);
      });
    },
  );

  /* ---------- Daftar kelas ---------- */

  app.get(
    '/v1/report-cards',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar rapor satu kelas',
        description:
          'Izin: `report_card:read`; modul `grades`. Siswa aktif kelas (urut nama) dengan status rapor, ada tidaknya ' +
          'catatan wali kelas, rata-rata nilai akhir mapel, dan kelengkapan nilai (`subjectsGraded` dari ' +
          '`subjectsTotal`; mapel = yang punya penilaian di kelas itu pada semester itu). Rapor final memakai ' +
          'snapshot. Hanya pemegang `report_card:manage`, kepala sekolah, kurikulum, atau wali kelas itu (selain itu ' +
          '403). Semester/kelas harus milik sekolah ini dan satu tahun ajaran (400 `invalid_reference`).',
        headers: schoolHeader,
        querystring: listQuery,
        response: {
          200: z.array(
            z.object({
              studentId: z.uuid(),
              name: z.string(),
              nis: z.string().nullable(),
              status: z.enum(['draft', 'final']),
              hasNote: z.boolean(),
              average: z.number().nullable(),
              subjectsGraded: z.number().int(),
              subjectsTotal: z.number().int(),
            }),
          ),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId } = request.query;
      return tenant(request, async (tx) => {
        const { sem, cls } = await requireSemesterClass(tx, semesterId, classId);
        if (!(await canViewClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        const c = await loadClassContext(tx, sem, cls);
        const rows = c.roster.length
          ? await tx
              .select()
              .from(reportCard)
              .where(
                and(
                  eq(reportCard.semesterId, semesterId),
                  inArray(
                    reportCard.studentId,
                    c.roster.map((s) => s.id),
                  ),
                ),
              )
          : [];
        return c.roster.map((s) => {
          const row = rows.find((r) => r.studentId === s.id);
          const frozen = row?.status === 'final' && row.snapshot ? (row.snapshot as ReportDocument) : null;
          return {
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            status: row?.status ?? ('draft' as const),
            hasNote: Boolean(row?.homeroomNote),
            ...(frozen ? documentSummary(frozen) : liveSummary(c, s.id)),
          };
        });
      });
    },
  );

  /* ---------- Dokumen ---------- */

  app.get(
    '/v1/report-cards/:studentId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Dokumen rapor satu siswa',
        description:
          'Izin: `report_card:read`; modul `grades`. Rapor final dikembalikan dari snapshot saat finalisasi; rapor ' +
          'draft dihitung langsung dari nilai terkini memakai rumus yang sama dengan rekap penilaian. Mapel = yang ' +
          'punya penilaian di kelas siswa pada semester itu; deskripsi capaian diisi otomatis dari pengaturan rapor ' +
          'menurut predikat. `attendance` menghitung hari yang tercatat pada rentang semester. `rank` hanya ada bila ' +
          'pengaturan menampilkan peringkat (rata-rata sama berbagi peringkat). Hanya pemegang `report_card:manage`, ' +
          'kepala sekolah, kurikulum, atau wali kelas siswa itu (selain itu 403). 404 `not_found` bila siswa tidak ' +
          'ada atau tidak terdaftar di kelas pada tahun ajaran semester itu.',
        headers: schoolHeader,
        params: studentParams,
        querystring: semesterQuery,
        response: { 200: documentSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const sem = await requireSemester(tx, request.query.semesterId);
        const { stu, row, classId } = await resolveStudent(tx, sem, request.params.studentId);
        const { cls } = await requireSemesterClass(tx, sem.id, classId);
        if (!(await canViewClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        if (row?.status === 'final' && row.snapshot) {
          return { ...(row.snapshot as ReportDocument), status: 'final' as const };
        }
        const c = await loadClassContext(tx, sem, cls, [stu.id]);
        return buildDocument(tx, c, stu, row?.homeroomNote ?? null);
      });
    },
  );

  /* ---------- Catatan wali kelas ---------- */

  app.put(
    '/v1/report-cards/note',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Simpan catatan wali kelas',
        description:
          'Izin: `report_card:read`, dan pemegang `report_card:manage` atau wali kelas siswa itu (selain itu 403). ' +
          '`note` maksimal 500 karakter; null atau teks kosong menghapus catatan. Ditolak 409 `report_final` bila ' +
          'rapor sudah final (buka kembali dulu). 404 `not_found` bila siswa tidak terdaftar di kelas pada tahun ' +
          'ajaran semester itu.',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          studentId: z.uuid(),
          note: z
            .string()
            .trim()
            .max(500)
            .nullable()
            .transform((v) => (v === '' ? null : v)),
        }),
        response: {
          200: z.object({ ok: z.literal(true), note: z.string().nullable() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, studentId, note } = request.body;
      return tenant(request, async (tx) => {
        const sem = await requireSemester(tx, semesterId);
        const { row, classId } = await resolveStudent(tx, sem, studentId);
        const { cls } = await requireSemesterClass(tx, sem.id, classId);
        if (!(await canWriteClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        if (row?.status === 'final') {
          throw new HttpError(
            409,
            'report_final',
            'Rapor sudah final; buka kembali sebelum mengubah catatan.',
          );
        }
        await tx
          .insert(reportCard)
          .values({ schoolId: ctx.schoolId, semesterId, studentId, classId, homeroomNote: note })
          .onConflictDoUpdate({
            target: [reportCard.semesterId, reportCard.studentId],
            set: { homeroomNote: note, classId, updatedAt: new Date() },
          });
        await audit(tx, ctx, 'report_card.note', 'report_card', studentId, { semesterId });
        return { ok: true as const, note };
      });
    },
  );

  /* ---------- Finalisasi ---------- */

  app.post(
    '/v1/report-cards/finalize',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Finalkan rapor satu kelas',
        description:
          'Izin: `report_card:read`, dan pemegang `report_card:manage` atau wali kelas kelas itu (selain itu 403). ' +
          'Membuat atau menimpa rapor semua siswa aktif kelas: dokumen rapor dibekukan sebagai snapshot dan status ' +
          'menjadi `final`. Bila ada siswa yang belum punya nilai akhir pada sebagian mapel (atau kelas belum punya ' +
          'penilaian sama sekali) dan `force` bukan true, ditolak 409 `grades_incomplete` dengan jumlah siswa pada ' +
          'pesan. Semester/kelas harus milik sekolah ini dan satu tahun ajaran (400 `invalid_reference`).',
        headers: schoolHeader,
        body: z.object({
          semesterId: z.uuid(),
          classId: z.uuid(),
          force: z.boolean().default(false).describe('Finalkan walau nilai ada yang belum lengkap'),
        }),
        response: {
          200: z.object({ finalized: z.number().int() }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId, force } = request.body;
      return tenant(request, async (tx) => {
        const { sem, cls } = await requireSemesterClass(tx, semesterId, classId);
        if (!(await canWriteClass(tx, ctx, cls.homeroomTeacherId))) throw notAllowed();
        const c = await loadClassContext(tx, sem, cls);
        const incomplete = c.roster.filter((s) => {
          const { subjectsGraded, subjectsTotal } = liveSummary(c, s.id);
          return subjectsTotal === 0 || subjectsGraded < subjectsTotal;
        });
        if (incomplete.length > 0 && !force) {
          throw new HttpError(
            409,
            'grades_incomplete',
            `${incomplete.length} siswa belum punya nilai akhir pada sebagian mata pelajaran. ` +
              'Lengkapi nilainya atau finalkan dengan force.',
          );
        }
        const [stuRows, existing] = await Promise.all([
          tx
            .select({ id: student.id, name: student.name, nis: student.nis, nisn: student.nisn })
            .from(student)
            .where(
              inArray(
                student.id,
                c.roster.map((s) => s.id),
              ),
            ),
          c.roster.length
            ? tx
                .select({ studentId: reportCard.studentId, note: reportCard.homeroomNote })
                .from(reportCard)
                .where(eq(reportCard.semesterId, semesterId))
            : [],
        ]);
        const now = new Date();
        for (const s of c.roster) {
          const stu = stuRows.find((r) => r.id === s.id);
          if (!stu) continue;
          const note = existing.find((r) => r.studentId === s.id)?.note ?? null;
          const doc: ReportDocument = {
            ...(await buildDocument(tx, c, stu, note)),
            status: 'final',
            generatedAt: now.toISOString(),
          };
          await tx
            .insert(reportCard)
            .values({
              schoolId: ctx.schoolId,
              semesterId,
              studentId: s.id,
              classId,
              homeroomNote: note,
              status: 'final',
              finalizedAt: now,
              finalizedBy: ctx.userId,
              snapshot: doc,
            })
            .onConflictDoUpdate({
              target: [reportCard.semesterId, reportCard.studentId],
              set: {
                classId,
                status: 'final',
                finalizedAt: now,
                finalizedBy: ctx.userId,
                snapshot: doc,
                updatedAt: now,
              },
            });
        }
        await notifyReportCards(tx, ctx.schoolId, {
          semesterId,
          semesterName: sem.name,
          className: cls.name,
          schoolName: c.schoolName,
          students: stuRows.map((s) => ({ id: s.id, name: s.name })),
        });
        await audit(tx, ctx, 'report_card.finalize', 'class', classId, {
          semesterId,
          count: c.roster.length,
          force,
          incomplete: incomplete.length,
        });
        return { finalized: c.roster.length };
      });
    },
  );

  app.post(
    '/v1/report-cards/reopen',
    {
      onRequest: [requirePermission('report_card:manage'), requireModule(MODULE)],
      schema: {
        tags: tag,
        summary: 'Buka kembali rapor satu kelas',
        description:
          'Izin: `report_card:manage`; modul `grades`. Mengembalikan rapor final kelas itu ke draft dan membuang ' +
          'snapshot-nya; catatan wali kelas tetap. `reopened` = jumlah rapor yang dibuka. Semester/kelas harus ' +
          'milik sekolah ini dan satu tahun ajaran (400 `invalid_reference`).',
        headers: schoolHeader,
        body: z.object({ semesterId: z.uuid(), classId: z.uuid() }),
        response: { 200: z.object({ reopened: z.number().int() }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { semesterId, classId } = request.body;
      return tenant(request, async (tx) => {
        await requireSemesterClass(tx, semesterId, classId);
        const rows = await tx
          .update(reportCard)
          .set({
            status: 'draft',
            finalizedAt: null,
            finalizedBy: null,
            snapshot: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(reportCard.semesterId, semesterId),
              eq(reportCard.classId, classId),
              eq(reportCard.status, 'final'),
            ),
          )
          .returning({ id: reportCard.id });
        await audit(tx, ctx, 'report_card.reopen', 'class', classId, { semesterId, count: rows.length });
        return { reopened: rows.length };
      });
    },
  );
}
