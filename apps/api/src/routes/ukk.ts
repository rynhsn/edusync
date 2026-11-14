import {
  DEFAULT_UKK_CERTIFICATE_PATTERN,
  renderNumberPattern,
  schoolCodeFromSlug,
  UKK_EVENT_STATUSES,
  UKK_MAX_ATTEMPTS,
  UKK_MAX_RESULT_ITEMS,
  UKK_PATTERNS,
  ukkAssessorsBodySchema,
  ukkBandOf,
  ukkEventBodySchema,
  ukkFinalScore,
  ukkLatestScored,
  ukkReportingBodySchema,
  ukkResultsBodySchema,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  count,
  eq,
  inArray,
  letterSetting,
  pklPartner,
  reportCard,
  school,
  semester,
  sql,
  student,
  type Tx,
  teacher,
  ukkAssessor,
  ukkEvent,
  ukkResult,
  vocationalConcentration,
  vocationalSetting,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { assertStudentsReportNotFinal } from '../report-lock-lib';
import {
  bandsFor,
  canAssessUkk,
  enrolledInConcentration,
  eventOrThrow,
  groupAttempts,
  loadUkkSetting,
  type UkkEventRow,
} from '../ukk-lib';
import { audit, guarded, idParams, isUniqueViolation, ok, schoolHeader } from './helpers';
import { requireVocational } from './vocational';

const tags = ['UKK'];

/** Gerbang modul `internship` (UKK memakai modul PKL, tanpa modul katalog baru); profil kejuruan diperiksa di `tenant`. */
const readGate = [requirePermission('ukk:read'), requireModule('internship')];
const manageGate = [requirePermission('ukk:manage'), requireModule('internship')];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const patternEnum = z.enum(UKK_PATTERNS);
const statusEnum = z.enum(UKK_EVENT_STATUSES);

const eventOut = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  semesterId: z.uuid(),
  semesterName: z.string(),
  concentrationId: z.uuid(),
  concentrationCode: z.string(),
  concentrationName: z.string(),
  pattern: patternEnum,
  title: z.string(),
  schemeName: z.string().nullable(),
  kkniLevel: z.number().int().nullable(),
  lspName: z.string().nullable(),
  lspLicenseRef: z.string().nullable(),
  partnerId: z.uuid().nullable(),
  partnerName: z.string().nullable(),
  tukName: z.string().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  status: statusEnum,
  reportedToDinasAt: z.string().nullable().describe('Penanda manual: sudah dilaporkan ke Dinas'),
  pushedToEraporAt: z.string().nullable().describe('Penanda manual: sudah diunggah ke e-Rapor'),
  assessorCount: z.number().int(),
  studentCount: z.number().int().describe('Jumlah murid yang sudah punya baris hasil'),
  canAssess: z
    .boolean()
    .describe('Pengguna ini boleh mengisi hasil kegiatan ini (pengelola atau penguji internal)'),
  createdAt: z.string(),
});
const assessorOut = z.object({
  id: z.uuid(),
  kind: z.enum(['internal', 'external']),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  name: z.string().nullable(),
  institution: z.string().nullable(),
  qualification: z.string().nullable(),
});
const eventDetailOut = eventOut.extend({ assessors: z.array(assessorOut) });

const attemptOut = z.object({
  attemptNo: z.number().int(),
  practiceScore: z.number().nullable(),
  theoryScore: z.number().nullable(),
  finalScore: z.number().nullable(),
  bandCode: z.string().nullable(),
  bandLabel: z.string().nullable(),
  competent: z.boolean().nullable(),
  certificateNo: z.string().nullable(),
  statementNo: z.string().nullable(),
  passportUnits: z.array(z.string()).nullable(),
  note: z.string().nullable(),
  updatedAt: z.string(),
});
const resultRow = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  nisn: z.string().nullable(),
  className: z.string(),
  reportFinal: z
    .boolean()
    .describe(
      'Hasil UKK masuk rapor dan rapor murid pada semester kegiatan sudah final: tulis ditolak 409 `report_final`',
    ),
  attempts: z.array(attemptOut),
  latestAttemptNo: z
    .number()
    .int()
    .nullable()
    .describe('Percobaan terakhir yang bernilai akhir (dipakai rapor)'),
});
const bandOut = z.object({ code: z.string(), label: z.string(), min: z.number(), competent: z.boolean() });
const resultsOut = z.object({
  event: z.object({
    id: z.uuid(),
    title: z.string(),
    pattern: patternEnum,
    status: statusEnum,
    semesterId: z.uuid(),
    concentrationName: z.string(),
  }),
  bands: z
    .array(bandOut)
    .describe('Skala yang berlaku untuk pola kegiatan ini (timpaan sekolah atau bawaan)'),
  weights: z
    .object({ practice: z.number().int(), theory: z.number().int() })
    .nullable()
    .describe('Bobot praktik:teori; null = nilai akhir diisi langsung'),
  inReport: z.boolean(),
  canAssess: z.boolean(),
  students: z.array(resultRow),
});

