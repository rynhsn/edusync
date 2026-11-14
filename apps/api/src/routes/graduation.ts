import {
  GRADUATION_REPORT_SCOPES,
  GRADUATION_RESULTS,
  GRADUATION_ROUNDINGS,
  GRADUATION_STATUSES,
  type GraduationConfig,
  graduationConfigSchema,
  renderNumberTemplate,
  SCHOOL_EXAM_FORMS,
  validateNumberTemplate,
} from '@edusync/contracts';
import {
  and,
  asc,
  councilMeeting,
  eq,
  graduationDecision,
  graduationPolicy,
  inArray,
  isNull,
  promotionDecision,
  school,
  schoolExam,
  schoolExamScore,
  sql,
  subject,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { meetingFinalError } from '../council-meeting-lib';
import {
  appliedPromotionOf,
  assertGraduationNotFinal,
  buildGraduationList,
  type DecisionRow,
  graduationFinalError,
  inOrder,
  loadFinalClasses,
  loadFinalRoster,
  loadPolicy,
  loadYear,
  type PolicyRow,
  parseConfig,
  policySnapshot,
  scoreStudents,
} from '../graduation-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { loadReportSettings } from '../report-card-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

/**
 * Kelulusan (fase 3C.4): kebijakan per tahun ajaran, ujian satuan pendidikan, saran nilai kelulusan, penetapan oleh sekolah dengan
 * transkrip beku, nomor SKL/ijazah, dan pengisian keputusan kenaikan. Sekolah tanpa kebijakan tidak terpengaruh. Status murid
 * `graduated` TIDAK diubah di sini: modul ini hanya menulis `promotion_decision`; status berubah di penerapan kenaikan.
 */

const tag = ['Academic'];
const MODULE = 'grades';
const readGate = [requirePermission('graduation:read'), requireModule(MODULE)];
const writeGate = [requirePermission('graduation:manage'), requireModule(MODULE)];

const bad = (code: string, message: string) => new HttpError(400, code, message);
const invalidRef = (message: string) => bad('invalid_reference', message);
const noPolicy = () =>
  new HttpError(
    409,
    'no_graduation_policy',
    'Tahun ajaran ini belum punya kebijakan kelulusan. Atur kriteria kelulusan lebih dulu.',
  );

/** Kunci yang sama dengan penyimpanan/penerapan keputusan kenaikan: penetapan dan wizard berjalan bergantian per tahun sumber. */
const lockPromotion = (tx: Tx, yearId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`promotion:${yearId}`}))`);
const lockGraduation = (tx: Tx, yearId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`graduation:${yearId}`}))`);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/* ---------- Skema respons ---------- */

const policyView = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  config: graduationConfigSchema,
  sklNumberTemplate: z.string().nullable(),
  announceOn: z.iso.date().nullable(),
  updatedAt: z.string(),
});

const subjectResult = z.object({
  subjectId: z.uuid(),
  name: z.string(),
  report: z.number().nullable().describe('Rata-rata nilai rapor mapel dari snapshot rapor final'),
  exams: z.array(z.object({ examId: z.uuid(), value: z.number().nullable() })),
  final: z
    .number()
    .nullable()
    .describe('Nilai kelulusan mapel (rata-rata tertimbang komponen berbobot yang bernilai)'),
  missing: z.array(z.string()).describe('Komponen berbobot yang belum bernilai: `report` atau id ujian'),
});

const scoringShape = {
  subjects: z.array(subjectResult),
  average: z.number().nullable(),
  meetsCriteria: z.boolean().describe('SARAN: memenuhi ambang kebijakan; penetapan tetap oleh sekolah'),
  failures: z.array(
    z.object({
      code: z.enum(['below_average', 'below_subject', 'required_missing', 'no_scores']),
      subjectId: z.uuid().optional(),
    }),
  ),
  incomplete: z.boolean().describe('Ada mapel dengan komponen berbobot yang belum bernilai'),
};
const semesterRef = z.object({ semesterId: z.uuid(), name: z.string(), className: z.string() });

const suggestionSchema = z.object({
  ...scoringShape,
  reportNotFinal: z
    .boolean()
    .describe(
      'Ada semester tahun kelulusan yang rapornya belum final untuk murid ini (butuh `force` saat penetapan)',
    ),
  reportSemesters: z.array(semesterRef).describe('Semester rapor final yang dipakai'),
});

const policySnapshotSchema = z.object({
  reportWeight: z.number(),
  examWeights: z.array(z.object({ examId: z.uuid(), name: z.string(), weight: z.number() })),
  reportScope: z.enum(GRADUATION_REPORT_SCOPES),
  reportLevels: z.array(z.string()),
  rounding: z.enum(GRADUATION_ROUNDINGS),
  minAverage: z.number().nullable(),
  minSubjectScore: z.number().nullable(),
  requiredSubjectIds: z.array(z.uuid()),
  criteriaText: z.string().nullable(),
});

const transcriptSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  policy: policySnapshotSchema,
  reportSemesters: z.array(semesterRef),
  ...scoringShape,
  forced: z
    .object({ reason: z.string() })
    .optional()
    .describe('Ada bila difinalkan dengan `force` (alasan wajib)'),
});

const decisionView = z.object({
  result: z.enum(GRADUATION_RESULTS).nullable(),
  status: z.enum(GRADUATION_STATUSES),
  graduatedOn: z.iso.date().nullable(),
  sklNumber: z.string().nullable(),
  diplomaNumber: z.string().nullable(),
  note: z.string().nullable(),
  meetingId: z
    .uuid()
    .optional()
    .describe('Berita acara yang membahas keputusan ini (ada hanya bila tertaut)'),
  finalizedAt: z.string().nullable(),
  promotionApplied: z
    .boolean()
    .describe('Keputusan kenaikan murid ini sudah diterapkan: penetapan tidak bisa dibuka kembali'),
});

const examView = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  name: z.string(),
  form: z.enum(SCHOOL_EXAM_FORMS),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  scoreCount: z.number().int().describe('Jumlah nilai terisi'),
  weight: z.number().nullable().describe('Bobot pada kebijakan tahun itu; null bila belum berbobot'),
});

/* ---------- Pembantu ---------- */

