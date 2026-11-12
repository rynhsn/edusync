import { CALCULATION_MODES, FREEZE_ORIGINS } from '@edusync/contracts';
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
import { historicalRosterOf, rosterOf } from '../attendance-lib';
import {
  activeSemesterConfig,
  assertComponentInSemester,
  assertLiveGradingConfigEditable,
  finalSubjectRows,
  kkmResolverForClass,
  loadGradingConfig,
  lockGradingConfig,
  semesterGradingStatus,
  syncActiveSemesterFreeze,
  syncSemesterGradingConfig,
} from '../grading-config-lib';
import { computeGrades, loadComponents, loadSettings, round2 } from '../grading-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertClassReportNotFinal } from '../report-lock-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Grading'];
const MODULE = 'grades';

const readGate = [requirePermission('grade:read'), requireModule(MODULE)];
const inputGate = [requirePermission('grade:input'), requireModule(MODULE)];
const configureGate = [requirePermission('grade:configure'), requireModule(MODULE)];

const DEFAULT_COMPONENTS = [
  { name: 'Tugas', weight: 20 },
  { name: 'Ulangan Harian', weight: 30 },
  { name: 'UTS', weight: 20 },
  { name: 'UAS', weight: 30 },
] as const;

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const calculationModeSchema = z
  .enum(CALCULATION_MODES)
  .describe(
    'Mode nilai akhir. `weighted_average` (bawaan): rata-rata tertimbang komponen yang punya skor, bobot dinormalisasi atas komponen itu ' +
      '(jumlah bobot bebas). `percentage`: jumlah (rata-rata komponen x bobot%) / 100 tanpa renormalisasi, komponen tanpa skor menyumbang 0, ' +
      'hasil dibatasi 0..100; WAJIB jumlah bobot komponen tepat 100 (400 `weights_sum_invalid` saat memilih mode ini). ' +
      '`simple_average`: rata-rata tanpa bobot dari rata-rata komponen yang punya skor; bobot diabaikan.',
  );

const settingsSchema = z.object({
  kkm: z
    .number()
    .int()
    .describe('Kriteria ketuntasan minimal; nilai akhir di bawahnya ditandai belum tuntas'),
  predicateA: z.number().int().describe('Nilai minimal predikat A'),
  predicateB: z.number().int().describe('Nilai minimal predikat B'),
  predicateC: z.number().int().describe('Nilai minimal predikat C; di bawahnya predikat D'),
  calculationMode: calculationModeSchema.optional(),
});

const reportSource = z
  .literal('report')
  .optional()
  .describe(
    'Hanya ada (bernilai `report`) bila angka ini diambil dari snapshot rapor final (nilai akhir, predikat, KKM, `belowKkm` ' +
      'persis seperti yang terbit), bukan dihitung ulang; dihilangkan pada jalur hidup.',
  );

const activeSemesterConfigSchema = z
  .object({
    semesterId: z.uuid(),
    frozen: z.literal(true),
    origin: z.enum(FREEZE_ORIGINS),
    frozenAt: z.iso.datetime(),
    matchesLive: z
      .boolean()
      .describe(
        'Salinan beku sama isinya dengan konfigurasi hidup; false = perubahan berikutnya akan menimpa salinan',
      ),
    hasFinal: z
      .boolean()
      .describe('Semester aktif punya rapor final (perubahan konfigurasi ditolak 409 `report_final`)'),
  })
  .describe('Status konfigurasi beku semester aktif');

const settingsReadSchema = settingsSchema.extend({
  activeSemesterConfig: activeSemesterConfigSchema
    .optional()
    .describe('Hanya ada bila semester aktif punya salinan beku konfigurasi nilai; dihilangkan selain itu'),
});