const filterQuery = z.object({
  academicYearId: z.uuid().optional(),
  concentrationId: z.uuid().optional(),
  semesterId: z.uuid().optional(),
  status: statusEnum.optional(),
  pattern: patternEnum.optional(),
});

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function ukkRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const ctxOf = (request: { ctx?: TenantContext }) => request.ctx as TenantContext;
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [ctxOf(request).schoolId], async (tx) => {
      await requireVocational(tx, ctxOf(request).schoolId);
      return fn(tx);
    });

  /* ---------- Pembantu ---------- */

  /** Tampilan kegiatan (satu atau banyak) dengan hitungan penguji/murid dan hak mengisi pengguna ini. */
  async function eventViews(
    tx: Tx,
    ctx: TenantContext,
    where?: ReturnType<typeof and>,
    ids?: string[],
  ): Promise<z.infer<typeof eventOut>[]> {
    const rows = await tx
      .select({
        e: ukkEvent,
        semesterName: semester.name,
        concentrationCode: vocationalConcentration.code,
        concentrationName: vocationalConcentration.name,
        partnerName: pklPartner.name,
      })
      .from(ukkEvent)
      .innerJoin(semester, eq(semester.id, ukkEvent.semesterId))
      .innerJoin(vocationalConcentration, eq(vocationalConcentration.id, ukkEvent.concentrationId))
      .leftJoin(pklPartner, eq(pklPartner.id, ukkEvent.partnerId))
      .where(ids ? inArray(ukkEvent.id, ids) : where)
      .orderBy(asc(ukkEvent.startsOn), asc(ukkEvent.title), asc(ukkEvent.id));
    if (rows.length === 0) return [];
    const eventIds = rows.map((r) => r.e.id);
    const [assessors, students, mine] = await Promise.all([
      tx
        .select({ id: ukkAssessor.eventId, n: count() })
        .from(ukkAssessor)
        .where(inArray(ukkAssessor.eventId, eventIds))
        .groupBy(ukkAssessor.eventId),
      tx
        .select({
          id: ukkResult.eventId,
          n: sql<number>`count(distinct ${ukkResult.studentId})`.mapWith(Number),
        })
        .from(ukkResult)
        .where(inArray(ukkResult.eventId, eventIds))
        .groupBy(ukkResult.eventId),
      ctx.permissions.has('ukk:manage')
        ? Promise.resolve([] as { id: string }[])
        : tx
            .select({ id: ukkAssessor.eventId })
            .from(ukkAssessor)
            .innerJoin(teacher, eq(teacher.id, ukkAssessor.teacherId))
            .where(
              and(
                inArray(ukkAssessor.eventId, eventIds),
                eq(ukkAssessor.kind, 'internal'),
                eq(teacher.memberId, ctx.memberId),
              ),
            ),
    ]);
    const manage = ctx.permissions.has('ukk:manage');
    return rows.map(({ e, ...x }) => ({
      id: e.id,
      academicYearId: e.academicYearId,
      semesterId: e.semesterId,
      semesterName: x.semesterName,
      concentrationId: e.concentrationId,
      concentrationCode: x.concentrationCode,
      concentrationName: x.concentrationName,
      pattern: e.pattern,
      title: e.title,
      schemeName: e.schemeName,
      kkniLevel: e.kkniLevel,
      lspName: e.lspName,
      lspLicenseRef: e.lspLicenseRef,
      partnerId: e.partnerId,
      partnerName: x.partnerName,
      tukName: e.tukName,
      startsOn: e.startsOn,
      endsOn: e.endsOn,
      status: e.status,
      reportedToDinasAt: iso(e.reportedToDinasAt),
      pushedToEraporAt: iso(e.pushedToEraporAt),
      assessorCount: assessors.find((a) => a.id === e.id)?.n ?? 0,
      studentCount: students.find((s) => s.id === e.id)?.n ?? 0,
      canAssess: manage || mine.some((m) => m.id === e.id),
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async function assessorViews(tx: Tx, eventId: string) {
    const rows = await tx
      .select({ a: ukkAssessor, teacherName: teacher.name })
      .from(ukkAssessor)
      .leftJoin(teacher, eq(teacher.id, ukkAssessor.teacherId))
      .where(eq(ukkAssessor.eventId, eventId))
      .orderBy(asc(ukkAssessor.kind), asc(ukkAssessor.createdAt), asc(ukkAssessor.id));
    return rows.map(({ a, teacherName }) => ({
      id: a.id,
      kind: a.kind,
      teacherId: a.teacherId,
      teacherName: teacherName ?? null,
      name: a.name,
      institution: a.institution,
      qualification: a.qualification,
    }));
  }

  const detailView = async (tx: Tx, ctx: TenantContext, id: string) => {
    const [view] = await eventViews(tx, ctx, undefined, [id]);
    if (!view) throw new HttpError(404, 'not_found', 'Kegiatan UKK tidak ditemukan.');
    return { ...view, assessors: await assessorViews(tx, id) };
  };

  /** Validasi rujukan badan kegiatan: tahun ajaran, semester pada tahun itu, konsentrasi, dan mitra. */
  async function checkRefs(tx: Tx, b: z.infer<typeof ukkEventBodySchema>) {
    const [year] = await tx
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.id, b.academicYearId));
    if (!year) throw invalidRef('Tahun ajaran tidak ditemukan.');
    const [sem] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, b.semesterId));
    if (!sem) throw invalidRef('Semester tidak ditemukan.');
    if (sem.yearId !== b.academicYearId)
      throw invalidRef('Semester harus berada pada tahun ajaran kegiatan.');
    const [con] = await tx
      .select({ id: vocationalConcentration.id })
      .from(vocationalConcentration)
      .where(eq(vocationalConcentration.id, b.concentrationId));
    if (!con) throw invalidRef('Konsentrasi keahlian tidak ditemukan.');
    if (b.partnerId) {
      const [p] = await tx
        .select({ id: pklPartner.id })
        .from(pklPartner)
        .where(eq(pklPartner.id, b.partnerId));
      if (!p) throw invalidRef('Mitra dunia kerja tidak ditemukan.');
    }
  }

  const eventValues = (b: z.infer<typeof ukkEventBodySchema>) => ({
    academicYearId: b.academicYearId,
    semesterId: b.semesterId,
    concentrationId: b.concentrationId,
    pattern: b.pattern,
    title: b.title,
    schemeName: b.schemeName,
    kkniLevel: b.kkniLevel,
    lspName: b.lspName,
    lspLicenseRef: b.lspLicenseRef,
    partnerId: b.partnerId,
    tukName: b.tukName,
    startsOn: b.startsOn,
    endsOn: b.endsOn,
    status: b.status,
  });

  const hasResults = async (tx: Tx, eventId: string) => {
    const [hit] = await tx
      .select({ id: ukkResult.id })
      .from(ukkResult)
      .where(eq(ukkResult.eventId, eventId))
      .limit(1);
    return !!hit;
  };

  const assessedError = () =>
    new HttpError(
      409,
      'ukk_assessed',
      'Kegiatan ini sudah punya hasil UKK. Tutup kegiatan (status Selesai) untuk menyimpan riwayat.',
    );

  /** Tolak tulis hasil pada kegiatan ditutup (409 `event_closed`). */
  const assertOpen = (e: UkkEventRow) => {
    if (e.status === 'closed') {
      throw new HttpError(
        409,
        'event_closed',
        'Kegiatan UKK ini sudah ditutup. Ubah statusnya kembali ke Aktif bila hasil perlu diubah.',
      );
    }
  };

  /* ---------- Kegiatan ---------- */

  app.get(
    '/v1/ukk/events',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Daftar kegiatan UKK',
        description:
          'Izin: `ukk:read`; modul `internship`; hanya jenjang kejuruan (404 `not_vocational`). Filter opsional: tahun ajaran, ' +
          'semester, konsentrasi, status, pola. Terurut tanggal mulai lalu judul. `canAssess` menandai kegiatan yang boleh diisi ' +
          'pengguna ini (pengelola `ukk:manage` atau penguji internal kegiatan itu).',
        headers: schoolHeader,
        querystring: filterQuery,
        response: { 200: z.array(eventOut), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const q = request.query;
      const where = and(
        q.academicYearId ? eq(ukkEvent.academicYearId, q.academicYearId) : undefined,
        q.semesterId ? eq(ukkEvent.semesterId, q.semesterId) : undefined,
        q.concentrationId ? eq(ukkEvent.concentrationId, q.concentrationId) : undefined,
        q.status ? eq(ukkEvent.status, q.status) : undefined,
        q.pattern ? eq(ukkEvent.pattern, q.pattern) : undefined,
      );
      return tenant(request, (tx) => eventViews(tx, ctxOf(request), where));
    },
  );

  app.get(
    '/v1/ukk/events/:id',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Detail kegiatan UKK',
        description:
          'Izin: `ukk:read`; modul `internship`. Kegiatan beserta daftar penguji; 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: eventDetailOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => detailView(tx, ctxOf(request), request.params.id)),
  );

  app.post(
    '/v1/ukk/events',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Tambah kegiatan UKK',
        description:
          'Izin: `ukk:manage`; modul `internship`; hanya jenjang kejuruan. Pola `lsp`, `industry`, atau `independent`; semester pada ' +
          'tahun ajaran kegiatan; konsentrasi keahlian dan mitra (opsional) milik sekolah (400 `invalid_reference`). Status awal ' +
          '`draft`. Penanda lapor Dinas/e-Rapor diisi lewat `PUT /v1/ukk/events/{id}/reporting`.',
        headers: schoolHeader,
        body: ukkEventBodySchema,
        response: { 201: eventDetailOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = ctxOf(request);
      const b = request.body;
      const view = await tenant(request, async (tx) => {
        await checkRefs(tx, b);
        const [row] = await tx
          .insert(ukkEvent)
          .values({ schoolId: ctx.schoolId, ...eventValues(b), createdBy: ctx.userId })
          .returning({ id: ukkEvent.id });
        await audit(tx, ctx, 'ukk.event.create', 'ukk_event', row?.id as string, {
          title: b.title,
          pattern: b.pattern,
        });
        return detailView(tx, ctx, row?.id as string);
      });
      return reply.code(201).send(view);
    },
  );

  app.put(
    '/v1/ukk/events/:id',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Ubah kegiatan UKK',
        description:
          'Izin: `ukk:manage`; modul `internship`. Validasi seperti saat menambah; 404 `not_found`. Mengganti tahun ajaran, semester, ' +
          'atau konsentrasi setelah ada hasil ditolak 409 `ukk_assessed`. Status `closed` mengunci tulis hasil (409 `event_closed`); ' +
          'kembalikan ke `active` untuk membukanya.',
        headers: schoolHeader,
        params: idParams,
        body: ukkEventBodySchema,
        response: { 200: eventDetailOut, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      const b = request.body;
      return tenant(request, async (tx) => {
        const before = await eventOrThrow(tx, request.params.id);
        await checkRefs(tx, b);
        if (
          (before.academicYearId !== b.academicYearId ||
            before.semesterId !== b.semesterId ||
            before.concentrationId !== b.concentrationId) &&
          (await hasResults(tx, before.id))
        ) {
          throw assessedError();
        }
        await tx
          .update(ukkEvent)
          .set({ ...eventValues(b), updatedAt: new Date() })
          .where(eq(ukkEvent.id, before.id));
        await audit(tx, ctx, 'ukk.event.update', 'ukk_event', before.id, {
          title: b.title,
          status: b.status,
        });
        return detailView(tx, ctx, before.id);
      });
    },
  );

  app.delete(
    '/v1/ukk/events/:id',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Hapus kegiatan UKK',
        description:
          'Izin: `ukk:manage`; modul `internship`. Hanya kegiatan tanpa hasil; yang sudah punya hasil ditolak 409 `ukk_assessed` ' +
          '(tutup dengan status `closed` untuk menyimpan riwayat). Penguji ikut terhapus. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      await tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        if (await hasResults(tx, e.id)) throw assessedError();
        await tx.delete(ukkEvent).where(eq(ukkEvent.id, e.id));
        await audit(tx, ctx, 'ukk.event.delete', 'ukk_event', e.id, { title: e.title });
      });
      return { ok: true as const };
    },
  );

  /* ---------- Penguji ---------- */

  app.put(
    '/v1/ukk/events/:id/assessors',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Ganti daftar penguji kegiatan UKK',
        description:
          'Izin: `ukk:manage`; modul `internship`. Mengganti SELURUH daftar (maks. 20). `kind` `internal` = guru sekolah (`teacherId`, ' +
          'boleh mengisi hasil kegiatan ini tanpa `ukk:manage`); `external` = penguji dari LSP/industri (nama wajib; instansi dan ' +
          'kualifikasi opsional; tanpa akun). Penguji yang sama dua kali digabung. 400 `invalid_reference` bila guru tidak ada.',
        headers: schoolHeader,
        params: idParams,
        body: ukkAssessorsBodySchema,
        response: { 200: eventDetailOut, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      const list = request.body.assessors;
      return tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        const seen = new Set<string>();
        const unique = list.filter((a) => {
          const key = a.kind === 'internal' ? `i:${a.teacherId}` : `e:${a.name.toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const teacherIds = unique.flatMap((a) => (a.kind === 'internal' ? [a.teacherId] : []));
        if (teacherIds.length) {
          const found = await tx
            .select({ id: teacher.id })
            .from(teacher)
            .where(inArray(teacher.id, teacherIds));
          if (found.length !== teacherIds.length) throw invalidRef('Guru penguji tidak ditemukan.');
        }
        await tx.delete(ukkAssessor).where(eq(ukkAssessor.eventId, e.id));
        if (unique.length) {
          await tx.insert(ukkAssessor).values(
            unique.map((a) =>
              a.kind === 'internal'
                ? { schoolId: ctx.schoolId, eventId: e.id, kind: 'internal' as const, teacherId: a.teacherId }
                : {
                    schoolId: ctx.schoolId,
                    eventId: e.id,
                    kind: 'external' as const,
                    name: a.name,
                    institution: a.institution,
                    qualification: a.qualification,
                  },
            ),
          );
        }
        await audit(tx, ctx, 'ukk.assessors.replace', 'ukk_event', e.id, { count: unique.length });
        return detailView(tx, ctx, e.id);
      });
    },
  );

  /* ---------- Hasil ---------- */

  const toAttempt = (r: typeof ukkResult.$inferSelect) => ({
    attemptNo: r.attemptNo,
    practiceScore: r.practiceScore,
    theoryScore: r.theoryScore,
    finalScore: r.finalScore,
    bandCode: r.bandCode,
    bandLabel: r.bandLabel,
    competent: r.competent,
    certificateNo: r.certificateNo,
    statementNo: r.statementNo,
    passportUnits: r.passportUnits,
    note: r.note,
    updatedAt: r.updatedAt.toISOString(),
  });

  app.get(
    '/v1/ukk/events/:id/results',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Hasil UKK per murid',
        description:
          'Izin: `ukk:read`; modul `internship`. Peserta = murid aktif pada rombel yang jurusannya tertaut ke konsentrasi kegiatan ' +
          'di tahun ajaran kegiatan, ditambah murid yang sudah punya hasil. Tiap murid memuat semua percobaan (uji ulang) dan ' +
          '`latestAttemptNo` (percobaan terakhir bernilai, dipakai rapor/kelulusan). `bands` = skala yang berlaku untuk pola ' +
          'kegiatan, `weights` = bobot praktik:teori (null = nilai akhir diisi langsung), `canAssess` = pengguna ini boleh mengisi.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: resultsOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      return tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        const setting = await loadUkkSetting(tx);
        const [con] = await tx
          .select({ name: vocationalConcentration.name })
          .from(vocationalConcentration)
          .where(eq(vocationalConcentration.id, e.concentrationId));
        const results = await tx.select().from(ukkResult).where(eq(ukkResult.eventId, e.id));
        const attempts = groupAttempts(results);
        const enrolled = await enrolledInConcentration(tx, e);
        const known = new Set(enrolled.map((s) => s.studentId));
        const extraIds = [...attempts.keys()].filter((id) => !known.has(id));
        const extra = extraIds.length
          ? await tx
              .select({ id: student.id, name: student.name, nis: student.nis, nisn: student.nisn })
              .from(student)
              .where(inArray(student.id, extraIds))
          : [];
        const people = [
          ...enrolled.map((s) => ({ ...s })),
          ...extra.map((s) => ({
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            nisn: s.nisn,
            classId: '',
            className: '',
          })),
        ];
        const finals = setting.inReport
          ? new Set(
              (
                await tx
                  .select({ id: reportCard.studentId })
                  .from(reportCard)
                  .where(
                    and(
                      eq(reportCard.semesterId, e.semesterId),
                      eq(reportCard.status, 'final'),
                      inArray(
                        reportCard.studentId,
                        people.map((p) => p.studentId),
                      ),
                    ),
                  )
              ).map((r) => r.id),
            )
          : new Set<string>();
        return {
          event: {
            id: e.id,
            title: e.title,
            pattern: e.pattern,
            status: e.status,
            semesterId: e.semesterId,
            concentrationName: con?.name ?? '',
          },
          bands: bandsFor(setting, e.pattern).map((b) => ({ ...b })),
          weights: setting.weights,
          inReport: setting.inReport,
          canAssess: await canAssessUkk(tx, ctx, e.id),
          students: people.map((p) => {
            const mine = (attempts.get(p.studentId) ?? []).map((r) => ({ r, a: toAttempt(r) }));
            const latest = ukkLatestScored(mine.map((m) => m.a));
            return {
              studentId: p.studentId,
              name: p.name,
              nis: p.nis,
              nisn: p.nisn,
              className: p.className,
              reportFinal: finals.has(p.studentId),
              attempts: mine.map((m) => m.a),
              latestAttemptNo: latest?.attemptNo ?? null,
            };
          }),
        };
      });
    },
  );

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  app.put(
    '/v1/ukk/events/:id/results',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Simpan hasil UKK (batch)',
        description:
          'Izin: `ukk:read` di gerbang; yang boleh menyimpan = pemegang `ukk:manage` atau penguji internal kegiatan ini (selain itu 403). ' +
          'Maks. 500 butir (400 `too_many_items`). Tiap butir menyimpan satu percobaan (`attemptNo`, bawaan 1; percobaan > 1 hanya ' +
          'bila percobaan sebelumnya ada: 400 `invalid_attempt`). Nilai yang dihilangkan tidak berubah, null menghapus. Bila bobot ' +
          'praktik:teori diatur, nilai akhir dihitung server dari praktik dan teori (keduanya wajib; isian `finalScore` diabaikan); ' +
          'selain itu `finalScore` diisi langsung. Kategori dan status kompeten diturunkan server dari skala saat disimpan dan ' +
          'dibekukan di baris; nomor sertifikat/surat keterangan yang tidak lagi sesuai hasil dikosongkan. Murid harus terdaftar pada ' +
          'rombel yang jurusannya tertaut ke konsentrasi kegiatan (400 `student_not_in_concentration`). Kegiatan ditutup: 409 ' +
          '`event_closed`. Hasil masuk rapor dan rapor murid itu sudah final: 409 `report_final`.',
        headers: schoolHeader,
        params: idParams,
        body: ukkResultsBodySchema,
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
      const ctx = ctxOf(request);
      const items = request.body.items;
      if (items.length > UKK_MAX_RESULT_ITEMS) {
        throw new HttpError(
          400,
          'too_many_items',
          `Maksimal ${UKK_MAX_RESULT_ITEMS} butir hasil per permintaan.`,
        );
      }
      return tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        if (!(await canAssessUkk(tx, ctx, e.id))) {
          throw forbidden('Hanya pengelola UKK atau penguji internal kegiatan ini yang boleh mengisi hasil.');
        }
        assertOpen(e);
        const setting = await loadUkkSetting(tx);
        const studentIds = [...new Set(items.map((i) => i.studentId))];
        if (setting.inReport) await assertStudentsReportNotFinal(tx, e.semesterId, studentIds);
        const enrolled = await enrolledInConcentration(tx, e, studentIds);
        if (enrolled.length !== studentIds.length) {
          throw new HttpError(
            400,
            'student_not_in_concentration',
            'Ada murid yang tidak terdaftar pada rombel konsentrasi keahlian kegiatan ini.',
          );
        }
        const existing = groupAttempts(
          await tx
            .select()
            .from(ukkResult)
            .where(and(eq(ukkResult.eventId, e.id), inArray(ukkResult.studentId, studentIds))),
        );
        const bands = bandsFor(setting, e.pattern);
        // Butir berurutan: percobaan yang sama dua kali dalam satu permintaan, yang terakhir berlaku.
        const state = new Map<string, typeof ukkResult.$inferSelect>();
        for (const list of existing.values())
          for (const r of list) state.set(`${r.studentId}|${r.attemptNo}`, r);
        for (const it of items) {
          const prev = state.get(`${it.studentId}|${it.attemptNo}`);
          if (it.attemptNo > 1 && !state.has(`${it.studentId}|${it.attemptNo - 1}`)) {
            throw new HttpError(
              400,
              'invalid_attempt',
              'Percobaan ulang hanya bisa diisi bila percobaan sebelumnya sudah ada.',
            );
          }
          const practice =
            it.practiceScore !== undefined
              ? it.practiceScore === null
                ? null
                : round2(it.practiceScore)
              : (prev?.practiceScore ?? null);
          const theory =
            it.theoryScore !== undefined
              ? it.theoryScore === null
                ? null
                : round2(it.theoryScore)
              : (prev?.theoryScore ?? null);
          const final = setting.weights
            ? ukkFinalScore(practice, theory, setting.weights)
            : it.finalScore !== undefined
              ? it.finalScore === null
                ? null
                : round2(it.finalScore)
              : (prev?.finalScore ?? null);
          const band = final === null ? null : ukkBandOf(bands, final);
          const values = {
            practiceScore: practice,
            theoryScore: theory,
            finalScore: final,
            bandCode: band?.code ?? null,
            bandLabel: band?.label ?? null,
            competent: band?.competent ?? null,
            // Nomor yang tidak lagi sesuai hasil dilepas (CHECK: sertifikat hanya untuk yang kompeten).
            certificateNo: band?.competent === true ? (prev?.certificateNo ?? null) : null,
            statementNo: band?.competent === false ? (prev?.statementNo ?? null) : null,
            passportUnits:
              it.passportUnits !== undefined
                ? it.passportUnits && it.passportUnits.length > 0
                  ? it.passportUnits
                  : null
                : (prev?.passportUnits ?? null),
            note: it.note !== undefined ? (it.note ? it.note : null) : (prev?.note ?? null),
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          };
          const [row] = await tx
            .insert(ukkResult)
            .values({
              schoolId: ctx.schoolId,
              eventId: e.id,
              studentId: it.studentId,
              attemptNo: it.attemptNo,
              ...values,
            })
            .onConflictDoUpdate({
              target: [ukkResult.eventId, ukkResult.studentId, ukkResult.attemptNo],
              set: values,
            })
            .returning();
          state.set(`${it.studentId}|${it.attemptNo}`, row as typeof ukkResult.$inferSelect);
        }
        await audit(tx, ctx, 'ukk.results.save', 'ukk_event', e.id, { items: items.length });
        return { saved: items.length };
      });
    },
  );

  app.post(
    '/v1/ukk/events/:id/results/:studentId/retake',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Buat percobaan uji ulang',
        description:
          'Izin: `ukk:read` di gerbang; yang boleh = pemegang `ukk:manage` atau penguji internal kegiatan ini (selain itu 403). ' +
          'Membuat percobaan berikutnya (kosong) setelah percobaan terakhir yang sudah bernilai; maks. 5 percobaan (409 ' +
          '`max_attempts`). Belum ada percobaan atau percobaan terakhir belum bernilai: 400 `invalid_attempt`. Kegiatan ditutup: 409 ' +
          '`event_closed`; rapor final: 409 `report_final`. Percobaan lama tetap tersimpan; rapor memakai percobaan terakhir bernilai.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid(), studentId: z.uuid() }),
        response: {
          201: z.object({ studentId: z.uuid(), attemptNo: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = ctxOf(request);
      const { studentId } = request.params;
      const out = await tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        if (!(await canAssessUkk(tx, ctx, e.id))) {
          throw forbidden(
            'Hanya pengelola UKK atau penguji internal kegiatan ini yang boleh membuat uji ulang.',
          );
        }
        assertOpen(e);
        const setting = await loadUkkSetting(tx);
        if (setting.inReport) await assertStudentsReportNotFinal(tx, e.semesterId, [studentId]);
        if ((await enrolledInConcentration(tx, e, [studentId])).length === 0) {
          throw new HttpError(
            400,
            'student_not_in_concentration',
            'Murid tidak terdaftar pada rombel konsentrasi keahlian kegiatan ini.',
          );
        }
        const attempts = (
          await tx
            .select()
            .from(ukkResult)
            .where(and(eq(ukkResult.eventId, e.id), eq(ukkResult.studentId, studentId)))
        ).sort((a, b) => a.attemptNo - b.attemptNo);
        const last = attempts.at(-1);
        if (!last || last.finalScore === null) {
          throw new HttpError(
            400,
            'invalid_attempt',
            'Uji ulang hanya bisa dibuat setelah percobaan terakhir bernilai.',
          );
        }
        if (last.attemptNo >= UKK_MAX_ATTEMPTS) {
          throw new HttpError(409, 'max_attempts', `Maksimal ${UKK_MAX_ATTEMPTS} percobaan per murid.`);
        }
        const attemptNo = last.attemptNo + 1;
        await tx.insert(ukkResult).values({
          schoolId: ctx.schoolId,
          eventId: e.id,
          studentId,
          attemptNo,
          updatedBy: ctx.userId,
        });
        await audit(tx, ctx, 'ukk.results.retake', 'ukk_event', e.id, { studentId, attemptNo });
        return { studentId, attemptNo };
      });
      return reply.code(201).send(out);
    },
  );

  /* ---------- Nomor sertifikat / surat keterangan ---------- */

  app.post(
    '/v1/ukk/events/:id/numbers',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Nomori sertifikat dan surat keterangan UKK',
        description:
          'Izin: `ukk:manage`; modul `internship`. Untuk percobaan terakhir bernilai tiap murid: yang kompeten mendapat nomor SERTIFIKAT, ' +
          'yang tidak mendapat nomor SURAT KETERANGAN, berurutan menurut pola sekolah (`/v1/vocational/settings/ukk`, bawaan ' +
          '`UKK/{seq}/{code}/{year}`; format resmi tidak ditemukan, pola ini usulan) dan urut nama murid. Idempoten: yang sudah bernomor ' +
          'tidak diubah; nomor yang terpakai dilewati (satu urutan untuk sertifikat dan surat keterangan). Hasil masuk rapor dan rapor ' +
          'murid itu sudah final: 409 `report_final`. 409 `certificate_taken` bila bentrok dengan penomoran paralel.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            numbered: z.array(
              z.object({
                studentId: z.uuid(),
                attemptNo: z.number().int(),
                kind: z.enum(['certificate', 'statement']),
                number: z.string(),
              }),
            ),
            skipped: z.number().int().describe('Murid bernilai yang sudah bernomor'),
          }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      try {
        return await tenant(request, async (tx) => {
          const e = await eventOrThrow(tx, request.params.id);
          // Kunci baris pengaturan (dibuat bila belum ada) supaya penomoran paralel berurutan.
          await tx
            .insert(vocationalSetting)
            .values({ schoolId: ctx.schoolId, updatedBy: ctx.userId })
            .onConflictDoNothing();
          const [setting] = await tx
            .select({
              pattern: vocationalSetting.ukkCertificatePattern,
              inReport: vocationalSetting.ukkInReport,
            })
            .from(vocationalSetting)
            .for('update');
          const [sch] = await tx
            .select({ slug: school.slug })
            .from(school)
            .where(eq(school.id, ctx.schoolId));
          const [letters] = await tx.select({ code: letterSetting.schoolCode }).from(letterSetting);
          const code = letters?.code ?? schoolCodeFromSlug(sch?.slug ?? '');
          const pattern = setting?.pattern ?? DEFAULT_UKK_CERTIFICATE_PATTERN;
          const rows = await tx
            .select({ r: ukkResult, studentName: student.name })
            .from(ukkResult)
            .innerJoin(student, eq(student.id, ukkResult.studentId))
            .where(eq(ukkResult.eventId, e.id))
            .orderBy(asc(student.name), asc(ukkResult.studentId));
          const names = new Map(rows.map((x) => [x.r.studentId, x.studentName]));
          const best = [...groupAttempts(rows.map((x) => x.r)).values()]
            .map((list) => ukkLatestScored(list))
            .filter((r): r is typeof ukkResult.$inferSelect => r !== null)
            .sort((a, b) => (names.get(a.studentId) ?? '').localeCompare(names.get(b.studentId) ?? '', 'id'));
          const todo = best.filter((r) => (r.competent === true ? r.certificateNo : r.statementNo) === null);
          if (todo.length === 0) return { numbered: [], skipped: best.length };
          if (setting?.inReport) {
            await assertStudentsReportNotFinal(
              tx,
              e.semesterId,
              todo.map((r) => r.studentId),
            );
          }
          const used = await tx
            .select({ c: ukkResult.certificateNo, s: ukkResult.statementNo })
            .from(ukkResult);
          const taken = new Set(used.flatMap((u) => [u.c, u.s]).filter((x): x is string => x !== null));
          const [y, m] = todayInJakarta().split('-').map(Number) as [number, number];
          let seq = 0;
          const numbered: {
            studentId: string;
            attemptNo: number;
            kind: 'certificate' | 'statement';
            number: string;
          }[] = [];
          for (const r of todo) {
            let no: string;
            do {
              seq += 1;
              no = renderNumberPattern(pattern, { seq, code, month: m, year: y });
            } while (taken.has(no));
            taken.add(no);
            const certificate = r.competent === true;
            await tx
              .update(ukkResult)
              .set(certificate ? { certificateNo: no } : { statementNo: no })
              .where(eq(ukkResult.id, r.id));
            numbered.push({
              studentId: r.studentId,
              attemptNo: r.attemptNo,
              kind: certificate ? 'certificate' : 'statement',
              number: no,
            });
          }
          await audit(tx, ctx, 'ukk.numbers.assign', 'ukk_event', e.id, { count: numbered.length });
          return { numbered, skipped: best.length - todo.length };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'certificate_taken', 'Nomor itu sudah dipakai; coba lagi.');
        }
        throw error;
      }
    },
  );

  /* ---------- Penanda lapor ---------- */

  app.put(
    '/v1/ukk/events/:id/reporting',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Catat penanda lapor Dinas dan e-Rapor',
        description:
          'Izin: `ukk:manage`; modul `internship`. Penanda MANUAL (bukan integrasi): waktu hasil UKK dilaporkan ke Dinas dan diunggah ' +
          'ke e-Rapor; null menghapus penanda. Tidak mengunci hasil. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: ukkReportingBodySchema,
        response: { 200: eventDetailOut, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      const b = request.body;
      return tenant(request, async (tx) => {
        const e = await eventOrThrow(tx, request.params.id);
        await tx
          .update(ukkEvent)
          .set({
            reportedToDinasAt: b.reportedToDinasAt ? new Date(b.reportedToDinasAt) : null,
            pushedToEraporAt: b.pushedToEraporAt ? new Date(b.pushedToEraporAt) : null,
            updatedAt: new Date(),
          })
          .where(eq(ukkEvent.id, e.id));
        await audit(tx, ctx, 'ukk.event.reporting', 'ukk_event', e.id, { ...b });
        return detailView(tx, ctx, e.id);
      });
    },
  );
}
