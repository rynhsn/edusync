import {
  canPlacementTransition,
  DEFAULT_PKL_ASPECTS,
  type PklPlacementStatus,
  pklPredicate,
  pklResult,
  validPklThresholds,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  pklAspect,
  pklJournal,
  pklPartner,
  pklPeriod,
  pklPlacement,
  pklScore,
  pklSetting,
  pklVisit,
  sql,
  student,
  type Tx,
  teacher,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import {
  assertJournalDate,
  hashAccessToken,
  loadSheet,
  newAccessToken,
  pklThresholds,
  saveScores,
  scoreRecordsBody,
} from '../pkl-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['PKL'];
const dateField = z.iso.date();
const STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
const statusEnum = z.enum(STATUSES);

const readGate = [requirePermission('pkl:read'), requireModule('internship')];
const manageGate = [requirePermission('pkl:manage'), requireModule('internship')];

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/* ---------- Skema ---------- */

const partnerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  field: z.string().nullable(),
  address: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  active: z.boolean(),
  placementCount: z.number().int().describe('Jumlah penempatan di mitra ini'),
});

const partnerBody = z.object({
  name: z.string().trim().min(1).max(160),
  field: optText(120),
  address: optText(300),
  contactName: optText(120),
  phone: optText(30),
  email: z
    .union([z.literal(''), z.email().max(254)])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  active: z.boolean().default(true),
});

const periodSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  placementCount: z.number().int(),
});

const periodBody = z
  .object({
    academicYearId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    startsOn: dateField,
    endsOn: dateField,
  })
  .refine((b) => b.startsOn <= b.endsOn, {
    message: 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai.',
    path: ['endsOn'],
  });

const placementSchema = z.object({
  id: z.uuid(),
  periodId: z.uuid(),
  periodName: z.string(),
  studentId: z.uuid(),
  studentName: z.string(),
  className: z.string().nullable(),
  partnerId: z.uuid(),
  partnerName: z.string(),
  supervisorTeacherId: z.uuid().nullable(),
  supervisorName: z.string().nullable().describe('Nama guru pembimbing dari sekolah'),
  industrySupervisorName: z.string().nullable(),
  industrySupervisorPhone: z.string().nullable(),
  status: statusEnum,
  journalCount: z.number().int(),
  lastJournalDate: z.string().nullable(),
  finalScore: z.number().nullable().describe('Nilai akhir tertimbang; null bila belum ada nilai'),
  predicate: z.enum(['A', 'B', 'C', 'D']).nullable(),
  hasAccessLink: z.boolean().describe('Tautan pembimbing industri sedang aktif'),
  canWrite: z
    .boolean()
    .describe('Pengguna ini boleh mengisi jurnal, kunjungan, nilai sekolah, dan tautan penempatan ini'),
});

const placementCreateBody = z.object({
  periodId: z.uuid(),
  partnerId: z.uuid(),
  studentIds: z.array(z.uuid()).min(1).max(100),
  supervisorTeacherId: z.uuid().nullish(),
  industrySupervisorName: optText(120),
  industrySupervisorPhone: optText(30),
});

const placementUpdateBody = z.object({
  partnerId: z.uuid().optional(),
  supervisorTeacherId: z.uuid().nullable().optional(),
  industrySupervisorName: optText(120).optional(),
  industrySupervisorPhone: optText(30).optional(),
  status: statusEnum.optional(),
});

const journalSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  activity: z.string(),
  present: z.boolean(),
  source: z.enum(['staff', 'industry']),
  recordedBy: z.string().nullable(),
});

export const journalBody = z.object({
  date: dateField,
  activity: z.string().trim().min(1).max(2000),
  present: z.boolean().default(true),
});

const visitSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  notes: z.string(),
});

const aspectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  weight: z.number().int(),
  sort: z.number().int(),
});

const aspectBody = z.object({
  name: z.string().trim().min(1).max(120),
  weight: z.number().int().min(1).max(100),
});

const scoreCell = z.object({ value: z.number().int(), note: z.string().nullable() }).nullable();

const sheetSchema = z.object({
  aspects: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      weight: z.number().int(),
      school: scoreCell,
      industry: scoreCell,
    }),
  ),
  result: z.object({
    perAspect: z.array(z.object({ aspectId: z.uuid(), value: z.number().nullable() })),
    final: z.number().nullable(),
    predicate: z.enum(['A', 'B', 'C', 'D']).nullable(),
  }),
});

/* ---------- Pembantu ---------- */

async function myTeacherId(tx: Tx, ctx: TenantContext) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  return mine?.id ?? null;
}

async function placementOrThrow(tx: Tx, id: string) {
  const [p] = await tx.select().from(pklPlacement).where(eq(pklPlacement.id, id));
  if (!p) throw notFound('Penempatan');
  return p;
}

/**
 * Pemegang `pkl:manage` ATAU guru pembimbing penempatan itu boleh menulis jurnal, kunjungan, nilai sekolah, dan
 * tautan. Selain itu 403.
 */
async function authorizeWrite(tx: Tx, ctx: TenantContext, placementId: string) {
  const p = await placementOrThrow(tx, placementId);
  if (ctx.permissions.has('pkl:manage')) return p;
  if (p.supervisorTeacherId && (await myTeacherId(tx, ctx)) === p.supervisorTeacherId) return p;
  throw forbidden('Hanya guru pembimbing penempatan ini atau pengelola PKL yang boleh melakukannya.');
}