const semesterGradingStatusSchema = z.object({
  semesterId: z.uuid(),
  frozen: z.boolean().describe('Semester punya salinan beku; false = mengikuti konfigurasi hidup'),
  origin: z
    .enum(FREEZE_ORIGINS)
    .nullable()
    .describe('Asal salinan: finalize, semester_closed, sync, backfill, manual'),
  frozenAt: z.iso.datetime().nullable(),
  matchesLive: z
    .boolean()
    .describe('Salinan sama isinya dengan konfigurasi hidup; selalu true bila belum beku'),
  finalClassCount: z.number().int().describe('Jumlah kelas yang rapornya final pada semester ini'),
  finalReportCount: z.number().int().describe('Jumlah rapor final (siswa) pada semester ini'),
  settings: settingsSchema.describe(
    'Pengaturan efektif semester (salinan beku, atau konfigurasi hidup bila belum beku)',
  ),
  components: z.array(
    z.object({ id: z.uuid(), name: z.string(), weight: z.number().int(), sort: z.number().int() }),
  ),
  criteriaCount: z
    .number()
    .int()
    .nullable()
    .describe('Jumlah KKTP dalam salinan; null bila semester belum beku'),
});

const syncedSemesterId = z
  .uuid()
  .optional()
  .describe(
    'Id semester aktif yang salinan beku konfigurasinya ikut ditulis ulang (aturan tulis-tembus); dihilangkan bila tidak ada.',
  );

const settingsWriteSchema = settingsSchema.extend({ syncedSemesterId });

