import {
  AutoBillingError,
  blockedText,
  evaluateRuleInContext,
  executeRule,
  loadBillingContext,
  previewAutoBilling,
} from '@edusync/billing';
import {
  AUTO_BILLING_DUE_MODES,
  AUTO_BILLING_LIMITS,
  AUTO_BILLING_SEMESTER_RUNS,
  AUTO_BILLING_STATUSES,
  AUTO_BILLING_TRIGGERS,
  type AutoBillingRuleDraft,
  validateAutoBillingRule,
} from '@edusync/contracts';
import {
  and,
  classRoom,
  count,
  desc,
  eq,
  FinanceGenerateError,
  finAutoBillingRule,
  finAutoBillingRun,
  finFeeType,
  inArray,
  sql,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const L = AUTO_BILLING_LIMITS;

const ruleFields = z.object({
  runDay: z
    .number()
    .int()
    .min(L.dayMin)
    .max(L.dayMax)
    .nullable()
    .describe('Tanggal pembuatan tagihan tiap bulan (1-28). Wajib untuk biaya bulanan, null untuk lainnya'),
  dueMode: z
    .enum(AUTO_BILLING_DUE_MODES)
    .describe(
      '`fixed_day`: jatuh tempo pada `dueDay` bulan pembuatan (bila `dueDay` lebih kecil dari tanggal pembuatan, bulan berikutnya). ' +
        '`days_after`: `dueDays` hari setelah tanggal pembuatan',
    ),
  dueDay: z.number().int().min(L.dayMin).max(L.dayMax).nullable().describe('Wajib untuk `fixed_day`'),
  dueDays: z.number().int().min(0).max(L.dueDaysMax).nullable().describe('Wajib untuk `days_after`'),
  classIds: z
    .array(z.uuid())
    .max(200)
    .nullable()
    .describe('Pembatas kelas (opsional); kosong atau null = semua siswa dalam cakupan jenis biaya'),
  semesterRun: z
    .enum(AUTO_BILLING_SEMESTER_RUNS)
    .nullable()
    .describe(
      'Biaya semester: `start` = saat semester mulai, `custom` = selisih hari. Null untuk jenis lain',
    ),
  semesterOffsetDays: z
    .number()
    .int()
    .min(L.offsetMin)
    .max(L.offsetMax)
    .nullable()
    .describe('Selisih hari dari tanggal mulai semester (boleh negatif); wajib untuk `custom`'),
  runOn: z.iso
    .date()
    .nullable()
    .describe('Tanggal pembuatan untuk biaya tahunan dan sekali bayar; harus di dalam tahun ajaran aktif'),
  installments: z
    .number()
    .int()
    .min(L.installmentsMin)
    .max(L.installmentsMax)
    .nullable()
    .describe('Cicilan 2-12, hanya untuk biaya non-bulanan'),
});

const ruleBody = ruleFields.extend({
  feeTypeId: z.uuid(),
  enabled: z.boolean().default(true),
});

const nextRunSchema = z.object({
  period: z.string(),
  runDate: z.iso.date().describe('Tanggal pembuatan menurut aturan'),
  dueDate: z.iso.date(),
  catchUp: z
    .boolean()
    .describe('Tanggal pembuatan sudah lewat tetapi periodenya belum ditagih (akan dibuat segera)'),
});

const runViewSchema = z.object({
  id: z.uuid(),
  ruleId: z.uuid(),
  feeTypeName: z.string().nullable(),
  period: z.string(),
  scheduledFor: z.iso.date(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(AUTO_BILLING_STATUSES),
  createdCount: z.number().int(),
  skippedCount: z.number().int(),
  missingPlanCount: z.number().int(),
  freeCount: z.number().int(),
  error: z.string().nullable(),
  trigger: z.enum(AUTO_BILLING_TRIGGERS),
});

const ruleSchema = ruleFields.extend({
  id: z.uuid(),
  feeTypeId: z.uuid(),
  feeTypeName: z.string(),
  feeKind: z.enum(['monthly', 'semester', 'one_time', 'yearly']),
  feeActive: z.boolean(),
  enabled: z.boolean(),
  nextRunDate: z.iso
    .date()
    .nullable()
    .describe(
      'Tanggal run berikutnya (hari ini bila ada periode yang tertunda); null bila nonaktif atau terblokir',
    ),
  nextRuns: z.array(nextRunSchema),
  blockedReason: z
    .string()
    .nullable()
    .describe(
      'Kode alasan aturan tidak bisa jalan: `school_suspended`, `module_disabled`, `fee_inactive`, `no_year`, `outside_year`, `no_semester`, `run_on_outside_year`, `invalid_rule`',
    ),
  blockedText: z.string().nullable(),
  lastRun: runViewSchema.nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

type RunQueryRow = {
  id: string;
  rule_id: string;
  fee_type_name: string | null;
  period: string;
  scheduled_for: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  status: (typeof AUTO_BILLING_STATUSES)[number];
  created_count: number;
  skipped_count: number;
  missing_plan_count: number;
  free_count: number;
  error: string | null;
  trigger: (typeof AUTO_BILLING_TRIGGERS)[number];
};

const iso = (v: Date | string) => new Date(v).toISOString();

function runView(r: RunQueryRow): z.infer<typeof runViewSchema> {
  return {
    id: r.id,
    ruleId: r.rule_id,
    feeTypeName: r.fee_type_name,
    period: r.period,
    scheduledFor: r.scheduled_for,
    startedAt: iso(r.started_at),
    finishedAt: r.finished_at ? iso(r.finished_at) : null,
    status: r.status,
    createdCount: Number(r.created_count),
    skippedCount: Number(r.skipped_count),
    missingPlanCount: Number(r.missing_plan_count),
    freeCount: Number(r.free_count),
    error: r.error,
    trigger: r.trigger,
  };
}

const RUN_SELECT = sql`
  select r.id, r.rule_id, ft.name as fee_type_name, r.period, r.scheduled_for::text as scheduled_for,
         r.started_at, r.finished_at, r.status, r.created_count, r.skipped_count, r.missing_plan_count,
         r.free_count, r.error, r.trigger
  from fin_auto_billing_run r
  join fin_auto_billing_rule ru on ru.id = r.rule_id
  join fin_fee_type ft on ft.id = ru.fee_type_id`;

/** Pesan galat untuk daftar masalah validasi aturan. */
function issueMessage(draft: AutoBillingRuleDraft): string | null {
  const issues = validateAutoBillingRule(draft);
  if (issues.length === 0) return null;
  return `Aturan tidak sah: ${issues.map((i) => `${i.field} (${i.code})`).join(', ')}.`;
}

/** Bentuk draf aturan dari badan permintaan; kolom yang tak relevan dinormalkan ke null. */
function draftOf(kind: AutoBillingRuleDraft['kind'], b: z.infer<typeof ruleFields>): AutoBillingRuleDraft {
  return {
    kind,
    runDay: b.runDay,
    dueMode: b.dueMode,
    dueDay: b.dueMode === 'fixed_day' ? b.dueDay : null,
    dueDays: b.dueMode === 'days_after' ? b.dueDays : null,
    semesterRun: b.semesterRun,
    semesterOffsetDays: b.semesterRun === 'custom' ? b.semesterOffsetDays : null,
    runOn: b.runOn,
    installments: b.installments,
  };
}

/** Keluarkan galat domain sebagai HttpError. */
function translate(error: unknown): never {
  if (error instanceof AutoBillingError || error instanceof FinanceGenerateError) {
    throw new HttpError(error.status, error.code, error.message);
  }
  throw error;
}

/** Penagihan otomatis tagihan sekolah. Modul `finance`. */
export async function financeAutoBillingRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function ruleViews(tx: Tx, schoolId: string, onlyId?: string) {
    const now = new Date();
    const ctx = await loadBillingContext(tx, schoolId, now);
    const rows = await tx
      .select({
        rule: finAutoBillingRule,
        feeName: finFeeType.name,
        feeKind: finFeeType.kind,
        feeActive: finFeeType.active,
      })
      .from(finAutoBillingRule)
      .innerJoin(finFeeType, eq(finFeeType.id, finAutoBillingRule.feeTypeId))
      .where(
        and(
          eq(finAutoBillingRule.schoolId, schoolId),
          onlyId ? eq(finAutoBillingRule.id, onlyId) : undefined,
        ),
      )
      .orderBy(finFeeType.name);
    const last = await tx.execute<RunQueryRow>(sql`
      select distinct on (x.rule_id) x.* from (${RUN_SELECT}) x
      order by x.rule_id, x.started_at desc, x.id desc`);
    const lastByRule = new Map(last.rows.map((r) => [r.rule_id, runView(r)]));
    const views = [];
    for (const { rule, feeName, feeKind, feeActive } of rows) {
      const ev = await evaluateRuleInContext(tx, rule, { kind: feeKind, active: feeActive }, ctx);
      const nextRuns = ev.upcoming.map((p) => ({
        period: p.period,
        runDate: p.runDate,
        dueDate: p.dueDate,
        catchUp: p.runDate < ctx.today,
      }));
      const first = ev.due ?? ev.upcoming[0];
      // Tanggal ISO membandingkan benar secara leksikografis; run yang tertunda (catch-up) berarti "hari ini".
      let nextRunDate: string | null = null;
      if (rule.enabled && !ev.blocked && first) {
        nextRunDate = first.runDate < ctx.today ? ctx.today : first.runDate;
      }
      views.push({
        id: rule.id,
        feeTypeId: rule.feeTypeId,
        feeTypeName: feeName,
        feeKind,
        feeActive,
        enabled: rule.enabled,
        runDay: rule.runDay,
        dueMode: rule.dueMode,
        dueDay: rule.dueDay,
        dueDays: rule.dueDays,
        classIds: rule.classIds && rule.classIds.length > 0 ? rule.classIds : null,
        semesterRun: rule.semesterRun,
        semesterOffsetDays: rule.semesterOffsetDays,
        runOn: rule.runOn,
        installments: rule.installments,
        nextRunDate,
        nextRuns,
        blockedReason: ev.blocked,
        blockedText: ev.blocked ? blockedText(ev.blocked) : null,
        lastRun: lastByRule.get(rule.id) ?? null,
        updatedAt: rule.updatedAt.toISOString(),
      });
    }
    return views;
  }

  async function requireClasses(tx: Tx, ids: string[] | null) {
    if (!ids || ids.length === 0) return;
    const found = await tx.select({ id: classRoom.id }).from(classRoom).where(inArray(classRoom.id, ids));
    if (found.length !== new Set(ids).size) {
      throw new HttpError(400, 'invalid_reference', 'Ada kelas pembatas yang tidak ditemukan.');
    }
  }

  app.get(
    '/v1/finance/auto-billing/rules',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar aturan tagihan otomatis',
        description:
          'Izin: `finance:read`; modul `finance`. Satu aturan per jenis biaya. Tiap aturan membawa `nextRunDate` ' +
          '(hari ini bila ada periode yang tertunda/catch-up), tiga jadwal berikutnya (`nextRuns`), `blockedReason` ' +
          'bila tidak bisa jalan (sekolah ditangguhkan, modul mati, jenis biaya nonaktif, tidak ada tahun ajaran aktif, ' +
          'dll.), dan ringkasan run terakhir (`lastRun`). Tanggal dihitung menurut zona waktu sekolah.',
        headers: schoolHeader,
        response: { 200: z.object({ items: z.array(ruleSchema) }), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => ({ items: await ruleViews(tx, ctx.schoolId) }));
    },
  );

  app.put(
    '/v1/finance/auto-billing/rules',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur aturan tagihan otomatis (upsert)',
        description:
          'Izin: `finance:manage`; modul `finance`. Membuat atau mengganti aturan untuk satu jenis biaya (satu aturan per ' +
          'jenis biaya). Bulanan: `runDay` wajib (tagihan bulan M dibuat pada tanggal itu di bulan M; periode TTTT-BB). ' +
          'Semester: `semesterRun` `start`/`custom` (+ `semesterOffsetDays`) dari tanggal mulai semester pada tabel ' +
          'semester (S1 = semester pertama menurut tanggal, S2 = kedua). Tahunan dan sekali bayar: `runOn` di dalam tahun ' +
          'ajaran aktif. Jatuh tempo: `fixed_day` (`dueDay`; lebih kecil dari tanggal pembuatan = bulan berikutnya) atau ' +
          '`days_after` (`dueDays`). `installments` hanya untuk jenis non-bulanan. Pembuatan tagihan memakai logika yang ' +
          'sama dengan "Buat tagihan massal" sehingga idempoten terhadap tagihan manual. Galat: 400 `invalid_rule` ' +
          '(kolom tidak sah/tidak lengkap), 400 `invalid_reference`, 409 `inactive` (jenis biaya nonaktif; aturan aktif ' +
          'tidak bisa dibuat).',
        headers: schoolHeader,
        body: ruleBody,
        response: { 200: ruleSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const [fee] = await tx.select().from(finFeeType).where(eq(finFeeType.id, b.feeTypeId));
        if (!fee) throw new HttpError(400, 'invalid_reference', 'Jenis biaya tidak ditemukan.');
        if (!fee.active && b.enabled) {
          throw new HttpError(
            409,
            'inactive',
            'Jenis biaya ini tidak aktif; aktifkan dulu atau simpan sebagai nonaktif.',
          );
        }
        const draft = draftOf(fee.kind, b);
        const message = issueMessage(draft);
        if (message) throw new HttpError(400, 'invalid_rule', message);
        await requireClasses(tx, b.classIds);
        const values = {
          enabled: b.enabled,
          runDay: draft.runDay,
          dueMode: draft.dueMode,
          dueDay: draft.dueDay,
          dueDays: draft.dueDays,
          classIds: b.classIds && b.classIds.length > 0 ? b.classIds : null,
          semesterRun: draft.semesterRun,
          semesterOffsetDays: draft.semesterOffsetDays,
          runOn: draft.runOn,
          installments: draft.installments,
          updatedAt: new Date(),
        };
        const [existing] = await tx
          .select({ id: finAutoBillingRule.id })
          .from(finAutoBillingRule)
          .where(eq(finAutoBillingRule.feeTypeId, b.feeTypeId));
        let id: string;
        if (existing) {
          await tx.update(finAutoBillingRule).set(values).where(eq(finAutoBillingRule.id, existing.id));
          id = existing.id;
        } else {
          const [row] = await tx
            .insert(finAutoBillingRule)
            .values({ schoolId: ctx.schoolId, feeTypeId: b.feeTypeId, createdBy: ctx.userId, ...values })
            .returning({ id: finAutoBillingRule.id });
          id = row!.id;
        }
        await audit(tx, ctx, 'finance.auto_billing_rule_set', 'fin_auto_billing_rule', id, {
          feeType: fee.name,
          enabled: b.enabled,
          created: !existing,
          dueMode: draft.dueMode,
          runDay: draft.runDay,
          runOn: draft.runOn,
        });
        const [view] = await ruleViews(tx, ctx.schoolId, id);
        return view!;
      });
    },
  );

  app.delete(
    '/v1/finance/auto-billing/rules/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus aturan tagihan otomatis',
        description:
          'Izin: `finance:manage`; modul `finance`. Menghapus aturan beserta log run-nya. Tagihan yang sudah dibuat tidak ' +
          'berubah. Untuk menghentikan sementara, ubah `enabled` menjadi false lewat PUT. 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const deleted = await tx
          .delete(finAutoBillingRule)
          .where(eq(finAutoBillingRule.id, request.params.id))
          .returning({ id: finAutoBillingRule.id, feeTypeId: finAutoBillingRule.feeTypeId });
        if (deleted.length === 0) throw new HttpError(404, 'not_found', 'Aturan tidak ditemukan.');
        await audit(tx, ctx, 'finance.auto_billing_rule_delete', 'fin_auto_billing_rule', request.params.id, {
          feeTypeId: deleted[0]!.feeTypeId,
        });
        return { ok: true as const };
      });
    },
  );

  app.post(
    '/v1/finance/auto-billing/rules/:id/run-now',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Jalankan aturan sekarang',
        description:
          'Izin: `finance:manage`; modul `finance`. Menjalankan aturan di luar jadwal dengan kode yang sama dengan ' +
          'penjadwal (`trigger` = `manual`), tanpa menunggu tanggal jalan. `period` opsional (TTTT-BB, `S1`/`S2`, atau ' +
          'nama tahun ajaran sesuai jenis biaya); kosong = periode berjalan. Idempoten: tagihan yang sudah ada dilewati. ' +
          'Mengembalikan ringkasan run. Galat: 404 `not_found`, 400 `period_invalid`, 409 `no_year`/`no_semester`/' +
          '`run_on_outside_year` (jadwal tak bisa dihitung), 409 `fee_inactive`, 409 `school_suspended`, 409 `inactive`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ period: z.string().trim().min(1).max(40).nullable().optional() }),
        response: { 200: runViewSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const exists = await tenant(request, async (tx) => {
        const [r] = await tx
          .select({ id: finAutoBillingRule.id })
          .from(finAutoBillingRule)
          .where(eq(finAutoBillingRule.id, request.params.id));
        return Boolean(r);
      });
      if (!exists) throw new HttpError(404, 'not_found', 'Aturan tidak ditemukan.');
      let outcome: Awaited<ReturnType<typeof executeRule>>;
      try {
        outcome = await executeRule(request.server.tenantDb, ctx.schoolId, request.params.id, {
          trigger: 'manual',
          now: new Date(),
          actorId: ctx.userId,
          period: request.body.period ?? null,
        });
      } catch (error) {
        return translate(error);
      }
      if (outcome.kind !== 'ran') {
        throw new HttpError(409, 'nothing_to_run', 'Tidak ada periode yang bisa dijalankan.');
      }
      return tenant(request, async (tx) => {
        const rows = await tx.execute<RunQueryRow>(
          sql`${RUN_SELECT} where r.id = ${outcome.run.runId}::uuid`,
        );
        return runView(rows.rows[0]!);
      });
    },
  );

  app.get(
    '/v1/finance/auto-billing/runs',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Log penagihan otomatis',
        description:
          'Izin: `finance:read`; modul `finance`. Riwayat run (otomatis dan manual), terbaru lebih dulu. Filter opsional ' +
          '`ruleId`, `status`. `limit` maks 100 (bawaan 25), `offset` bawaan 0. Run yang hasilnya sama dengan upaya ' +
          'sebelumnya hanya memperbarui waktu selesai agar log tidak membengkak. Log disimpan 24 bulan terakhir.',
        headers: schoolHeader,
        querystring: z.object({
          ruleId: z.uuid().optional(),
          status: z.enum(AUTO_BILLING_STATUSES).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(runViewSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) => {
      const { ruleId, status, limit, offset } = request.query;
      return tenant(request, async (tx) => {
        const where = and(
          ruleId ? eq(finAutoBillingRun.ruleId, ruleId) : undefined,
          status ? eq(finAutoBillingRun.status, status) : undefined,
        );
        const [totalRow] = await tx.select({ n: count() }).from(finAutoBillingRun).where(where);
        const ids = await tx
          .select({ id: finAutoBillingRun.id })
          .from(finAutoBillingRun)
          .where(where)
          .orderBy(desc(finAutoBillingRun.startedAt), desc(finAutoBillingRun.id))
          .limit(limit)
          .offset(offset);
        if (ids.length === 0) return { items: [], total: totalRow?.n ?? 0 };
        const rows = await tx.execute<RunQueryRow>(sql`${RUN_SELECT}
          where r.id in (${sql.join(
            ids.map((i) => sql`${i.id}::uuid`),
            sql`, `,
          )})
          order by r.started_at desc, r.id desc`);
        return { items: rows.rows.map(runView), total: totalRow?.n ?? 0 };
      });
    },
  );

  app.post(
    '/v1/finance/auto-billing/preview',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pratinjau aturan tagihan otomatis',
        description:
          'Izin: `finance:read`; modul `finance`. Tanpa menyimpan apa pun. Mengembalikan tiga jadwal berikutnya ' +
          '(tanggal pembuatan dan jatuh tempo) serta perkiraan untuk periode terdekat: jumlah tagihan yang akan dibuat ' +
          '(`wouldCreate`), yang sudah ada (`alreadyBilled`), gratis, dan siswa tanpa tarif (`missingPlan`). ' +
          '`error` berisi kode bila perkiraan tak bisa dihitung (mis. `inactive`, `no_year`, `no_semester`).',
        headers: schoolHeader,
        body: z.object({ feeTypeId: z.uuid(), ruleDraft: ruleFields }),
        response: {
          200: z.object({
            nextRuns: z.array(nextRunSchema),
            forPeriod: z.string().nullable(),
            wouldCreate: z.number().int().nullable(),
            alreadyBilled: z.number().int().nullable(),
            free: z.number().int().nullable(),
            missingPlan: z.number().int().nullable(),
            error: z.string().nullable(),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { feeTypeId, ruleDraft } = request.body;
      return tenant(request, async (tx) => {
        const [fee] = await tx.select().from(finFeeType).where(eq(finFeeType.id, feeTypeId));
        if (!fee) throw new HttpError(400, 'invalid_reference', 'Jenis biaya tidak ditemukan.');
        const draft = draftOf(fee.kind, ruleDraft);
        const message = issueMessage(draft);
        if (message) throw new HttpError(400, 'invalid_rule', message);
        return previewAutoBilling(tx, {
          schoolId: ctx.schoolId,
          feeTypeId,
          draft,
          classIds: ruleDraft.classIds,
          now: new Date(),
        });
      });
    },
  );
}