function viewPolicy(p: PolicyRow) {
  return {
    id: p.id,
    academicYearId: p.academicYearId,
    config: parseConfig(p.config),
    sklNumberTemplate: p.sklNumberTemplate,
    announceOn: p.announceOn,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function viewDecision(d: DecisionRow, promotionApplied: boolean) {
  return {
    result: d.result,
    status: d.status,
    graduatedOn: d.graduatedOn,
    sklNumber: d.sklNumber,
    diplomaNumber: d.diplomaNumber,
    note: d.note,
    ...(d.meetingId ? { meetingId: d.meetingId } : {}),
    finalizedAt: d.finalizedAt ? d.finalizedAt.toISOString() : null,
    promotionApplied,
  };
}

async function requirePolicy(tx: Tx, yearId: string) {
  const policy = await loadPolicy(tx, yearId);
  if (!policy) throw noPolicy();
  return policy;
}

/** Ujian yang dirujuk dan mapel wajib pada kebijakan harus ada di sekolah ini dan (ujian) pada tahun itu. */
async function validateConfig(tx: Tx, yearId: string, config: GraduationConfig) {
  const examIds = Object.keys(config.examWeights);
  if (examIds.length > 0) {
    const rows = await tx
      .select({ id: schoolExam.id })
      .from(schoolExam)
      .where(and(eq(schoolExam.academicYearId, yearId), inArray(schoolExam.id, examIds)));
    if (rows.length !== examIds.length)
      throw invalidRef('Ada ujian pada bobot yang bukan ujian tahun ajaran ini.');
  }
  if (config.requiredSubjectIds.length > 0) {
    const rows = await tx
      .select({ id: subject.id })
      .from(subject)
      .where(inArray(subject.id, config.requiredSubjectIds));
    if (rows.length !== new Set(config.requiredSubjectIds).size)
      throw invalidRef('Ada mapel wajib yang tidak ditemukan.');
  }
}

/** Nomor (SKL atau ijazah) tidak boleh dipakai keputusan murid lain di sekolah ini. */
async function assertNumbersFree(
  tx: Tx,
  numbers: { studentId: string; skl?: string | null; diploma?: string | null }[],
) {
  const skl = numbers.flatMap((n) => (n.skl ? [n.skl] : []));
  const dip = numbers.flatMap((n) => (n.diploma ? [n.diploma] : []));
  for (const [list, kind] of [
    [skl, 'SKL'],
    [dip, 'ijazah'],
  ] as const) {
    if (new Set(list).size !== list.length) {
      throw new HttpError(409, 'number_taken', `Nomor ${kind} ganda dalam permintaan yang sama.`);
    }
  }
  if (skl.length === 0 && dip.length === 0) return;
  const rows = await tx
    .select({
      studentId: graduationDecision.studentId,
      skl: graduationDecision.sklNumber,
      diploma: graduationDecision.diplomaNumber,
    })
    .from(graduationDecision)
    .where(
      sql`(${skl.length ? inArray(graduationDecision.sklNumber, skl) : sql`false`}) or (${
        dip.length ? inArray(graduationDecision.diplomaNumber, dip) : sql`false`
      })`,
    );
  for (const r of rows) {
    const bySkl = r.skl ? numbers.find((n) => n.skl === r.skl) : undefined;
    if (bySkl && bySkl.studentId !== r.studentId) {
      throw new HttpError(409, 'number_taken', `Nomor SKL ${r.skl} sudah dipakai murid lain.`);
    }
    const byDiploma = r.diploma ? numbers.find((n) => n.diploma === r.diploma) : undefined;
    if (byDiploma && byDiploma.studentId !== r.studentId) {
      throw new HttpError(409, 'number_taken', `Nomor ijazah ${r.diploma} sudah dipakai murid lain.`);
    }
  }
}

async function meetingsOf(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  return new Map(
    (unique.length
      ? await tx
          .select({
            id: councilMeeting.id,
            status: councilMeeting.status,
            academicYearId: councilMeeting.academicYearId,
            heldOn: councilMeeting.heldOn,
          })
          .from(councilMeeting)
          .where(inArray(councilMeeting.id, unique))
      : []
    ).map((m) => [m.id, m]),
  );
}

const namesText = (names: string[]) =>
  names.length > 5 ? `${names.slice(0, 5).join(', ')}, dan ${names.length - 5} lainnya` : names.join(', ');

/* ---------- Route ---------- */

export async function graduationRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ----- Kebijakan ----- */

  app.get(
    '/v1/academic-years/:id/graduation-policy',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Kebijakan kelulusan satu tahun ajaran',
        description:
          'Izin: `graduation:read`; modul `grades`. `policy` null = sekolah tidak memakai alur kelulusan formal untuk tahun itu ' +
          '(keputusan `graduate` di wizard kenaikan berlaku seperti biasa). Bobot, ambang, dan mapel wajib sepenuhnya diatur sekolah.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.object({ policy: policyView.nullable() }), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        const policy = await loadPolicy(tx, year.id);
        return { policy: policy ? viewPolicy(policy) : null };
      }),
  );

  app.put(
    '/v1/academic-years/:id/graduation-policy',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Simpan kebijakan kelulusan tahun ajaran',
        description:
          'Izin: `graduation:manage`; modul `grades`. Membuat atau mengganti kebijakan: `config` (`reportWeight`, `examWeights` per id ' +
          'ujian satuan pendidikan, `reportScope` `final_level`/`all_levels`/`levels` + `reportLevels`, `rounding`, `minAverage`, ' +
          '`minSubjectScore`, `requiredSubjectIds`, `criteriaText`), `sklNumberTemplate` (mis. `{seq:3}/SKL/{year}`; wajib memuat ' +
          '`{seq}`) dan `announceOn`. Bobot dinormalkan (yang dipakai porsinya terhadap jumlah bobot). Adanya kebijakan menyalakan ' +
          'alur kelulusan formal: keputusan `graduate` di wizard kenaikan hanya berlaku bila ditetapkan di sini. ' +
          '400 `invalid_reference`: ujian bukan milik tahun itu atau mapel wajib tidak ada; 400 `invalid_template`. ' +
          '409 `graduation_final`: sudah ada penetapan final tahun itu.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          config: graduationConfigSchema,
          sklNumberTemplate: nullableText(80),
          announceOn: z.iso.date().nullable().optional(),
        }),
        response: { 200: policyView, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Kebijakan kelulusan bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const year = await loadYear(tx, request.params.id);
          await lockGraduation(tx, year.id);
          await assertGraduationNotFinal(tx, year.id);
          if (b.sklNumberTemplate) {
            const issue = validateNumberTemplate(b.sklNumberTemplate);
            if (issue)
              throw bad(
                'invalid_template',
                'Templat nomor SKL harus memuat {seq} dan hanya memakai {seq}, {seq:N}, {year}.',
              );
          }
          await validateConfig(tx, year.id, b.config);
          const values = {
            config: b.config,
            sklNumberTemplate: b.sklNumberTemplate ?? null,
            announceOn: b.announceOn ?? null,
            updatedAt: new Date(),
          };
          const existing = await loadPolicy(tx, year.id);
          let row: PolicyRow;
          if (existing) {
            [row] = (await tx
              .update(graduationPolicy)
              .set(values)
              .where(eq(graduationPolicy.id, existing.id))
              .returning()) as [PolicyRow];
          } else {
            [row] = (await tx
              .insert(graduationPolicy)
              .values({ schoolId: ctx.schoolId, academicYearId: year.id, ...values })
              .returning()) as [PolicyRow];
          }
          await audit(tx, ctx, 'graduation.policy_save', 'academic_year', year.id, { created: !existing });
          return viewPolicy(row);
        }),
      );
    },
  );

  app.delete(
    '/v1/academic-years/:id/graduation-policy',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Hapus kebijakan kelulusan (kembali ke alur kenaikan lama)',
        description:
          'Izin: `graduation:manage`; modul `grades`. Menghapus kebijakan tahun itu beserta DRAF keputusan kelulusan; sekolah kembali ke ' +
          'alur lama (keputusan `graduate` di wizard berlaku seperti biasa). Ujian dan nilai ujian tidak dihapus. ' +
          '409 `graduation_final`: ada penetapan final; buka kembali lebih dulu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        await lockGraduation(tx, year.id);
        await assertGraduationNotFinal(tx, year.id);
        const policy = await requirePolicy(tx, year.id);
        await tx.delete(graduationDecision).where(eq(graduationDecision.academicYearId, year.id));
        await tx.delete(graduationPolicy).where(eq(graduationPolicy.id, policy.id));
        await audit(tx, ctx, 'graduation.policy_delete', 'academic_year', year.id, {});
      });
      return { ok: true as const };
    },
  );

  /* ----- Ujian satuan pendidikan ----- */

  const examBody = z
    .object({
      name: z.string().trim().min(1).max(120),
      form: z.enum(SCHOOL_EXAM_FORMS),
      startsOn: z.iso.date().nullable().optional(),
      endsOn: z.iso.date().nullable().optional(),
    })
    .refine((b) => !b.startsOn || !b.endsOn || b.startsOn <= b.endsOn, {
      message: 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai',
      path: ['endsOn'],
    });

  async function viewExams(tx: Tx, yearId: string, rows: (typeof schoolExam.$inferSelect)[]) {
    if (rows.length === 0) return [];
    const counts = new Map(
      (
        await tx
          .select({ id: schoolExamScore.examId, n: sql<number>`count(${schoolExamScore.value})::int` })
          .from(schoolExamScore)
          .where(
            inArray(
              schoolExamScore.examId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(schoolExamScore.examId)
      ).map((r) => [r.id, r.n]),
    );
    const policy = await loadPolicy(tx, yearId);
    const weights = policy ? parseConfig(policy.config).examWeights : {};
    return rows.map((r) => ({
      id: r.id,
      academicYearId: r.academicYearId,
      name: r.name,
      form: r.form as (typeof SCHOOL_EXAM_FORMS)[number],
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      scoreCount: counts.get(r.id) ?? 0,
      weight: weights[r.id] ?? null,
    }));
  }

  async function loadExam(tx: Tx, id: string) {
    const [row] = await tx.select().from(schoolExam).where(eq(schoolExam.id, id));
    if (!row) throw new HttpError(404, 'not_found', 'Ujian tidak ditemukan.');
    return row;
  }

  app.get(
    '/v1/academic-years/:id/school-exams',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar ujian satuan pendidikan satu tahun ajaran',
        description:
          'Izin: `graduation:read`; modul `grades`. Ujian dengan jumlah nilai terisi dan bobotnya pada kebijakan tahun itu (null bila belum berbobot).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.object({ items: z.array(examView) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        const rows = await tx
          .select()
          .from(schoolExam)
          .where(eq(schoolExam.academicYearId, year.id))
          .orderBy(asc(schoolExam.createdAt));
        return { items: await viewExams(tx, year.id, rows) };
      }),
  );

  app.post(
    '/v1/academic-years/:id/school-exams',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Buat ujian satuan pendidikan',
        description:
          'Izin: `graduation:manage`; modul `grades`. Nama dan bentuk (`written`, `practical`, `portfolio`, `assignment`, `project`, `other`) ' +
          'bebas dipilih sekolah; tidak ada kaitan ke asesmen nasional. 409 `graduation_final`: sudah ada penetapan final tahun itu.',
        headers: schoolHeader,
        params: idParams,
        body: examBody,
        response: { 201: examView, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const view = await tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        await assertGraduationNotFinal(tx, year.id);
        const [row] = await tx
          .insert(schoolExam)
          .values({
            schoolId: ctx.schoolId,
            academicYearId: year.id,
            name: b.name,
            form: b.form,
            startsOn: b.startsOn ?? null,
            endsOn: b.endsOn ?? null,
          })
          .returning();
        await audit(tx, ctx, 'school_exam.create', 'school_exam', (row as { id: string }).id, {
          name: b.name,
        });
        return (await viewExams(tx, year.id, [row as typeof schoolExam.$inferSelect]))[0];
      });
      return reply.code(201).send(view as NonNullable<typeof view>);
    },
  );

  app.put(
    '/v1/school-exams/:id',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Ubah ujian satuan pendidikan',
        description:
          'Izin: `graduation:manage`; modul `grades`. 409 `graduation_final`: sudah ada penetapan final tahun itu.',
        headers: schoolHeader,
        params: idParams,
        body: examBody,
        response: { 200: examView, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const exam = await loadExam(tx, request.params.id);
        await assertGraduationNotFinal(tx, exam.academicYearId);
        const [row] = await tx
          .update(schoolExam)
          .set({
            name: b.name,
            form: b.form,
            startsOn: b.startsOn ?? null,
            endsOn: b.endsOn ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schoolExam.id, exam.id))
          .returning();
        await audit(tx, ctx, 'school_exam.update', 'school_exam', exam.id, {});
        return (await viewExams(tx, exam.academicYearId, [row as typeof schoolExam.$inferSelect]))[0];
      });
    },
  );

  app.delete(
    '/v1/school-exams/:id',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Hapus ujian satuan pendidikan beserta nilainya',
        description:
          'Izin: `graduation:manage`; modul `grades`. 409 `exam_in_use`: ujian masih berbobot pada kebijakan kelulusan (hapus dari bobot ' +
          'lebih dulu). 409 `graduation_final`: sudah ada penetapan final tahun itu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const exam = await loadExam(tx, request.params.id);
        await assertGraduationNotFinal(tx, exam.academicYearId);
        const policy = await loadPolicy(tx, exam.academicYearId);
        if (policy && exam.id in parseConfig(policy.config).examWeights) {
          throw new HttpError(
            409,
            'exam_in_use',
            'Ujian ini masih berbobot pada kebijakan kelulusan. Hapus dari bobot lebih dulu.',
          );
        }
        await tx.delete(schoolExamScore).where(eq(schoolExamScore.examId, exam.id));
        await tx.delete(schoolExam).where(eq(schoolExam.id, exam.id));
        await audit(tx, ctx, 'school_exam.delete', 'school_exam', exam.id, { name: exam.name });
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/school-exams/:id/scores',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Nilai ujian satuan pendidikan: murid kelas tingkat akhir x mapel',
        description:
          'Izin: `graduation:read`; modul `grades`. Daftar murid kelas tingkat akhir tahun ujian itu, mapel sekolah, dan nilai terisi ' +
          '(`value` 0-100). `locked` true bila sudah ada penetapan final tahun itu (nilai tidak bisa diubah).',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            exam: z.object({ id: z.uuid(), academicYearId: z.uuid(), name: z.string(), form: z.string() }),
            locked: z.boolean(),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                className: z.string(),
              }),
            ),
            subjects: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
            scores: z.array(
              z.object({
                studentId: z.uuid(),
                subjectId: z.uuid(),
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
    async (request) =>
      tenant(request, async (tx) => {
        const exam = await loadExam(tx, request.params.id);
        const classes = await loadFinalClasses(tx, exam.academicYearId);
        const roster = await loadFinalRoster(tx, exam.academicYearId, classes);
        const [subjects, scores, [finalRow]] = await inOrder(
          tx
            .select({ id: subject.id, code: subject.code, name: subject.name })
            .from(subject)
            .where(eq(subject.active, true))
            .orderBy(asc(subject.sortOrder), asc(subject.name)),
          tx.select().from(schoolExamScore).where(eq(schoolExamScore.examId, exam.id)),
          tx
            .select({ id: graduationDecision.id })
            .from(graduationDecision)
            .where(
              and(
                eq(graduationDecision.academicYearId, exam.academicYearId),
                eq(graduationDecision.status, 'final'),
              ),
            )
            .limit(1),
        );
        return {
          exam: { id: exam.id, academicYearId: exam.academicYearId, name: exam.name, form: exam.form },
          locked: !!finalRow,
          students: roster.map((r) => ({
            studentId: r.studentId,
            name: r.name,
            nis: r.nis,
            className: r.className,
          })),
          subjects,
          scores: scores.map((s) => ({
            studentId: s.studentId,
            subjectId: s.subjectId,
            value: s.value,
            note: s.note,
          })),
        };
      }),
  );

  app.put(
    '/v1/school-exams/:id/scores',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Simpan nilai ujian satuan pendidikan (batch)',
        description:
          'Izin: `graduation:manage`; modul `grades`. Upsert nilai per (murid, mapel); `value` null tanpa `note` menghapus nilai. Hanya murid ' +
          'kelas tingkat akhir tahun ujian itu. Semua atau tidak sama sekali. 400 `invalid_reference`: murid bukan murid kelas tingkat akhir ' +
          'tahun itu atau mapel tidak ada; 400 `duplicate_entry`: pasangan (murid, mapel) ganda. 409 `graduation_final`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          scores: z
            .array(
              z.object({
                studentId: z.uuid(),
                subjectId: z.uuid(),
                value: z.number().min(0).max(100).nullable(),
                note: nullableText(300),
              }),
            )
            .min(1)
            .max(5000),
        }),
        response: {
          200: z.object({ saved: z.number().int(), cleared: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const items = request.body.scores;
      return tenant(request, async (tx) => {
        const exam = await loadExam(tx, request.params.id);
        await assertGraduationNotFinal(tx, exam.academicYearId);
        const keys = items.map((i) => `${i.studentId}|${i.subjectId}`);
        if (new Set(keys).size !== keys.length)
          throw bad('duplicate_entry', 'Pasangan murid dan mapel ganda dalam permintaan.');
        const classes = await loadFinalClasses(tx, exam.academicYearId);
        const roster = new Set(
          (await loadFinalRoster(tx, exam.academicYearId, classes)).map((r) => r.studentId),
        );
        if (items.some((i) => !roster.has(i.studentId))) {
          throw invalidRef('Ada murid yang bukan murid kelas tingkat akhir tahun ajaran ini.');
        }
        const subjectIds = [...new Set(items.map((i) => i.subjectId))];
        const found = await tx
          .select({ id: subject.id })
          .from(subject)
          .where(inArray(subject.id, subjectIds));
        if (found.length !== subjectIds.length) throw invalidRef('Ada mata pelajaran yang tidak ditemukan.');

        const keep = items.filter((i) => i.value !== null || (i.note ?? '') !== '');
        const drop = items.filter((i) => i.value === null && (i.note ?? '') === '');
        if (keep.length > 0) {
          await tx
            .insert(schoolExamScore)
            .values(
              keep.map((i) => ({
                schoolId: ctx.schoolId,
                examId: exam.id,
                studentId: i.studentId,
                subjectId: i.subjectId,
                value: i.value,
                note: i.note ?? null,
                updatedBy: ctx.userId,
              })),
            )
            .onConflictDoUpdate({
              target: [schoolExamScore.examId, schoolExamScore.studentId, schoolExamScore.subjectId],
              set: {
                value: sql`excluded.value`,
                note: sql`excluded.note`,
                updatedBy: sql`excluded.updated_by`,
                updatedAt: sql`now()`,
              },
            });
        }
        for (const d of drop) {
          await tx
            .delete(schoolExamScore)
            .where(
              and(
                eq(schoolExamScore.examId, exam.id),
                eq(schoolExamScore.studentId, d.studentId),
                eq(schoolExamScore.subjectId, d.subjectId),
              ),
            );
        }
        await audit(tx, ctx, 'school_exam.scores_save', 'school_exam', exam.id, {
          saved: keep.length,
          cleared: drop.length,
        });
        return { saved: keep.length, cleared: drop.length };
      });
    },
  );

  /* ----- Penetapan ----- */

  app.get(
    '/v1/academic-years/:id/graduations',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Murid tingkat akhir dengan saran nilai kelulusan dan keputusan',
        description:
          'Izin: `graduation:read`; modul `grades`. Murid kelas tingkat akhir tahun itu (tingkat akhir jurusan bila diisi, selain itu tingkat ' +
          'dengan `sort` terbesar). Murid berstatus draf/belum diputuskan membawa `suggestion`: nilai rapor dibaca HANYA dari snapshot rapor ' +
          'final (tidak pernah dihitung ulang dari data hidup), nilai ujian satuan pendidikan, nilai kelulusan per mapel dan rata-rata menurut ' +
          'bobot kebijakan, serta kegagalan kriteria; ini SARAN, sekolah yang menetapkan. `suggestion.reportNotFinal` true bila ada semester ' +
          'tahun kelulusan yang rapornya belum final. Murid yang sudah final membawa `transcript` beku (bukan `suggestion`). Filter opsional ' +
          '`classId`. 409 `no_graduation_policy`: tahun itu belum punya kebijakan.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ classId: z.uuid().optional() }),
        response: {
          200: z.object({
            academicYear: z.object({ id: z.uuid(), name: z.string() }),
            policy: policyView,
            exams: z.array(z.object({ id: z.uuid(), name: z.string(), weight: z.number() })),
            school: z.object({
              name: z.string(),
              npsn: z.string().nullable(),
              address: z.string().nullable(),
              city: z.string().nullable(),
              principal: z.object({ name: z.string(), nip: z.string().nullable() }).nullable(),
            }),
            classes: z.array(
              z.object({
                classId: z.uuid(),
                name: z.string(),
                level: z.string(),
                studentCount: z.number().int(),
                finalCount: z.number().int(),
              }),
            ),
            summary: z.object({
              total: z.number().int(),
              graduated: z.number().int(),
              notGraduated: z.number().int(),
              deferred: z.number().int(),
              undecided: z.number().int(),
              final: z.number().int(),
            }),
            students: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                nisn: z.string().nullable(),
                studentStatus: z.enum(['active', 'graduated', 'transferred', 'dropped']),
                classId: z.uuid(),
                className: z.string(),
                suggestion: suggestionSchema.optional(),
                transcript: transcriptSchema.optional(),
                decision: decisionView.nullable(),
              }),
            ),
          }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        const policy = await requirePolicy(tx, year.id);
        const config = parseConfig(policy.config);
        const list = await buildGraduationList(tx, year, config, { classId: request.query.classId });
        const [sch] = await tx.select({ name: school.name, npsn: school.npsn }).from(school);
        const settings = await loadReportSettings(tx);
        const exams = await policySnapshot(tx, year.id, config);
        const summary = {
          total: list.students.length,
          graduated: 0,
          notGraduated: 0,
          deferred: 0,
          undecided: 0,
          final: 0,
        };
        for (const s of list.students) {
          const r = s.decision?.result;
          if (r === 'graduated') summary.graduated++;
          else if (r === 'not_graduated') summary.notGraduated++;
          else if (r === 'deferred') summary.deferred++;
          else summary.undecided++;
          if (s.decision?.status === 'final') summary.final++;
        }
        return {
          academicYear: { id: year.id, name: year.name },
          policy: viewPolicy(policy),
          exams: exams.examWeights.map((e) => ({ id: e.examId, name: e.name, weight: e.weight })),
          school: {
            name: sch?.name ?? '',
            npsn: sch?.npsn ?? null,
            address: settings.address,
            city: settings.city,
            principal: settings.principalName
              ? { name: settings.principalName, nip: settings.principalNip }
              : null,
          },
          classes: list.classes.map((c) => {
            const inClass = list.students.filter((s) => s.classId === c.id);
            return {
              classId: c.id,
              name: c.name,
              level: c.level,
              studentCount: inClass.length,
              finalCount: inClass.filter((s) => s.decision?.status === 'final').length,
            };
          }),
          summary,
          students: list.students.map((s) => {
            const final = s.decision?.status === 'final' && s.decision.transcript;
            return {
              studentId: s.studentId,
              name: s.name,
              nis: s.nis,
              nisn: s.nisn,
              studentStatus: s.status,
              classId: s.classId,
              className: s.className,
              ...(final
                ? { transcript: s.decision?.transcript as z.infer<typeof transcriptSchema> }
                : {
                    suggestion: {
                      ...s.scoring.suggestion,
                      reportNotFinal: s.scoring.reportNotFinal,
                      reportSemesters: s.scoring.reportSemesters,
                    },
                  }),
              decision: s.decision ? viewDecision(s.decision, s.promotionApplied) : null,
            };
          }),
        };
      }),
  );

  app.put(
    '/v1/academic-years/:id/graduations',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Simpan draf keputusan kelulusan murid',
        description:
          'Izin: `graduation:manage`; modul `grades`. Upsert draf keputusan per murid: `result` (`graduated`, `not_graduated`, `deferred`, atau null = ' +
          'belum diputuskan), `graduatedOn` (tanggal kelulusan), `sklNumber` (diketik; kosong = dibuat otomatis dari templat saat final), ' +
          '`diplomaNumber`, `note`, `meetingId` (berita acara). Yang DIHILANGKAN dipertahankan, `null` mengosongkan. Semua atau tidak sama sekali. ' +
          'Draf belum mengubah keputusan kenaikan; itu terjadi saat finalisasi. 400 `student_not_in_final_class`: murid bukan murid kelas tingkat ' +
          'akhir tahun itu; 400 `invalid_reference`: berita acara tidak ada pada tahun itu. 409 `graduation_final`: keputusan murid sudah final ' +
          '(buka kembali dulu); 409 `meeting_final`: tertaut ke berita acara final; 409 `number_taken`: nomor SKL/ijazah dipakai murid lain; ' +
          '409 `no_graduation_policy`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          decisions: z
            .array(
              z.object({
                studentId: z.uuid(),
                result: z.enum(GRADUATION_RESULTS).nullable(),
                graduatedOn: z.iso.date().nullable().optional(),
                sklNumber: nullableText(120),
                diplomaNumber: nullableText(60),
                note: nullableText(1000),
                meetingId: z.uuid().nullable().optional(),
              }),
            )
            .min(1)
            .max(2000),
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
      const items = request.body.decisions;
      return conflictAs409('Nomor SKL atau ijazah bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const year = await loadYear(tx, request.params.id);
          await lockGraduation(tx, year.id);
          await requirePolicy(tx, year.id);
          const ids = items.map((i) => i.studentId);
          if (new Set(ids).size !== ids.length)
            throw bad('duplicate_student', 'Satu murid hanya boleh muncul sekali dalam satu permintaan.');
          const classes = await loadFinalClasses(tx, year.id);
          const roster = new Map((await loadFinalRoster(tx, year.id, classes)).map((r) => [r.studentId, r]));
          const existing = new Map(
            (
              await tx
                .select()
                .from(graduationDecision)
                .where(
                  and(
                    eq(graduationDecision.academicYearId, year.id),
                    inArray(graduationDecision.studentId, ids),
                  ),
                )
            ).map((d) => [d.studentId, d]),
          );
          const meetings = await meetingsOf(tx, [
            ...items.flatMap((i) => (i.meetingId ? [i.meetingId] : [])),
            ...[...existing.values()].flatMap((d) => (d.meetingId ? [d.meetingId] : [])),
          ]);

          const values: (typeof graduationDecision.$inferInsert)[] = [];
          const numbers: { studentId: string; skl?: string | null; diploma?: string | null }[] = [];
          for (const item of items) {
            const r = roster.get(item.studentId);
            if (!r)
              throw bad(
                'student_not_in_final_class',
                `Murid ${item.studentId} bukan murid kelas tingkat akhir tahun ajaran ini.`,
              );
            const prev = existing.get(item.studentId);
            if (prev?.status === 'final') throw graduationFinalError();
            if (prev?.meetingId && meetings.get(prev.meetingId)?.status === 'final')
              throw meetingFinalError();
            let meetingId = prev?.meetingId ?? null;
            if (item.meetingId === null) meetingId = null;
            else if (item.meetingId !== undefined) {
              const m = meetings.get(item.meetingId);
              if (!m || m.academicYearId !== year.id)
                throw invalidRef('Berita acara tidak ditemukan pada tahun ajaran ini.');
              if (m.status === 'final') throw meetingFinalError();
              meetingId = m.id;
            }
            const sklNumber = item.sklNumber === undefined ? (prev?.sklNumber ?? null) : item.sklNumber;
            const diplomaNumber =
              item.diplomaNumber === undefined ? (prev?.diplomaNumber ?? null) : item.diplomaNumber;
            numbers.push({ studentId: item.studentId, skl: sklNumber, diploma: diplomaNumber });
            values.push({
              schoolId: ctx.schoolId,
              academicYearId: year.id,
              studentId: item.studentId,
              classId: r.classId,
              result: item.result,
              status: 'draft',
              graduatedOn: item.graduatedOn === undefined ? (prev?.graduatedOn ?? null) : item.graduatedOn,
              sklNumber,
              // Nomor urut hanya milik nomor yang dibuat otomatis: nomor yang diketik/diubah melepas penandanya.
              sklSeq: sklNumber !== null && sklNumber === prev?.sklNumber ? (prev?.sklSeq ?? null) : null,
              diplomaNumber,
              meetingId,
              note: item.note === undefined ? (prev?.note ?? null) : item.note,
              decidedBy: ctx.userId,
              updatedAt: new Date(),
            });
          }
          await assertNumbersFree(tx, numbers);
          const written = await tx
            .insert(graduationDecision)
            .values(values)
            .onConflictDoUpdate({
              target: [graduationDecision.academicYearId, graduationDecision.studentId],
              set: {
                classId: sql`excluded.class_id`,
                result: sql`excluded.result`,
                graduatedOn: sql`excluded.graduated_on`,
                sklNumber: sql`excluded.skl_number`,
                sklSeq: sql`excluded.skl_seq`,
                diplomaNumber: sql`excluded.diploma_number`,
                meetingId: sql`excluded.meeting_id`,
                note: sql`excluded.note`,
                decidedBy: sql`excluded.decided_by`,
                updatedAt: sql`excluded.updated_at`,
              },
              setWhere: eq(graduationDecision.status, 'draft'),
            })
            .returning({ id: graduationDecision.id });
          if (written.length !== values.length) throw graduationFinalError();
          await audit(tx, ctx, 'graduation.decide', 'academic_year', year.id, {
            count: values.length,
            graduated: values.filter((v) => v.result === 'graduated').length,
            notGraduated: values.filter((v) => v.result === 'not_graduated').length,
            deferred: values.filter((v) => v.result === 'deferred').length,
          });
          return { saved: written.length };
        }),
      );
    },
  );

  app.post(
    '/v1/academic-years/:id/graduations/finalize',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Tetapkan (finalkan) keputusan kelulusan murid',
        description:
          'Izin: `graduation:manage`; modul `grades`. Untuk tiap murid dalam `studentIds` (harus sudah punya draf dengan `result`; yang lulus ' +
          'wajib `graduatedOn`): menghitung ulang saran dari snapshot rapor final dan nilai ujian, MEMBEKUKAN transkrip (nilai rapor per semester, ' +
          'nilai ujian, nilai kelulusan per mapel, rata-rata, kebijakan yang dipakai), membuat nomor SKL dari templat bila lulus dan belum ' +
          'bernomor, lalu menulis keputusan kenaikan murid (`graduated` menjadi `graduate`, `not_graduated` menjadi `retain`, `deferred` tidak ' +
          'ditulis). Status murid `graduated` TIDAK berubah di sini; itu terjadi pada penerapan kenaikan. 409 `report_not_final`: ada murid yang ' +
          'rapor semester tahun kelulusannya belum final; 409 `scores_incomplete`: ada komponen berbobot yang belum bernilai; keduanya dapat ' +
          'dilewati dengan `force` true disertai `reason` (400 `reason_required`); alasan dibekukan di transkrip. 409 `promotion_applied`: keputusan ' +
          'kenaikan murid sudah diterapkan. 409 `meeting_final`: keputusan tertaut ke berita acara final. 409 `graduation_final`: sudah final. ' +
          'Semua atau tidak sama sekali. 400 `result_required`, `graduated_on_required`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          studentIds: z.array(z.uuid()).min(1).max(2000),
          force: z.boolean().default(false),
          reason: nullableText(500),
        }),
        response: {
          200: z.object({
            finalized: z.number().int(),
            graduated: z.number().int(),
            notGraduated: z.number().int(),
            deferred: z.number().int(),
            sklAssigned: z.number().int(),
            promotionWritten: z.number().int(),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const body = request.body;
      return conflictAs409('Nomor SKL bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const year = await loadYear(tx, request.params.id);
          await lockPromotion(tx, year.id);
          await lockGraduation(tx, year.id);
          const policy = await requirePolicy(tx, year.id);
          const config = parseConfig(policy.config);
          const ids = [...new Set(body.studentIds)];
          const decisions = await tx
            .select()
            .from(graduationDecision)
            .where(
              and(eq(graduationDecision.academicYearId, year.id), inArray(graduationDecision.studentId, ids)),
            );
          if (decisions.length !== ids.length) {
            throw invalidRef(
              'Ada murid yang belum punya draf keputusan kelulusan; simpan keputusannya lebih dulu.',
            );
          }
          for (const d of decisions) {
            if (d.status === 'final') throw graduationFinalError();
            if (!d.result)
              throw bad(
                'result_required',
                'Ada murid yang belum diputuskan (lulus, tidak lulus, atau ditunda).',
              );
            if (d.result === 'graduated' && !d.graduatedOn) {
              throw bad(
                'graduated_on_required',
                'Murid yang ditetapkan lulus wajib punya tanggal kelulusan.',
              );
            }
          }
          const classes = await loadFinalClasses(tx, year.id);
          const roster = await loadFinalRoster(tx, year.id, classes);
          const rosterIndex = new Map(roster.map((r, i) => [r.studentId, { r, i }]));
          for (const d of decisions) {
            if (!rosterIndex.has(d.studentId)) {
              throw bad(
                'student_not_in_final_class',
                `Murid ${d.studentId} bukan murid kelas tingkat akhir tahun ajaran ini.`,
              );
            }
          }
          decisions.sort(
            (a, b) => (rosterIndex.get(a.studentId)?.i ?? 0) - (rosterIndex.get(b.studentId)?.i ?? 0),
          );

          const promotions = new Map(
            (
              await tx
                .select()
                .from(promotionDecision)
                .where(
                  and(
                    eq(promotionDecision.academicYearId, year.id),
                    inArray(promotionDecision.studentId, ids),
                  ),
                )
            ).map((p) => [p.studentId, p]),
          );
          const meetings = await meetingsOf(tx, [
            ...decisions.flatMap((d) => (d.meetingId ? [d.meetingId] : [])),
            ...[...promotions.values()].flatMap((p) => (p.meetingId ? [p.meetingId] : [])),
          ]);
          for (const d of decisions) {
            const pd = promotions.get(d.studentId);
            if (d.result !== 'deferred' && pd?.appliedAt) {
              throw new HttpError(
                409,
                'promotion_applied',
                `Keputusan kenaikan ${rosterIndex.get(d.studentId)?.r.name ?? 'murid'} sudah diterapkan ke tahun ajaran berikutnya; penetapan tidak bisa diubah.`,
              );
            }
            for (const mid of [d.meetingId, pd?.meetingId]) {
              if (mid && meetings.get(mid)?.status === 'final') throw meetingFinalError();
            }
          }

          const scoring = await scoreStudents(tx, year, config, ids);
          const nameOf = (id: string) => rosterIndex.get(id)?.r.name ?? id;
          const notFinal = decisions
            .filter((d) => scoring.get(d.studentId)?.reportNotFinal)
            .map((d) => nameOf(d.studentId));
          const incomplete = decisions
            .filter((d) => scoring.get(d.studentId)?.suggestion.incomplete)
            .map((d) => nameOf(d.studentId));
          if (!body.force) {
            if (notFinal.length > 0) {
              throw new HttpError(
                409,
                'report_not_final',
                `Rapor semester tahun kelulusan belum final untuk: ${namesText(notFinal)}. Finalkan rapornya, atau lanjutkan dengan alasan tertulis.`,
              );
            }
            if (incomplete.length > 0) {
              throw new HttpError(
                409,
                'scores_incomplete',
                `Nilai komponen kelulusan belum lengkap untuk: ${namesText(incomplete)}. Lengkapi nilainya, atau lanjutkan dengan alasan tertulis.`,
              );
            }
          } else if (!body.reason && (notFinal.length > 0 || incomplete.length > 0)) {
            throw bad(
              'reason_required',
              'Alasan wajib diisi untuk menetapkan dengan data yang belum lengkap.',
            );
          }

          // Nomor SKL otomatis: urutan murid mengikuti daftar kelas (kelas lalu nama); urut lanjut dari nomor terbesar tahun itu.
          const maxRows = await tx.execute<{ max: number | null }>(
            sql`select max(skl_seq) as max from graduation_decision where academic_year_id = ${year.id}`,
          );
          let seq = Number(maxRows.rows[0]?.max ?? 0);
          const snapshot = await policySnapshot(tx, year.id, config);
          const capturedAt = new Date();
          const out = {
            finalized: 0,
            graduated: 0,
            notGraduated: 0,
            deferred: 0,
            sklAssigned: 0,
            promotionWritten: 0,
          };
          const pdValues: (typeof promotionDecision.$inferInsert)[] = [];
          const syncedIds: string[] = [];
          const numbersNew: { studentId: string; skl: string }[] = [];
          const finalRows: {
            d: DecisionRow;
            sklNumber: string | null;
            sklSeq: number | null;
            transcript: object;
          }[] = [];
          for (const d of decisions) {
            const sc = scoring.get(d.studentId);
            if (!sc) continue;
            let sklNumber = d.sklNumber;
            let sklSeq = d.sklSeq;
            if (d.result === 'graduated' && !sklNumber && policy.sklNumberTemplate && d.graduatedOn) {
              seq += 1;
              sklNumber = renderNumberTemplate(policy.sklNumberTemplate, {
                seq,
                year: Number(d.graduatedOn.slice(0, 4)),
              });
              sklSeq = seq;
              numbersNew.push({ studentId: d.studentId, skl: sklNumber });
              out.sklAssigned++;
            }
            const forced = sc.reportNotFinal || sc.suggestion.incomplete;
            finalRows.push({
              d,
              sklNumber,
              sklSeq,
              transcript: {
                version: 1,
                capturedAt: capturedAt.toISOString(),
                policy: snapshot,
                reportSemesters: sc.reportSemesters,
                ...sc.suggestion,
                ...(body.force && forced && body.reason ? { forced: { reason: body.reason } } : {}),
              },
            });
            if (d.result === 'graduated') out.graduated++;
            else if (d.result === 'not_graduated') out.notGraduated++;
            else out.deferred++;
            if (d.result !== 'deferred') {
              const pd = promotions.get(d.studentId);
              const meeting = d.meetingId ? meetings.get(d.meetingId) : undefined;
              pdValues.push({
                schoolId: ctx.schoolId,
                academicYearId: year.id,
                studentId: d.studentId,
                fromClassId: rosterIndex.get(d.studentId)?.r.classId as string,
                decision: d.result === 'graduated' ? 'graduate' : 'retain',
                toClassId: null,
                note: pd?.note ?? null,
                reason: d.result === 'not_graduated' ? (d.note ?? pd?.reason ?? null) : (pd?.reason ?? null),
                followUp: pd?.followUp ?? null,
                meetingDate: meeting?.heldOn ?? pd?.meetingDate ?? null,
                meetingId: d.meetingId ?? pd?.meetingId ?? null,
                decidedBy: ctx.userId,
                decidedAt: capturedAt,
              });
              syncedIds.push(d.id);
            }
          }
          await assertNumbersFree(
            tx,
            numbersNew.map((n) => ({ studentId: n.studentId, skl: n.skl })),
          );
          if (pdValues.length > 0) {
            const written = await tx
              .insert(promotionDecision)
              .values(pdValues)
              .onConflictDoUpdate({
                target: [promotionDecision.academicYearId, promotionDecision.studentId],
                set: {
                  fromClassId: sql`excluded.from_class_id`,
                  decision: sql`excluded.decision`,
                  toClassId: sql`excluded.to_class_id`,
                  note: sql`excluded.note`,
                  reason: sql`excluded.reason`,
                  followUp: sql`excluded.follow_up`,
                  meetingDate: sql`excluded.meeting_date`,
                  meetingId: sql`excluded.meeting_id`,
                  decidedBy: sql`excluded.decided_by`,
                  decidedAt: sql`excluded.decided_at`,
                },
                setWhere: isNull(promotionDecision.appliedAt),
              })
              .returning({ id: promotionDecision.id });
            if (written.length !== pdValues.length) {
              throw new HttpError(
                409,
                'promotion_applied',
                'Sebagian keputusan kenaikan sudah diterapkan; muat ulang daftar.',
              );
            }
            out.promotionWritten = written.length;
          }
          for (const f of finalRows) {
            await tx
              .update(graduationDecision)
              .set({
                status: 'final',
                sklNumber: f.sklNumber,
                sklSeq: f.sklSeq,
                transcript: f.transcript,
                promotionSynced: syncedIds.includes(f.d.id),
                decidedBy: ctx.userId,
                finalizedAt: capturedAt,
                updatedAt: capturedAt,
              })
              .where(eq(graduationDecision.id, f.d.id));
          }
          out.finalized = finalRows.length;
          await audit(tx, ctx, 'graduation.finalize', 'academic_year', year.id, {
            ...out,
            forced: body.force && (notFinal.length > 0 || incomplete.length > 0),
          });
          return out;
        }),
      );
    },
  );

  app.post(
    '/v1/academic-years/:id/graduations/reopen',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Buka kembali penetapan kelulusan murid',
        description:
          'Izin: `graduation:manage`; modul `grades`. Mengembalikan keputusan final menjadi draf: transkrip beku dibuang (dihitung ulang saat ' +
          'ditetapkan lagi), keputusan kenaikan yang ditulis penetapan ini dicabut, nomor SKL dan ijazah tetap. 409 `promotion_applied`: keputusan ' +
          'kenaikan murid sudah diterapkan (status lulus sudah berlaku); 409 `meeting_final`: tertaut ke berita acara final; 409 ' +
          '`graduation_not_final`: murid belum final. Semua atau tidak sama sekali.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ studentIds: z.array(z.uuid()).min(1).max(2000) }),
        response: {
          200: z.object({ reopened: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const ids = [...new Set(request.body.studentIds)];
      return tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        await lockPromotion(tx, year.id);
        await lockGraduation(tx, year.id);
        const decisions = await tx
          .select()
          .from(graduationDecision)
          .where(
            and(eq(graduationDecision.academicYearId, year.id), inArray(graduationDecision.studentId, ids)),
          );
        if (decisions.length !== ids.length)
          throw invalidRef('Ada murid yang belum punya keputusan kelulusan.');
        if (decisions.some((d) => d.status !== 'final')) {
          throw new HttpError(409, 'graduation_not_final', 'Ada murid yang keputusannya belum final.');
        }
        const applied = await appliedPromotionOf(tx, year.id, ids);
        if (applied.size > 0) {
          throw new HttpError(
            409,
            'promotion_applied',
            'Keputusan kenaikan sebagian murid sudah diterapkan ke tahun ajaran berikutnya, jadi penetapannya tidak bisa dibuka kembali.',
          );
        }
        const promotions = await tx
          .select({ studentId: promotionDecision.studentId, meetingId: promotionDecision.meetingId })
          .from(promotionDecision)
          .where(
            and(eq(promotionDecision.academicYearId, year.id), inArray(promotionDecision.studentId, ids)),
          );
        const meetings = await meetingsOf(tx, [
          ...decisions.flatMap((d) => (d.meetingId ? [d.meetingId] : [])),
          ...promotions.flatMap((p) => (p.meetingId ? [p.meetingId] : [])),
        ]);
        if ([...meetings.values()].some((m) => m.status === 'final')) throw meetingFinalError();

        const synced = decisions.filter((d) => d.promotionSynced).map((d) => d.studentId);
        if (synced.length > 0) {
          await tx
            .delete(promotionDecision)
            .where(
              and(
                eq(promotionDecision.academicYearId, year.id),
                inArray(promotionDecision.studentId, synced),
                isNull(promotionDecision.appliedAt),
              ),
            );
        }
        await tx
          .update(graduationDecision)
          .set({
            status: 'draft',
            transcript: null,
            promotionSynced: false,
            finalizedAt: null,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              graduationDecision.id,
              decisions.map((d) => d.id),
            ),
          );
        await audit(tx, ctx, 'graduation.reopen', 'academic_year', year.id, { count: decisions.length });
        return { reopened: decisions.length };
      });
    },
  );

  app.put(
    '/v1/academic-years/:id/graduations/diploma-numbers',
    {
      onRequest: writeGate,
      schema: {
        tags: tag,
        summary: 'Catat nomor ijazah/seri murid lulus',
        description:
          'Izin: `graduation:manage`; modul `grades`. Nomor ijazah/seri adalah teks yang diketik operator (Edusync tidak membuat format dan ' +
          'tidak mencetak ijazah). Boleh diubah juga setelah penetapan final karena bukan bagian transkrip beku. Unik per sekolah; null ' +
          'mengosongkan. 400 `invalid_reference`: murid tanpa keputusan lulus. 409 `number_taken`: nomor dipakai murid lain.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          items: z
            .array(z.object({ studentId: z.uuid(), diplomaNumber: nullableText(60) }))
            .min(1)
            .max(2000),
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
      const items = request.body.items;
      return conflictAs409('Nomor ijazah bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const year = await loadYear(tx, request.params.id);
          await lockGraduation(tx, year.id);
          await requirePolicy(tx, year.id);
          const ids = items.map((i) => i.studentId);
          if (new Set(ids).size !== ids.length)
            throw bad('duplicate_student', 'Satu murid hanya boleh muncul sekali dalam satu permintaan.');
          const rows = await tx
            .select()
            .from(graduationDecision)
            .where(
              and(eq(graduationDecision.academicYearId, year.id), inArray(graduationDecision.studentId, ids)),
            );
          if (rows.length !== ids.length || rows.some((r) => r.result !== 'graduated')) {
            throw invalidRef('Nomor ijazah hanya untuk murid yang keputusannya lulus.');
          }
          await assertNumbersFree(
            tx,
            items.map((i) => ({ studentId: i.studentId, diploma: i.diplomaNumber ?? null })),
          );
          for (const i of items) {
            await tx
              .update(graduationDecision)
              .set({ diplomaNumber: i.diplomaNumber ?? null, updatedAt: new Date() })
              .where(
                and(
                  eq(graduationDecision.academicYearId, year.id),
                  eq(graduationDecision.studentId, i.studentId),
                ),
              );
          }
          await audit(tx, ctx, 'graduation.diploma_numbers', 'academic_year', year.id, {
            count: items.length,
          });
          return { saved: items.length };
        }),
      );
    },
  );
}