async function periodOrThrow(tx: Tx, id: string) {
  const [p] = await tx.select().from(pklPeriod).where(eq(pklPeriod.id, id));
  if (!p) throw notFound('Periode PKL');
  return p;
}

/** Susun lembar nilai (aspek + nilai kedua penilai + hasil) satu penempatan. */
async function buildSheet(tx: Tx, placementId: string) {
  const { aspects, scores } = await loadSheet(tx, placementId);
  const cell = (aspectId: string, assessor: 'school' | 'industry') => {
    const s = scores.find((x) => x.aspectId === aspectId && x.assessor === assessor);
    return s ? { value: s.value, note: s.note } : null;
  };
  const result = pklResult(
    aspects,
    scores.filter((s) => aspects.some((a) => a.id === s.aspectId)),
  );
  return {
    aspects: aspects.map((a) => ({
      id: a.id,
      name: a.name,
      weight: a.weight,
      school: cell(a.id, 'school'),
      industry: cell(a.id, 'industry'),
    })),
    result: {
      ...result,
      predicate: result.final === null ? null : pklPredicate(result.final, await pklThresholds(tx)),
    },
  };
}

/** Pelanggaran in_use: dipakai tabel lain. */
const inUse = (what: string) => new HttpError(409, 'in_use', `${what} masih dipakai dan tidak bisa dihapus.`);