const settingsBody = z
  .object({
    kkm: z.number().int().min(1).max(100),
    predicateA: z.number().int().min(1).max(100),
    predicateB: z.number().int().min(1).max(100),
    predicateC: z.number().int().min(1).max(100),
    calculationMode: calculationModeSchema.optional(),
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

const componentWriteSchema = componentSchema.extend({ syncedSemesterId });
const okSynced = ok.extend({ syncedSemesterId });

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
  filled: z.number().int().describe('Jumlah siswa aktif atau lulusan kelas yang sudah punya skor'),
  total: z.number().int().describe('Jumlah siswa aktif dan lulusan yang terdaftar di kelas (tahun ajaran kelas itu)'),
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
    ctx.permissions.has('grade:configure') || ctx.permissions.has('grade:read_all');

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
      .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(
        and(
          inArray(enrollment.classId, classIds),
          eq(enrollment.academicYearId, classRoom.academicYearId),
          isNull(student.deletedAt),
          inArray(student.status, ['active', 'graduated']),
        ),
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
      .innerJoin(classRoom, eq(classRoom.id, assessment.classId))
      .where(
        and(
          inArray(
            score.assessmentId,
            visible.map((r) => r.a.id),
          ),
          sql`${score.value} is not null`,
          eq(enrollment.academicYearId, classRoom.academicYearId),
          isNull(student.deletedAt),
          inArray(student.status, ['active', 'graduated']),
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
          'Izin: `grade:read`; modul `grades`. KKM sekolah, batas predikat A/B/C, dan `calculationMode`. Sekolah yang ' +
          'belum mengaturnya mendapat nilai bawaan (KKM 75; A 90, B 80, C 70; `weighted_average`). KKM sekolah adalah ' +
          'jatuhan terakhir; mapel bisa punya KKM sendiri lewat KKTP (`/v1/achievement-criteria`). Jumlah bobot ' +
          'komponen (dari `GET /v1/grading/components`) harus 100 agar mode `percentage` bisa dipilih. Bila semester aktif ' +
          'punya salinan beku konfigurasi, respons membawa `activeSemesterConfig` (asal, waktu, `matchesLive`, `hasFinal`) ' +
          'supaya layar pengaturan dapat memperingatkan sebelum menyimpan; dihilangkan bila tidak ada salinan.',
        headers: schoolHeader,
        response: { 200: settingsReadSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const settings = await loadSettings(tx);
        const active = await activeSemesterConfig(tx, ctx.schoolId);
        return active
          ? { ...settings, activeSemesterConfig: { ...active, frozenAt: active.frozenAt.toISOString() } }
          : settings;
      });
    },
  );

  /* ---------- Konfigurasi beku per semester ---------- */

  async function semesterStatusView(tx: Tx, schoolId: string, semesterId: string) {
    const st = await semesterGradingStatus(tx, schoolId, semesterId);
    const cfg = await loadGradingConfig(tx, semesterId);
    return {
      semesterId,
      frozen: st.frozen,
      origin: st.origin,
      frozenAt: st.frozenAt ? st.frozenAt.toISOString() : null,
      matchesLive: st.matchesLive,
      finalClassCount: st.finalClassCount,
      finalReportCount: st.finalReportCount,
      settings: cfg.settings,
      components: cfg.components,
      criteriaCount: st.row && Array.isArray(st.row.criteria) ? st.row.criteria.length : null,
    };
  }

  const requireSemester = async (tx: Tx, id: string) => {
    const [sem] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.id, id));
    if (!sem) throw notFound('Semester');
  };

  app.get(
    '/v1/semesters/:id/grading-config',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Status konfigurasi nilai beku satu semester',
        description:
          'Izin: `grade:read`; modul `grades`. Konfigurasi nilai (KKM, predikat, mode, komponen, KKTP) sebuah semester: ' +
          '`frozen` false berarti semester mengikuti konfigurasi hidup; true berarti semester memakai salinan beku ' +
          '(`origin`: `finalize` saat rapor pertama difinalkan, `semester_closed` saat semester ditinggalkan, `sync` sinkron ' +
          'ulang atau tulis-tembus, `backfill` data lama, `manual`). `matchesLive` membandingkan salinan dengan konfigurasi ' +
          'hidup saat ini. `finalClassCount`/`finalReportCount` = jumlah kelas dan rapor final semester itu. `settings` dan ' +
          '`components` adalah konfigurasi efektif semester. 404 `not_found` bila semester bukan milik sekolah ini.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: semesterGradingStatusSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await requireSemester(tx, request.params.id);
        return semesterStatusView(tx, ctx.schoolId, request.params.id);
      });
    },
  );

  app.post(
    '/v1/semesters/:id/grading-config/sync',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Terapkan pengaturan nilai terkini ke satu semester',
        description:
          'Izin: `grade:configure`; modul `grades`. Menimpa salinan beku semester dengan konfigurasi hidup saat ini ' +
          '(membuatnya bila belum ada; asal `sync`). Untuk mengoreksi semester lama: buka kembali rapor semua kelasnya, ' +
          'sinkronkan, lalu finalkan lagi. Ditolak 409 `report_final` selama semester itu masih punya rapor final ' +
          '(pesan menyebut kelasnya). Idempoten: bila salinan sudah sama dengan konfigurasi hidup tidak ada yang ditulis ' +
          'dan `changed` false. Diaudit (`grading_config.sync`) dan bergantian dengan finalisasi rapor per sekolah (kunci ' +
          'bersama). 404 `not_found` bila semester bukan milik sekolah ini. Respons sama dengan ' +
          '`GET /v1/semesters/{id}/grading-config` ditambah `changed`.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: semesterGradingStatusSchema.extend({
            changed: z.boolean().describe('Salinan ditulis (dibuat atau berubah isinya)'),
          }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await requireSemester(tx, request.params.id);
        const { changed } = await syncSemesterGradingConfig(tx, ctx, request.params.id);
        return { ...(await semesterStatusView(tx, ctx.schoolId, request.params.id)), changed };
      });
    },
  );

  app.put(
    '/v1/grading/settings',
    {
      onRequest: configureGate,
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan penilaian',
        description:
          'Izin: `grade:configure`; modul `grades`. `kkm` bilangan bulat 1..100 (desimal ditolak; KKM desimal lewat ' +
          'KKTP per mapel); batas predikat harus berurutan `predicateA` > `predicateB` > `predicateC` > 0 (selain itu ' +
          '400 galat validasi). `calculationMode` opsional (`weighted_average` bawaan, `percentage`, `simple_average`; rumus di skema); bila dihilangkan, nilai yang ada ' +
          'dipertahankan. Memilih `percentage` ditolak 400 `weights_sum_invalid` bila jumlah bobot komponen bukan 100 (mode lain tidak ' +
          'memeriksa jumlah bobot; bila `calculationMode` dihilangkan, jumlah bobot tidak diperiksa). ' +
          'Ditolak 409 `report_final` selama semester aktif punya rapor final (buka kembali rapornya lebih dulu).' +
          ' Aturan tulis-tembus: bila semester aktif punya salinan konfigurasi beku, tidak punya rapor final, dan salinannya bukan kunci manual, ' +
          'salinan itu ikut ditulis ulang dari konfigurasi hidup di transaksi yang sama, dicatat di audit (`grading_config.sync`), dan respons membawa ' +
          '`syncedSemesterId` (dihilangkan bila tidak ada yang disinkronkan). Semester nonaktif yang beku tidak pernah berubah oleh perubahan ini. ' +
          'Penulisan konfigurasi bergantian dengan finalisasi rapor per sekolah (kunci bersama).',
        headers: schoolHeader,
        body: settingsBody,
        response: { 200: settingsWriteSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await lockGradingConfig(tx, ctx.schoolId);
        if (request.body.calculationMode === 'percentage') {
          const sum = (await loadComponents(tx)).reduce((n, c) => n + c.weight, 0);
          if (sum !== 100) {
            throw new HttpError(
              400,
              'weights_sum_invalid',
              `Mode persentase mensyaratkan jumlah bobot komponen tepat 100 (sekarang ${sum}). Sesuaikan bobot komponen lebih dulu.`,
            );
          }
        }
        await assertLiveGradingConfigEditable(tx, ctx.schoolId);
        await tx
          .insert(gradingSetting)
          .values({ schoolId: ctx.schoolId, ...request.body })
          .onConflictDoUpdate({
            target: gradingSetting.schoolId,
            set: { ...request.body, updatedAt: new Date() },
          });
        await audit(tx, ctx, 'grading.settings_update', 'grading_setting', ctx.schoolId, request.body);
        const synced = await syncActiveSemesterFreeze(tx, ctx);
        return { ...(await loadSettings(tx)), ...(synced ? { syncedSemesterId: synced } : {}) };
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
          '`assessmentCount` = jumlah penilaian yang memakainya. Pemakaian bobot bergantung mode nilai akhir: dinormalisasi pada ' +
          '`weighted_average`, diabaikan pada `simple_average`, dan harus berjumlah 100 pada `percentage`.',
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
          'Izin: `grade:configure`; modul `grades`. Nama unik di sekolah (409 `conflict`). `weight` 1..100. Jumlah bobot ' +
          'tidak harus 100 pada mode `weighted_average` (dinormalisasi saat nilai akhir dihitung) dan `simple_average` (bobot ' +
          'diabaikan), tetapi mode `percentage` mensyaratkan jumlah 100 (dicek saat memilih mode itu di `PUT /v1/grading/settings`; ' +
          'bobot yang diubah sesudahnya tidak diperiksa ulang, hasil `percentage` tetap dibatasi 0..100). ' +
          '`sort` bawaan: paling akhir. Tidak dijaga `report_final` (komponen baru belum punya penilaian, jadi tidak mengubah angka yang ada).' +
          ' Aturan tulis-tembus: bila semester aktif punya salinan konfigurasi beku, tidak punya rapor final, dan salinannya bukan kunci manual, ' +
          'salinan itu ikut ditulis ulang dari konfigurasi hidup di transaksi yang sama, dicatat di audit (`grading_config.sync`), dan respons membawa ' +
          '`syncedSemesterId` (dihilangkan bila tidak ada yang disinkronkan). Semester nonaktif yang beku tidak pernah berubah oleh perubahan ini. ' +
          'Penulisan konfigurasi bergantian dengan finalisasi rapor per sekolah (kunci bersama).',
        headers: schoolHeader,
        body: componentBody,
        response: { 201: componentWriteSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama komponen itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await lockGradingConfig(tx, ctx.schoolId);
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
          const synced = await syncActiveSemesterFreeze(tx, ctx);
          const view = (await componentViews(tx)).find((c) => c.id === row!.id)!;
          return synced ? { ...view, syncedSemesterId: synced } : view;
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
          'Mengubah bobot langsung memengaruhi nilai akhir semua penilaian yang ada, jadi ditolak 409 ' +
          '`report_final` selama semester aktif punya rapor final. Bobot tidak dinormalisasi pada mode `percentage`; jumlahnya ' +
          'diperiksa saat mode itu dipilih, bukan di sini.' +
          ' Aturan tulis-tembus: bila semester aktif punya salinan konfigurasi beku, tidak punya rapor final, dan salinannya bukan kunci manual, ' +
          'salinan itu ikut ditulis ulang dari konfigurasi hidup di transaksi yang sama, dicatat di audit (`grading_config.sync`), dan respons membawa ' +
          '`syncedSemesterId` (dihilangkan bila tidak ada yang disinkronkan). Semester nonaktif yang beku tidak pernah berubah oleh perubahan ini. ' +
          'Penulisan konfigurasi bergantian dengan finalisasi rapor per sekolah (kunci bersama).',
        headers: schoolHeader,
        params: idParams,
        body: componentBody,
        response: {
          200: componentWriteSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
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
          await assertLiveGradingConfigEditable(tx, ctx.schoolId);
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
          const synced = await syncActiveSemesterFreeze(tx, ctx);
          const view = (await componentViews(tx)).find((c) => c.id === request.params.id)!;
          return synced ? { ...view, syncedSemesterId: synced } : view;
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
          '`not_found` bila tak ada. Tidak dijaga `report_final` (komponen yang dipakai penilaian tak bisa dihapus).' +
          ' Aturan tulis-tembus: bila semester aktif punya salinan konfigurasi beku, tidak punya rapor final, dan salinannya bukan kunci manual, ' +
          'salinan itu ikut ditulis ulang dari konfigurasi hidup di transaksi yang sama, dicatat di audit (`grading_config.sync`), dan respons membawa ' +
          '`syncedSemesterId` (dihilangkan bila tidak ada yang disinkronkan). Semester nonaktif yang beku tidak pernah berubah oleh perubahan ini. ' +
          'Penulisan konfigurasi bergantian dengan finalisasi rapor per sekolah (kunci bersama).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: okSynced, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        await lockGradingConfig(tx, ctx.schoolId);
        const [current] = await tx.select().from(gradeComponent).where(eq(gradeComponent.id, id));
        if (!current) throw notFound('Komponen');
        const [used] = await tx.select({ n: count() }).from(assessment).where(eq(assessment.componentId, id));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Komponen ini sudah dipakai penilaian; ubah saja bobotnya.');
        }
        await tx.delete(gradeComponent).where(eq(gradeComponent.id, id));
        await audit(tx, ctx, 'grading.component_delete', 'grade_component', id, { name: current.name });
        const synced = await syncActiveSemesterFreeze(tx, ctx);
        return { ok: true as const, ...(synced ? { syncedSemesterId: synced } : {}) };
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
          'hanya bila sekolah belum punya komponen; selain itu 409 `not_empty`. Tidak dijaga `report_final`. Bila aturan ' +
          'tulis-tembus berjalan (semester aktif beku tanpa rapor final), id semesternya dikirim di header respons `x-synced-semester-id` ' +
          '(badan respons berupa larik, jadi tidak ada tempat untuk `syncedSemesterId`).',
        headers: schoolHeader,
        response: { 201: z.array(componentSchema), 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      let synced: string | null = null;
      const created = await tenant(request, async (tx) => {
        await lockGradingConfig(tx, ctx.schoolId);
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
        synced = await syncActiveSemesterFreeze(tx, ctx);
        return componentViews(tx);
      });
      if (synced) reply.header('x-synced-semester-id', synced);
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
          'menghitung siswa aktif dan lulusan kelas.',
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
          'semester sama tahun ajarannya dengan kelas (400 `invalid_reference`). `maxScore` 1..1000 (bawaan 100). ' +
          'Ditolak 409 `report_final` bila rapor kelas pada semester itu sudah final. Ditolak 409 `component_not_in_semester` ' +
          'bila konfigurasi nilai semester itu sudah dibekukan dan komponennya tidak ada di salinan beku (mis. komponen yang ' +
          'dibuat sesudah pembekuan); semester yang belum beku menerima komponen apa pun milik sekolah.',
        headers: schoolHeader,
        body: assessmentBody,
        response: { 201: assessmentSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const created = await tenant(request, async (tx) => {
        await requireRefs(tx, b);
        if (!(await canInputPair(tx, ctx, b.classId, b.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, b.semesterId, b.classId);
        await assertComponentInSemester(tx, b.semesterId, b.componentId);
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
          'skor yang sudah diisi (409 `score_exceeds_max`). Komponen harus milik sekolah ini (400 `invalid_reference`). ' +
          'Ditolak 409 `report_final` bila rapor kelas pada semester itu sudah final. Mengganti komponen ditolak 409 ' +
          '`component_not_in_semester` bila semester itu beku dan komponen baru tidak ada di salinan beku (komponen yang tidak ' +
          'diganti tidak diperiksa ulang).',
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
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
        await requireComponent(tx, b.componentId);
        if (b.componentId !== current.componentId) {
          await assertComponentInSemester(tx, current.semesterId, b.componentId);
        }
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
          'itu 403). Seluruh skor penilaian itu ikut terhapus. Ditolak 409 `report_final` bila rapor kelas pada ' +
          'semester itu sudah final.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
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
          'Izin: `grade:read`; modul `grades`. Roster siswa aktif dan lulusan kelas penilaian (urut nama) dengan skor ' +
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
        const { rows } = await historicalRosterOf(tx, current.classId);
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
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const current = await loadAssessment(tx, request.params.id);
        if (!(await canInputPair(tx, ctx, current.classId, current.subjectId))) throw notAllowed();
        await assertClassReportNotFinal(tx, current.semesterId, current.classId);
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
          'Izin: `grade:read`; modul `grades`. Per siswa aktif dan lulusan: rata-rata persen tiap komponen, nilai akhir ' +
          '(rata-rata tertimbang; bobot dinormalisasi atas komponen yang punya skor), predikat, dan `belowKkm`. ' +
          '`belowKkm` dan `belowKkmCount` memakai KKM efektif mapel (`kkm`, dari KKTP bila ada, selain itu `settings.kkm`). ' +
          '`stats` merangkum siswa yang sudah punya nilai akhir. Semester/kelas/mapel harus milik sekolah ini ' +
          '(400 `invalid_reference`); pengguna selain pemegang configure/kepala sekolah/kurikulum hanya untuk ' +
          'kelas+mapel yang ia ampu (403). Siswa yang rapornya FINAL pada kelas ini memakai angka snapshot rapor ' +
          '(`final`, `predicate`, `belowKkm`; `kkm` mapel dari snapshot) dan diberi `source: report`; `source` di tingkat ' +
          'atas muncul bila ada yang demikian. Siswa tanpa rapor final dihitung dari konfigurasi efektif semester ' +
          '(salinan beku bila ada). Tanpa rapor final, respons tidak membawa `source`.',
        headers: schoolHeader,
        querystring: scopeQuery,
        response: {
          200: z.object({
            settings: settingsSchema,
            kkm: z
              .number()
              .optional()
              .describe('KKM efektif mapel ini (KKTP kelas/tingkat, jatuh ke KKM sekolah), desimal'),
            components: z.array(z.object({ id: z.uuid(), name: z.string(), weight: z.number().int() })),
            source: reportSource,
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                perComponent: z.array(z.object({ componentId: z.uuid(), average: z.number().nullable() })),
                final: z.number().nullable(),
                predicate: predicateEnum.nullable(),
                belowKkm: z.boolean(),
                source: reportSource,
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

        const cfg = await loadGradingConfig(tx, semesterId);
        const { settings, components } = cfg;
        const { rows } = await historicalRosterOf(tx, classId);
        const grades = await computeGrades(tx, {
          semesterId,
          classId,
          subjectIds: [subjectId],
          studentIds: rows.map((s) => s.id),
          components,
          settings,
        });
        const bySubject = grades.get(subjectId)!;
        const liveKkm = (await kkmResolverForClass(tx, cfg, { classId, subjectIds: [subjectId] }))(subjectId);
        // Tumpangan snapshot (I3): siswa dengan rapor final pada kelas ini memakai angka terbit.
        const snapshots = await finalSubjectRows(tx, semesterId, classId);
        let reportKkm = null as number | null;
        const students = rows.map((s) => {
          const g = bySubject.get(s.id)!;
          const snap = snapshots.get(s.id)?.find((r) => r.subjectId === subjectId);
          if (snap) {
            reportKkm ??= snap.kkm;
            return {
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              perComponent: g.perComponent,
              final: snap.final,
              predicate: snap.predicate,
              belowKkm: snap.belowKkm,
              source: 'report' as const,
            };
          }
          return {
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            perComponent: g.perComponent,
            final: g.final,
            predicate: g.predicate,
            belowKkm: g.final !== null && g.final < liveKkm,
          };
        });
        const kkm = reportKkm ?? liveKkm;
        const finals = students.flatMap((s) => (s.final === null ? [] : [s.final]));
        return {
          settings,
          kkm,
          ...(reportKkm !== null ? { source: 'report' as const } : {}),
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
          'itu 403). Semester/kelas harus milik sekolah ini (400 `invalid_reference`). Siswa yang rapornya FINAL pada ' +
          'kelas ini memakai `final` dan `predicate` dari snapshot rapor dan diberi `source: report` (mapel yang tidak ada ' +
          'di snapshot siswa itu dihitung dari konfigurasi efektif); `source` di tingkat atas muncul bila ada yang demikian.',
        headers: schoolHeader,
        querystring: z.object({ semesterId: z.uuid(), classId: z.uuid() }),
        response: {
          200: z.object({
            subjects: z.array(z.object({ id: z.uuid(), name: z.string() })),
            source: reportSource,
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                source: reportSource,
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

        const { settings, components } = await loadGradingConfig(tx, semesterId);
        const { rows } = await historicalRosterOf(tx, classId);
        const grades = await computeGrades(tx, {
          semesterId,
          classId,
          subjectIds: subjects.map((s) => s.id),
          studentIds: rows.map((s) => s.id),
          components,
          settings,
        });
        const snapshots = await finalSubjectRows(tx, semesterId, classId);
        const students = rows.map((s) => {
          const snapRows = snapshots.get(s.id);
          let fromReport = false;
          const cells = subjects.map((sub) => {
            const snap = snapRows?.find((r) => r.subjectId === sub.id);
            if (snap) {
              fromReport = true;
              return { subjectId: sub.id, final: snap.final, predicate: snap.predicate };
            }
            const g = grades.get(sub.id)!.get(s.id)!;
            return { subjectId: sub.id, final: g.final, predicate: g.predicate };
          });
          return {
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            ...(fromReport ? { source: 'report' as const } : {}),
            grades: cells,
          };
        });
        return {
          subjects,
          ...(students.some((s) => s.source === 'report') ? { source: 'report' as const } : {}),
          students,
        };
      });
    },
  );
}