/** PKL dan prakerin: mitra, periode, penempatan, jurnal, kunjungan, penilaian, dan rekap. Modul `internship`. */
export async function pklRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);
  const ctxOf = (request: { ctx?: TenantContext }) => request.ctx as TenantContext;

  /* ---------- Mitra ---------- */

  async function partnerViews(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select()
      .from(pklPartner)
      .where(onlyId ? eq(pklPartner.id, onlyId) : undefined)
      .orderBy(asc(pklPartner.name));
    const counts = await tx
      .select({ id: pklPlacement.partnerId, n: count() })
      .from(pklPlacement)
      .groupBy(pklPlacement.partnerId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      field: r.field,
      address: r.address,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      active: r.active,
      placementCount: counts.find((c) => c.id === r.id)?.n ?? 0,
    }));
  }

  app.get(
    '/v1/pkl/partners',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar mitra PKL',
        description:
          'Izin: `pkl:read`; modul `internship`. `placementCount` = jumlah penempatan di mitra itu.',
        headers: schoolHeader,
        response: { 200: z.array(partnerSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => partnerViews(tx)),
  );

  app.post(
    '/v1/pkl/partners',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah mitra PKL',
        description: 'Izin: `pkl:manage`; modul `internship`. Nama mitra unik per sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: partnerBody,
        response: { 201: partnerSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const row = await conflictAs409('Mitra dengan nama itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .insert(pklPartner)
            .values({ schoolId: ctxOf(request).schoolId, ...b })
            .returning({ id: pklPartner.id });
          await audit(tx, ctxOf(request), 'pkl.partner.create', 'pkl_partner', r!.id, { name: b.name });
          return (await partnerViews(tx, r!.id))[0]!;
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.put(
    '/v1/pkl/partners/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah mitra PKL',
        description: 'Izin: `pkl:manage`; modul `internship`. 404 `not_found`; nama bentrok 409 `conflict`.',
        headers: schoolHeader,
        params: idParams,
        body: partnerBody,
        response: { 200: partnerSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const b = request.body;
      return conflictAs409('Mitra dengan nama itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .update(pklPartner)
            .set(b)
            .where(eq(pklPartner.id, request.params.id))
            .returning({ id: pklPartner.id });
          if (!r) throw notFound('Mitra');
          await audit(tx, ctxOf(request), 'pkl.partner.update', 'pkl_partner', r.id, { name: b.name });
          return (await partnerViews(tx, r.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/pkl/partners/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus mitra PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. 404 `not_found`; 409 `in_use` bila sudah ada penempatan di mitra itu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [p] = await tx
          .select({ id: pklPartner.id })
          .from(pklPartner)
          .where(eq(pklPartner.id, request.params.id));
        if (!p) throw notFound('Mitra');
        const [n] = await tx
          .select({ n: count() })
          .from(pklPlacement)
          .where(eq(pklPlacement.partnerId, p.id));
        if ((n?.n ?? 0) > 0) throw inUse('Mitra');
        await tx.delete(pklPartner).where(eq(pklPartner.id, p.id));
        await audit(tx, ctxOf(request), 'pkl.partner.delete', 'pkl_partner', p.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Periode ---------- */

  async function periodViews(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select()
      .from(pklPeriod)
      .where(onlyId ? eq(pklPeriod.id, onlyId) : undefined)
      .orderBy(desc(pklPeriod.startsOn), asc(pklPeriod.name));
    const counts = await tx
      .select({ id: pklPlacement.periodId, n: count() })
      .from(pklPlacement)
      .groupBy(pklPlacement.periodId);
    return rows.map((r) => ({
      id: r.id,
      academicYearId: r.academicYearId,
      name: r.name,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      placementCount: counts.find((c) => c.id === r.id)?.n ?? 0,
    }));
  }

  async function checkYear(tx: Tx, yearId: string) {
    const [y] = await tx
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(eq(academicYear.id, yearId));
    if (!y) throw invalidRef('Tahun ajaran tidak ditemukan.');
  }

  app.get(
    '/v1/pkl/periods',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar periode PKL',
        description: 'Izin: `pkl:read`; modul `internship`. Terbaru dahulu.',
        headers: schoolHeader,
        response: { 200: z.array(periodSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => periodViews(tx)),
  );

  app.post(
    '/v1/pkl/periods',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah periode PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. Tanggal mulai harus <= tanggal selesai (400 `validation`); ' +
          'tahun ajaran harus milik sekolah (400 `invalid_reference`); nama unik per tahun ajaran (409 `conflict`).',
        headers: schoolHeader,
        body: periodBody,
        response: { 201: periodSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const row = await conflictAs409('Periode dengan nama itu sudah ada pada tahun ajaran tersebut.', () =>
        tenant(request, async (tx) => {
          await checkYear(tx, b.academicYearId);
          const [r] = await tx
            .insert(pklPeriod)
            .values({ schoolId: ctxOf(request).schoolId, ...b })
            .returning({ id: pklPeriod.id });
          await audit(tx, ctxOf(request), 'pkl.period.create', 'pkl_period', r!.id, { name: b.name });
          return (await periodViews(tx, r!.id))[0]!;
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.put(
    '/v1/pkl/periods/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah periode PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. Validasi seperti saat menambah; 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: periodBody,
        response: { 200: periodSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const b = request.body;
      return conflictAs409('Periode dengan nama itu sudah ada pada tahun ajaran tersebut.', () =>
        tenant(request, async (tx) => {
          await checkYear(tx, b.academicYearId);
          const [r] = await tx
            .update(pklPeriod)
            .set(b)
            .where(eq(pklPeriod.id, request.params.id))
            .returning({ id: pklPeriod.id });
          if (!r) throw notFound('Periode PKL');
          await audit(tx, ctxOf(request), 'pkl.period.update', 'pkl_period', r.id, { name: b.name });
          return (await periodViews(tx, r.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/pkl/periods/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus periode PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. 404 `not_found`; 409 `in_use` bila sudah ada penempatan.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await periodOrThrow(tx, request.params.id);
        const [n] = await tx.select({ n: count() }).from(pklPlacement).where(eq(pklPlacement.periodId, p.id));
        if ((n?.n ?? 0) > 0) throw inUse('Periode');
        await tx.delete(pklPeriod).where(eq(pklPeriod.id, p.id));
        await audit(tx, ctxOf(request), 'pkl.period.delete', 'pkl_period', p.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Penempatan ---------- */

  /** Tampilan penempatan (nama siswa/kelas/mitra/pembimbing, ringkasan jurnal, nilai akhir, hak tulis). */
  async function placementViews(
    tx: Tx,
    ctx: TenantContext,
    opts: {
      where?: ReturnType<typeof and>;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const rows = await tx
      .select({
        p: pklPlacement,
        periodName: pklPeriod.name,
        studentName: student.name,
        className: classRoom.name,
        partnerName: pklPartner.name,
        supervisorName: teacher.name,
      })
      .from(pklPlacement)
      .innerJoin(pklPeriod, eq(pklPeriod.id, pklPlacement.periodId))
      .innerJoin(student, eq(student.id, pklPlacement.studentId))
      .innerJoin(pklPartner, eq(pklPartner.id, pklPlacement.partnerId))
      .leftJoin(teacher, eq(teacher.id, pklPlacement.supervisorTeacherId))
      .leftJoin(
        enrollment,
        and(
          eq(enrollment.studentId, pklPlacement.studentId),
          eq(enrollment.academicYearId, pklPeriod.academicYearId),
        ),
      )
      .leftJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(opts.where)
      .orderBy(asc(student.name), asc(pklPlacement.id))
      .limit(opts.limit ?? 1000)
      .offset(opts.offset ?? 0);
    const ids = rows.map((r) => r.p.id);
    const stats = ids.length
      ? await tx
          .select({
            id: pklJournal.placementId,
            n: count(),
            last: sql<string | null>`max(${pklJournal.date})`,
          })
          .from(pklJournal)
          .where(inArray(pklJournal.placementId, ids))
          .groupBy(pklJournal.placementId)
      : [];
    const aspects = await tx.select().from(pklAspect);
    const scores = ids.length
      ? await tx.select().from(pklScore).where(inArray(pklScore.placementId, ids))
      : [];
    const mine = ctx.permissions.has('pkl:manage') ? null : await myTeacherId(tx, ctx);
    const thresholds = await pklThresholds(tx);
    return rows.map((r) => {
      const s = stats.find((x) => x.id === r.p.id);
      const result = pklResult(
        aspects,
        scores.filter((x) => x.placementId === r.p.id),
      );
      return {
        id: r.p.id,
        periodId: r.p.periodId,
        periodName: r.periodName,
        studentId: r.p.studentId,
        studentName: r.studentName,
        className: r.className ?? null,
        partnerId: r.p.partnerId,
        partnerName: r.partnerName,
        supervisorTeacherId: r.p.supervisorTeacherId,
        supervisorName: r.supervisorName ?? null,
        industrySupervisorName: r.p.industrySupervisorName,
        industrySupervisorPhone: r.p.industrySupervisorPhone,
        status: r.p.status,
        journalCount: s?.n ?? 0,
        lastJournalDate: s?.last ?? null,
        finalScore: result.final,
        predicate: result.final === null ? null : pklPredicate(result.final, thresholds),
        hasAccessLink: r.p.accessTokenHash !== null,
        canWrite:
          ctx.permissions.has('pkl:manage') ||
          (mine !== null && r.p.supervisorTeacherId !== null && r.p.supervisorTeacherId === mine),
      };
    });
  }

  async function checkSupervisor(tx: Tx, teacherId: string | null | undefined) {
    if (!teacherId) return;
    const [t] = await tx
      .select({ id: teacher.id })
      .from(teacher)
      .where(and(eq(teacher.id, teacherId), eq(teacher.status, 'active')));
    if (!t) throw invalidRef('Guru pembimbing tidak ditemukan atau tidak aktif.');
  }

  app.get(
    '/v1/pkl/placements',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar penempatan PKL',
        description:
          'Izin: `pkl:read`; modul `internship`. Filter `periodId`, `partnerId`, `status`, dan `q` (nama siswa atau mitra). ' +
          '`finalScore` null bila belum ada nilai; `canWrite` menandai penempatan yang boleh diisi pengguna ini.',
        headers: schoolHeader,
        querystring: z.object({
          periodId: z.uuid().optional(),
          partnerId: z.uuid().optional(),
          status: statusEnum.optional(),
          q: z.string().trim().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(placementSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) => {
      const { periodId, partnerId, status, q, limit, offset } = request.query;
      return tenant(request, async (tx) => {
        const needle = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
        const where = and(
          periodId ? eq(pklPlacement.periodId, periodId) : undefined,
          partnerId ? eq(pklPlacement.partnerId, partnerId) : undefined,
          status ? eq(pklPlacement.status, status) : undefined,
          needle ? or(ilike(student.name, needle), ilike(pklPartner.name, needle)) : undefined,
        );
        const [total] = await tx
          .select({ n: count() })
          .from(pklPlacement)
          .innerJoin(student, eq(student.id, pklPlacement.studentId))
          .innerJoin(pklPartner, eq(pklPartner.id, pklPlacement.partnerId))
          .where(where);
        const items = await placementViews(tx, ctxOf(request), { where, limit, offset });
        return { items, total: total?.n ?? 0 };
      });
    },
  );

  app.get(
    '/v1/pkl/placements/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail penempatan PKL',
        description: 'Izin: `pkl:read`; modul `internship`. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: placementSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [v] = await placementViews(tx, ctxOf(request), {
          where: eq(pklPlacement.id, request.params.id),
        });
        if (!v) throw notFound('Penempatan');
        return v;
      }),
  );

  app.post(
    '/v1/pkl/placements',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tempatkan siswa PKL (massal)',
        description:
          'Izin: `pkl:manage`; modul `internship`. Satu siswa hanya boleh satu penempatan per periode: yang sudah ' +
          'ditempatkan dilaporkan di `skipped` (alasan `already_placed`), sisanya dibuat. Periode, mitra aktif, ' +
          'siswa aktif, dan guru pembimbing harus milik sekolah ini (400 `invalid_reference`).',
        headers: schoolHeader,
        body: placementCreateBody,
        response: {
          201: z.object({
            created: z.array(z.object({ id: z.uuid(), studentId: z.uuid() })),
            skipped: z.array(z.object({ studentId: z.uuid(), reason: z.literal('already_placed') })),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const studentIds = [...new Set(b.studentIds)];
      const result = await tenant(request, async (tx) => {
        await periodOrThrow(tx, b.periodId).catch(() => {
          throw invalidRef('Periode PKL tidak ditemukan.');
        });
        const [partner] = await tx
          .select({ id: pklPartner.id, active: pklPartner.active })
          .from(pklPartner)
          .where(eq(pklPartner.id, b.partnerId));
        if (!partner || !partner.active) throw invalidRef('Mitra tidak ditemukan atau tidak aktif.');
        await checkSupervisor(tx, b.supervisorTeacherId);
        const found = await tx
          .select({ id: student.id })
          .from(student)
          .where(
            and(
              inArray(student.id, studentIds),
              eq(student.status, 'active'),
              sql`${student.deletedAt} is null`,
            ),
          );
        if (found.length !== studentIds.length)
          throw invalidRef('Ada siswa yang tidak ditemukan atau tidak aktif.');
        const existing = await tx
          .select({ studentId: pklPlacement.studentId })
          .from(pklPlacement)
          .where(and(eq(pklPlacement.periodId, b.periodId), inArray(pklPlacement.studentId, studentIds)));
        const taken = new Set(existing.map((e) => e.studentId));
        const fresh = studentIds.filter((s) => !taken.has(s));
        const created = fresh.length
          ? await tx
              .insert(pklPlacement)
              .values(
                fresh.map((studentId) => ({
                  schoolId: ctxOf(request).schoolId,
                  periodId: b.periodId,
                  partnerId: b.partnerId,
                  studentId,
                  supervisorTeacherId: b.supervisorTeacherId ?? null,
                  industrySupervisorName: b.industrySupervisorName,
                  industrySupervisorPhone: b.industrySupervisorPhone,
                })),
              )
              .returning({ id: pklPlacement.id, studentId: pklPlacement.studentId })
          : [];
        if (created.length) {
          await audit(tx, ctxOf(request), 'pkl.placement.create', 'pkl_placement', created[0]!.id, {
            periodId: b.periodId,
            partnerId: b.partnerId,
            created: created.length,
            skipped: taken.size,
          });
        }
        return {
          created,
          skipped: studentIds
            .filter((s) => taken.has(s))
            .map((studentId) => ({
              studentId,
              reason: 'already_placed' as const,
            })),
        };
      });
      return reply.code(201).send(result);
    },
  );

  app.put(
    '/v1/pkl/placements/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah penempatan PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. Ubah mitra, guru pembimbing, pembimbing industri, dan/atau status. ' +
          'Status mengikuti alur: planned -> active|cancelled; active -> completed|cancelled; completed dan cancelled ' +
          'tidak bisa diubah lagi (409 `invalid_transition`). Penempatan batal mencabut tautan pembimbing industri.',
        headers: schoolHeader,
        params: idParams,
        body: placementUpdateBody,
        response: { 200: placementSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const b = request.body;
      return tenant(request, async (tx) => {
        const p = await placementOrThrow(tx, request.params.id);
        const set: Partial<typeof pklPlacement.$inferInsert> = {};
        if (b.status !== undefined && b.status !== p.status) {
          if (!canPlacementTransition(p.status as PklPlacementStatus, b.status)) {
            throw new HttpError(
              409,
              'invalid_transition',
              `Status tidak bisa diubah dari ${p.status} menjadi ${b.status}.`,
            );
          }
          set.status = b.status;
          if (b.status === 'cancelled') set.accessTokenHash = null;
        }
        if (b.partnerId !== undefined && b.partnerId !== p.partnerId) {
          const [partner] = await tx
            .select({ id: pklPartner.id, active: pklPartner.active })
            .from(pklPartner)
            .where(eq(pklPartner.id, b.partnerId));
          if (!partner || !partner.active) throw invalidRef('Mitra tidak ditemukan atau tidak aktif.');
          set.partnerId = b.partnerId;
        }
        if (b.supervisorTeacherId !== undefined) {
          await checkSupervisor(tx, b.supervisorTeacherId);
          set.supervisorTeacherId = b.supervisorTeacherId;
        }
        if (b.industrySupervisorName !== undefined) set.industrySupervisorName = b.industrySupervisorName;
        if (b.industrySupervisorPhone !== undefined) set.industrySupervisorPhone = b.industrySupervisorPhone;
        if (Object.keys(set).length > 0) {
          await tx.update(pklPlacement).set(set).where(eq(pklPlacement.id, p.id));
          await audit(tx, ctxOf(request), 'pkl.placement.update', 'pkl_placement', p.id, {
            status: set.status ?? null,
            partnerId: set.partnerId ?? null,
          });
        }
        const [v] = await placementViews(tx, ctxOf(request), { where: eq(pklPlacement.id, p.id) });
        return v!;
      });
    },
  );

  app.delete(
    '/v1/pkl/placements/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus penempatan PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. Hanya penempatan berstatus planned tanpa jurnal; selain itu 409 ' +
          '`not_deletable` (gunakan status cancelled). Kunjungan dan nilai ikut terhapus.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await placementOrThrow(tx, request.params.id);
        const [n] = await tx.select({ n: count() }).from(pklJournal).where(eq(pklJournal.placementId, p.id));
        if (p.status !== 'planned' || (n?.n ?? 0) > 0) {
          throw new HttpError(
            409,
            'not_deletable',
            'Hanya penempatan berstatus direncanakan tanpa jurnal yang bisa dihapus.',
          );
        }
        await tx.delete(pklScore).where(eq(pklScore.placementId, p.id));
        await tx.delete(pklVisit).where(eq(pklVisit.placementId, p.id));
        await tx.delete(pklPlacement).where(eq(pklPlacement.id, p.id));
        await audit(tx, ctxOf(request), 'pkl.placement.delete', 'pkl_placement', p.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Tautan pembimbing industri ---------- */

  app.post(
    '/v1/pkl/placements/:id/access-link',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Buat tautan pembimbing industri',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan itu; modul `internship`. Membuat token acak (32 byte, ' +
          'base64url); hanya hash SHA-256 yang disimpan dan tautan lama otomatis tidak berlaku. `token` dan `path` ' +
          'hanya tampil SATU KALI. Penempatan batal: 409 `placement_cancelled`.',
        headers: schoolHeader,
        params: idParams,
        response: {
          201: z.object({ token: z.string(), path: z.string() }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const token = newAccessToken();
      await tenant(request, async (tx) => {
        const p = await authorizeWrite(tx, ctxOf(request), request.params.id);
        if (p.status === 'cancelled') {
          throw new HttpError(409, 'placement_cancelled', 'Penempatan sudah dibatalkan.');
        }
        await tx
          .update(pklPlacement)
          .set({ accessTokenHash: hashAccessToken(token) })
          .where(eq(pklPlacement.id, p.id));
        await audit(tx, ctxOf(request), 'pkl.access_link.create', 'pkl_placement', p.id);
      });
      return reply.code(201).send({ token, path: `/pkl/${token}` });
    },
  );

  app.delete(
    '/v1/pkl/placements/:id/access-link',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Cabut tautan pembimbing industri',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan itu; modul `internship`. Tautan langsung tidak berlaku.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await authorizeWrite(tx, ctxOf(request), request.params.id);
        await tx.update(pklPlacement).set({ accessTokenHash: null }).where(eq(pklPlacement.id, p.id));
        await audit(tx, ctxOf(request), 'pkl.access_link.revoke', 'pkl_placement', p.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Jurnal ---------- */

  app.get(
    '/v1/pkl/placements/:id/journals',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Jurnal harian penempatan',
        description: 'Izin: `pkl:read`; modul `internship`. Opsional `from`/`to`; terbaru dahulu.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ from: dateField.optional(), to: dateField.optional() }),
        response: { 200: z.array(journalSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await placementOrThrow(tx, request.params.id);
        const { from, to } = request.query;
        return tx
          .select({
            id: pklJournal.id,
            date: pklJournal.date,
            activity: pklJournal.activity,
            present: pklJournal.present,
            source: pklJournal.source,
            recordedBy: pklJournal.recordedBy,
          })
          .from(pklJournal)
          .where(
            and(
              eq(pklJournal.placementId, p.id),
              from ? gte(pklJournal.date, from) : undefined,
              to ? lte(pklJournal.date, to) : undefined,
            ),
          )
          .orderBy(desc(pklJournal.date));
      }),
  );

  app.post(
    '/v1/pkl/placements/:id/journals',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Isi jurnal harian (upsert per hari)',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan itu; modul `internship`. Satu entri per hari: tanggal ' +
          'yang sama menimpa entri lama. Tanggal tidak boleh di masa depan (400 `date_in_future`) dan harus dalam ' +
          'periode PKL ditambah toleransi 7 hari (400 `date_out_of_period`).',
        headers: schoolHeader,
        params: idParams,
        body: journalBody,
        response: { 200: journalSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const b = request.body;
      return tenant(request, async (tx) => {
        const p = await authorizeWrite(tx, ctxOf(request), request.params.id);
        const period = await periodOrThrow(tx, p.periodId);
        assertJournalDate(b.date, period, todayInJakarta());
        const [row] = await tx
          .insert(pklJournal)
          .values({
            schoolId: ctxOf(request).schoolId,
            placementId: p.id,
            date: b.date,
            activity: b.activity,
            present: b.present,
            source: 'staff',
            recordedBy: ctxOf(request).userId,
          })
          .onConflictDoUpdate({
            target: [pklJournal.placementId, pklJournal.date],
            set: {
              activity: b.activity,
              present: b.present,
              source: 'staff',
              recordedBy: ctxOf(request).userId,
            },
          })
          .returning({
            id: pklJournal.id,
            date: pklJournal.date,
            activity: pklJournal.activity,
            present: pklJournal.present,
            source: pklJournal.source,
            recordedBy: pklJournal.recordedBy,
          });
        return row!;
      });
    },
  );

  app.delete(
    '/v1/pkl/journals/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Hapus entri jurnal',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan jurnal itu; modul `internship`. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [j] = await tx.select().from(pklJournal).where(eq(pklJournal.id, request.params.id));
        if (!j) throw notFound('Jurnal');
        await authorizeWrite(tx, ctxOf(request), j.placementId);
        await tx.delete(pklJournal).where(eq(pklJournal.id, j.id));
        await audit(tx, ctxOf(request), 'pkl.journal.delete', 'pkl_journal', j.id, { date: j.date });
        return { ok: true as const };
      }),
  );

  /* ---------- Kunjungan monitoring ---------- */

  app.get(
    '/v1/pkl/placements/:id/visits',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Kunjungan monitoring penempatan',
        description: 'Izin: `pkl:read`; modul `internship`. Terbaru dahulu.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.array(visitSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await placementOrThrow(tx, request.params.id);
        return tx
          .select({
            id: pklVisit.id,
            date: pklVisit.date,
            teacherId: pklVisit.teacherId,
            teacherName: teacher.name,
            notes: pklVisit.notes,
          })
          .from(pklVisit)
          .leftJoin(teacher, eq(teacher.id, pklVisit.teacherId))
          .where(eq(pklVisit.placementId, p.id))
          .orderBy(desc(pklVisit.date), desc(pklVisit.createdAt));
      }),
  );

  app.post(
    '/v1/pkl/placements/:id/visits',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Catat kunjungan monitoring',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan itu; modul `internship`. `teacherId` kosong = guru ' +
          'pencatat (bila pengguna terdaftar sebagai guru).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          date: dateField,
          teacherId: z.uuid().nullish(),
          notes: z.string().trim().min(1).max(2000),
        }),
        response: { 201: visitSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const row = await tenant(request, async (tx) => {
        const p = await authorizeWrite(tx, ctxOf(request), request.params.id);
        await checkSupervisor(tx, b.teacherId);
        const teacherId = b.teacherId ?? (await myTeacherId(tx, ctxOf(request)));
        const [v] = await tx
          .insert(pklVisit)
          .values({
            schoolId: ctxOf(request).schoolId,
            placementId: p.id,
            date: b.date,
            teacherId,
            notes: b.notes,
          })
          .returning();
        await audit(tx, ctxOf(request), 'pkl.visit.create', 'pkl_visit', v!.id, { date: b.date });
        const [t] = teacherId
          ? await tx.select({ name: teacher.name }).from(teacher).where(eq(teacher.id, teacherId))
          : [];
        return {
          id: v!.id,
          date: v!.date,
          teacherId: v!.teacherId,
          teacherName: t?.name ?? null,
          notes: v!.notes,
        };
      });
      return reply.code(201).send(row);
    },
  );

  app.delete(
    '/v1/pkl/visits/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Hapus catatan kunjungan',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan kunjungan itu; modul `internship`. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [v] = await tx.select().from(pklVisit).where(eq(pklVisit.id, request.params.id));
        if (!v) throw notFound('Kunjungan');
        await authorizeWrite(tx, ctxOf(request), v.placementId);
        await tx.delete(pklVisit).where(eq(pklVisit.id, v.id));
        await audit(tx, ctxOf(request), 'pkl.visit.delete', 'pkl_visit', v.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Ambang predikat ---------- */

  const thresholdsSchema = z.object({
    predicateA: z.number().int().describe('Nilai minimal predikat A'),
    predicateB: z.number().int().describe('Nilai minimal predikat B'),
    predicateC: z.number().int().describe('Nilai minimal predikat C; di bawahnya D'),
  });

  app.get(
    '/v1/pkl/settings-thresholds',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Ambang predikat nilai PKL',
        description:
          'Izin: `pkl:read`; modul `internship`. Nilai akhir >= A mendapat A, >= B mendapat B, >= C mendapat C, ' +
          'selain itu D. Bawaan 90/80/70 bila sekolah belum mengaturnya.',
        headers: schoolHeader,
        response: { 200: thresholdsSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => pklThresholds(tx)),
  );

  app.put(
    '/v1/pkl/settings-thresholds',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah ambang predikat nilai PKL',
        description:
          'Izin: `pkl:manage`; modul `internship`. Bilangan bulat 1-100 dengan A > B > C (400 `invalid_thresholds` ' +
          'bila tidak). Berlaku langsung pada semua nilai PKL, termasuk penempatan lama.',
        headers: schoolHeader,
        body: thresholdsSchema,
        response: { 200: thresholdsSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = ctxOf(request);
      const b = request.body;
      if (!validPklThresholds(b)) {
        throw new HttpError(
          400,
          'invalid_thresholds',
          'Ambang harus bilangan bulat 1-100 dengan A lebih besar dari B dan B lebih besar dari C.',
        );
      }
      return tenant(request, async (tx) => {
        const values = { thresholdA: b.predicateA, thresholdB: b.predicateB, thresholdC: b.predicateC };
        await tx
          .insert(pklSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: pklSetting.schoolId, set: { ...values, updatedAt: new Date() } });
        await audit(tx, ctx, 'pkl.thresholds.update', 'pkl_setting', ctx.schoolId, { ...b });
        return pklThresholds(tx);
      });
    },
  );

  /* ---------- Aspek penilaian ---------- */

  const listAspects = (tx: Tx) =>
    tx.select().from(pklAspect).orderBy(asc(pklAspect.sort), asc(pklAspect.name));

  app.get(
    '/v1/pkl/aspects',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar aspek penilaian PKL',
        description: 'Izin: `pkl:read`; modul `internship`. Berurutan menurut `sort`.',
        headers: schoolHeader,
        response: { 200: z.array(aspectSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => listAspects(tx)),
  );

  app.post(
    '/v1/pkl/aspects',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah aspek penilaian',
        description:
          'Izin: `pkl:manage`; modul `internship`. Bobot 1..100 (relatif; nilai akhir dinormalisasi). Nama unik (409 `conflict`).',
        headers: schoolHeader,
        body: aspectBody,
        response: { 201: aspectSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const b = request.body;
      const row = await conflictAs409('Aspek dengan nama itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [m] = await tx
            .select({ m: sql<number>`coalesce(max(${pklAspect.sort}), 0)` })
            .from(pklAspect);
          const [r] = await tx
            .insert(pklAspect)
            .values({ schoolId: ctxOf(request).schoolId, ...b, sort: Number(m?.m ?? 0) + 1 })
            .returning();
          await audit(tx, ctxOf(request), 'pkl.aspect.create', 'pkl_aspect', r!.id, { name: b.name });
          return r!;
        }),
      );
      return reply.code(201).send(row);
    },
  );

  app.post(
    '/v1/pkl/aspects/defaults',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Buat aspek penilaian bawaan',
        description:
          'Izin: `pkl:manage`; modul `internship`. Hanya bila belum ada aspek (409 `not_empty`): Disiplin 20, ' +
          'Kompetensi teknis 30, Etika kerja 20, Kerja sama 15, Laporan 15.',
        headers: schoolHeader,
        response: { 201: z.array(aspectSchema), 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const rows = await tenant(request, async (tx) => {
        const [n] = await tx.select({ n: count() }).from(pklAspect);
        if ((n?.n ?? 0) > 0) throw new HttpError(409, 'not_empty', 'Aspek penilaian sudah ada.');
        await tx.insert(pklAspect).values(
          DEFAULT_PKL_ASPECTS.map((a, i) => ({
            schoolId: ctxOf(request).schoolId,
            name: a.name,
            weight: a.weight,
            sort: i + 1,
          })),
        );
        await audit(tx, ctxOf(request), 'pkl.aspect.defaults', 'pkl_aspect', ctxOf(request).schoolId);
        return listAspects(tx);
      });
      return reply.code(201).send(rows);
    },
  );

  app.put(
    '/v1/pkl/aspects/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah aspek penilaian',
        description: 'Izin: `pkl:manage`; modul `internship`. 404 `not_found`; nama bentrok 409 `conflict`.',
        headers: schoolHeader,
        params: idParams,
        body: aspectBody,
        response: { 200: aspectSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const b = request.body;
      return conflictAs409('Aspek dengan nama itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [r] = await tx
            .update(pklAspect)
            .set(b)
            .where(eq(pklAspect.id, request.params.id))
            .returning();
          if (!r) throw notFound('Aspek');
          await audit(tx, ctxOf(request), 'pkl.aspect.update', 'pkl_aspect', r.id, { name: b.name });
          return r;
        }),
      );
    },
  );

  app.delete(
    '/v1/pkl/aspects/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus aspek penilaian',
        description:
          'Izin: `pkl:manage`; modul `internship`. 404 `not_found`; 409 `in_use` bila sudah ada nilai.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [a] = await tx
          .select({ id: pklAspect.id })
          .from(pklAspect)
          .where(eq(pklAspect.id, request.params.id));
        if (!a) throw notFound('Aspek');
        const [n] = await tx.select({ n: count() }).from(pklScore).where(eq(pklScore.aspectId, a.id));
        if ((n?.n ?? 0) > 0) throw inUse('Aspek');
        await tx.delete(pklAspect).where(eq(pklAspect.id, a.id));
        await audit(tx, ctxOf(request), 'pkl.aspect.delete', 'pkl_aspect', a.id);
        return { ok: true as const };
      }),
  );

  /* ---------- Nilai ---------- */

  app.get(
    '/v1/pkl/placements/:id/scores',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Lembar nilai penempatan',
        description:
          'Izin: `pkl:read`; modul `internship`. Nilai per aspek dari penilai sekolah dan industri, serta hasil: ' +
          'nilai per aspek = rata-rata penilai yang ada, nilai akhir = rata-rata tertimbang aspek yang bernilai ' +
          '(2 desimal), predikat A >= 90, B >= 80, C >= 70, selain itu D.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: sheetSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await placementOrThrow(tx, request.params.id);
        return buildSheet(tx, p.id);
      }),
  );

  app.put(
    '/v1/pkl/placements/:id/scores',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Isi nilai dari sekolah',
        description:
          'Izin: `pkl:manage` atau guru pembimbing penempatan itu; modul `internship`. Menyimpan nilai penilai ' +
          '`school` (upsert per aspek), nilai 0..100 bulat. Aspek harus milik sekolah (400 `invalid_reference`).',
        headers: schoolHeader,
        params: idParams,
        body: scoreRecordsBody,
        response: { 200: sheetSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const p = await authorizeWrite(tx, ctxOf(request), request.params.id);
        await saveScores(tx, ctxOf(request).schoolId, p.id, 'school', request.body.records);
        await audit(tx, ctxOf(request), 'pkl.score.save', 'pkl_placement', p.id, {
          count: request.body.records.length,
        });
        return buildSheet(tx, p.id);
      }),
  );

  /* ---------- Rekap ---------- */

  app.get(
    '/v1/pkl/periods/:id/report',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rekap PKL per periode',
        description:
          'Izin: `pkl:read`; modul `internship`. Per penempatan (tanpa yang dibatalkan): nilai akhir, predikat, ' +
          'jumlah hari jurnal, hari hadir, dan kunjungan; ringkasan berisi rata-rata nilai dan jumlah belum dinilai.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            period: z.object({ id: z.uuid(), name: z.string(), startsOn: z.string(), endsOn: z.string() }),
            rows: z.array(
              z.object({
                placementId: z.uuid(),
                studentName: z.string(),
                className: z.string().nullable(),
                partnerName: z.string(),
                status: statusEnum,
                final: z.number().nullable(),
                predicate: z.enum(['A', 'B', 'C', 'D']).nullable(),
                journalDays: z.number().int(),
                presentDays: z.number().int(),
                visits: z.number().int(),
              }),
            ),
            summary: z.object({
              total: z.number().int(),
              scored: z.number().int(),
              unscored: z.number().int(),
              average: z.number().nullable(),
            }),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const period = await periodOrThrow(tx, request.params.id);
        const views = await placementViews(tx, ctxOf(request), {
          where: and(eq(pklPlacement.periodId, period.id), sql`${pklPlacement.status} <> 'cancelled'`),
        });
        const ids = views.map((v) => v.id);
        const journals = ids.length
          ? await tx
              .select({
                id: pklJournal.placementId,
                days: count(),
                present: sql<number>`count(*) filter (where ${pklJournal.present})`,
              })
              .from(pklJournal)
              .where(inArray(pklJournal.placementId, ids))
              .groupBy(pklJournal.placementId)
          : [];
        const visits = ids.length
          ? await tx
              .select({ id: pklVisit.placementId, n: count() })
              .from(pklVisit)
              .where(inArray(pklVisit.placementId, ids))
              .groupBy(pklVisit.placementId)
          : [];
        const rows = views.map((v) => {
          const j = journals.find((x) => x.id === v.id);
          return {
            placementId: v.id,
            studentName: v.studentName,
            className: v.className,
            partnerName: v.partnerName,
            status: v.status,
            final: v.finalScore,
            predicate: v.predicate,
            journalDays: j?.days ?? 0,
            presentDays: Number(j?.present ?? 0),
            visits: visits.find((x) => x.id === v.id)?.n ?? 0,
          };
        });
        const finals = rows.map((r) => r.final).filter((f): f is number => f !== null);
        return {
          period: { id: period.id, name: period.name, startsOn: period.startsOn, endsOn: period.endsOn },
          rows,
          summary: {
            total: rows.length,
            scored: finals.length,
            unscored: rows.length - finals.length,
            average: finals.length
              ? Math.round((finals.reduce((s, f) => s + f, 0) / finals.length + Number.EPSILON) * 100) / 100
              : null,
          },
        };
      }),
  );
}
