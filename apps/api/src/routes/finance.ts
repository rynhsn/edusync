import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  finFeePlan,
  finFeeType,
  finInvoice,
  finPayment,
  finPaymentItem,
  gte,
  inArray,
  isNull,
  lt,
  reportSetting,
  school,
  sql,
  student,
  type Tx,
  user,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { type InvoiceView, invoiceRows, PERIOD_PATTERN, paidFor, periodLabel } from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const payGate = [requirePermission('finance:pay'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const KINDS = ['monthly', 'one_time', 'yearly'] as const;
const METHODS = ['cash', 'transfer', 'other'] as const;
const INVOICE_STATUS = ['unpaid', 'partial', 'paid', 'void'] as const;

const rupiah = z.number().int().min(0).max(2_000_000_000);

/* ---------- Skema ---------- */

const feeTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(KINDS),
  active: z.boolean(),
  planCount: z.number().int().describe('Jumlah tarif yang memakai jenis biaya ini'),
  invoiceCount: z.number().int().describe('Jumlah tagihan yang memakai jenis biaya ini'),
});
const feeTypeBody = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(KINDS),
  active: z.boolean().default(true),
});

const planSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  feeTypeId: z.uuid(),
  feeTypeName: z.string(),
  level: z.string().nullable().describe('Tingkat; kosong = semua tingkat'),
  amount: z.number().int(),
});
const planBody = z.object({
  academicYearId: z.uuid(),
  feeTypeId: z.uuid(),
  level: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v)),
  amount: rupiah,
});

const invoiceSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  nis: z.string().nullable(),
  className: z.string().nullable(),
  feeTypeId: z.uuid(),
  feeTypeName: z.string(),
  title: z.string(),
  period: z.string().nullable(),
  amount: z.number().int(),
  discount: z.number().int(),
  discountReason: z.string().nullable(),
  paid: z.number().int().describe('Jumlah terbayar (kwitansi tidak batal)'),
  outstanding: z.number().int().describe('amount - discount - paid; 0 untuk tagihan batal'),
  dueDate: z.iso.date(),
  status: z.enum(INVOICE_STATUS),
  overdue: z.boolean().describe('Masih ada sisa dan sudah lewat jatuh tempo'),
});

const paymentSummarySchema = z.object({
  id: z.uuid(),
  receiptNo: z.string(),
  paidAt: z.iso.datetime({ offset: true }),
  method: z.enum(METHODS),
  total: z.number().int(),
  voided: z.boolean(),
  studentId: z.uuid(),
  studentName: z.string(),
  nis: z.string().nullable(),
});

const receiptSchema = z.object({
  id: z.uuid(),
  receiptNo: z.string(),
  paidAt: z.iso.datetime({ offset: true }),
  method: z.enum(METHODS),
  total: z.number().int(),
  note: z.string().nullable(),
  voided: z.boolean(),
  voidReason: z.string().nullable(),
  cashierName: z.string().nullable(),
  school: z.object({ name: z.string(), address: z.string().nullable() }),
  student: z.object({
    id: z.uuid(),
    name: z.string(),
    nis: z.string().nullable(),
    className: z.string().nullable(),
  }),
  items: z.array(z.object({ invoiceId: z.uuid(), title: z.string(), amount: z.number().int() })),
});

const reason = z.string().trim().min(1).max(300);

/** Keuangan sekolah: jenis biaya, tarif, tagihan, kwitansi pembayaran, dan laporan. Modul `finance`. */
export async function financeRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Rujukan ---------- */

  async function requireYear(tx: Tx, id: string) {
    const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, id));
    if (!y) throw invalidRef('Tahun ajaran tidak ditemukan.');
    return y;
  }
  async function requireFeeType(tx: Tx, id: string) {
    const [f] = await tx.select().from(finFeeType).where(eq(finFeeType.id, id));
    if (!f) throw invalidRef('Jenis biaya tidak ditemukan.');
    return f;
  }

  /** Nama kelas siswa pada satu tahun ajaran (bila terdaftar). */
  async function classNameOf(tx: Tx, studentId: string, academicYearId: string) {
    const [row] = await tx
      .select({ name: classRoom.name })
      .from(enrollment)
      .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
      .where(and(eq(enrollment.studentId, studentId), eq(enrollment.academicYearId, academicYearId)));
    return row?.name ?? null;
  }

  /* ---------- Jenis biaya ---------- */

  async function feeTypeViews(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select()
      .from(finFeeType)
      .where(onlyId ? eq(finFeeType.id, onlyId) : undefined)
      .orderBy(asc(finFeeType.name));
    const plans = await tx
      .select({ id: finFeePlan.feeTypeId, n: count() })
      .from(finFeePlan)
      .groupBy(finFeePlan.feeTypeId);
    const invoices = await tx
      .select({ id: finInvoice.feeTypeId, n: count() })
      .from(finInvoice)
      .groupBy(finInvoice.feeTypeId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      active: r.active,
      planCount: plans.find((p) => p.id === r.id)?.n ?? 0,
      invoiceCount: invoices.find((p) => p.id === r.id)?.n ?? 0,
    }));
  }

  app.get(
    '/v1/finance/fee-types',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar jenis biaya',
        description:
          'Izin: `finance:read`; modul `finance`. Urut nama. `planCount` dan `invoiceCount` = pemakaian jenis biaya ini.',
        headers: schoolHeader,
        response: { 200: z.array(feeTypeSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => feeTypeViews(tx)),
  );

  app.post(
    '/v1/finance/fee-types',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah jenis biaya',
        description:
          'Izin: `finance:manage`; modul `finance`. `kind`: `monthly` (per bulan, mis. SPP), `one_time` (sekali), `yearly` ' +
          '(per tahun ajaran). Nama unik di sekolah (409 `conflict`).',
        headers: schoolHeader,
        body: feeTypeBody,
        response: { 201: feeTypeSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama jenis biaya itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .insert(finFeeType)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: finFeeType.id });
          await audit(tx, ctx, 'finance.fee_type_create', 'fin_fee_type', row!.id, request.body);
          return (await feeTypeViews(tx, row!.id))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/finance/fee-types/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah jenis biaya',
        description:
          'Izin: `finance:manage`; modul `finance`. Nama unik (409 `conflict`); 404 `not_found` bila tak ada. ' +
          'Mengubah `kind` ditolak 409 `in_use` bila sudah ada tagihan yang memakainya.',
        headers: schoolHeader,
        params: idParams,
        body: feeTypeBody,
        response: { 200: feeTypeSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama jenis biaya itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [current] = await tx.select().from(finFeeType).where(eq(finFeeType.id, request.params.id));
          if (!current) throw notFound('Jenis biaya');
          if (current.kind !== request.body.kind) {
            const [used] = await tx
              .select({ n: count() })
              .from(finInvoice)
              .where(eq(finInvoice.feeTypeId, current.id));
            if ((used?.n ?? 0) > 0) {
              throw new HttpError(
                409,
                'in_use',
                'Jenis biaya ini sudah punya tagihan; jenisnya tidak bisa diubah.',
              );
            }
          }
          await tx.update(finFeeType).set(request.body).where(eq(finFeeType.id, current.id));
          await audit(tx, ctx, 'finance.fee_type_update', 'fin_fee_type', current.id, request.body);
          return (await feeTypeViews(tx, current.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/finance/fee-types/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus jenis biaya',
        description:
          'Izin: `finance:manage`; modul `finance`. Ditolak 409 `in_use` bila dipakai tarif atau tagihan (nonaktifkan ' +
          'saja); 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const id = request.params.id;
      return tenant(request, async (tx) => {
        const [current] = await tx.select().from(finFeeType).where(eq(finFeeType.id, id));
        if (!current) throw notFound('Jenis biaya');
        const [view] = await feeTypeViews(tx, id);
        if (view!.planCount > 0 || view!.invoiceCount > 0) {
          throw new HttpError(
            409,
            'in_use',
            'Jenis biaya ini sudah dipakai tarif atau tagihan; nonaktifkan saja.',
          );
        }
        await tx.delete(finFeeType).where(eq(finFeeType.id, id));
        await audit(tx, ctx, 'finance.fee_type_delete', 'fin_fee_type', id, { name: current.name });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Tarif ---------- */

  async function planViews(tx: Tx, academicYearId: string) {
    return tx
      .select({
        id: finFeePlan.id,
        academicYearId: finFeePlan.academicYearId,
        feeTypeId: finFeePlan.feeTypeId,
        feeTypeName: finFeeType.name,
        level: finFeePlan.level,
        amount: finFeePlan.amount,
      })
      .from(finFeePlan)
      .innerJoin(finFeeType, eq(finFeeType.id, finFeePlan.feeTypeId))
      .where(eq(finFeePlan.academicYearId, academicYearId))
      .orderBy(asc(finFeeType.name), sql`${finFeePlan.level} nulls first`);
  }

  app.get(
    '/v1/finance/fee-plans',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar tarif',
        description:
          'Izin: `finance:read`; modul `finance`. Tarif satu tahun ajaran (`academicYearId` wajib), urut jenis biaya lalu ' +
          'tingkat (tingkat kosong = semua tingkat, tampil lebih dulu).',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid() }),
        response: { 200: z.array(planSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => planViews(tx, request.query.academicYearId)),
  );

  app.put(
    '/v1/finance/fee-plans',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur tarif (upsert)',
        description:
          'Izin: `finance:manage`; modul `finance`. Membuat atau mengganti tarif untuk kombinasi tahun ajaran, jenis ' +
          'biaya, dan tingkat (`level` null = semua tingkat; cocokkan dengan `level` kelas). `amount` rupiah bulat >= 0. ' +
          'Tarif yang berubah tidak mengubah tagihan yang sudah dibuat. 400 `invalid_reference` bila tahun ajaran atau ' +
          'jenis biaya tidak ditemukan.',
        headers: schoolHeader,
        body: planBody,
        response: { 200: planSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Tarif itu sedang diubah pengguna lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          await requireYear(tx, b.academicYearId);
          const fee = await requireFeeType(tx, b.feeTypeId);
          const [existing] = await tx
            .select({ id: finFeePlan.id })
            .from(finFeePlan)
            .where(
              and(
                eq(finFeePlan.academicYearId, b.academicYearId),
                eq(finFeePlan.feeTypeId, b.feeTypeId),
                b.level === null ? isNull(finFeePlan.level) : eq(finFeePlan.level, b.level),
              ),
            );
          let planId: string;
          if (existing) {
            await tx.update(finFeePlan).set({ amount: b.amount }).where(eq(finFeePlan.id, existing.id));
            planId = existing.id;
          } else {
            const [row] = await tx
              .insert(finFeePlan)
              .values({ schoolId: ctx.schoolId, ...b })
              .returning({ id: finFeePlan.id });
            planId = row!.id;
          }
          await audit(tx, ctx, 'finance.fee_plan_set', 'fin_fee_plan', planId, {
            feeType: fee.name,
            level: b.level,
            amount: b.amount,
          });
          const views = await planViews(tx, b.academicYearId);
          return views.find((p) => p.id === planId)!;
        }),
      );
    },
  );

  app.delete(
    '/v1/finance/fee-plans/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus tarif',
        description:
          'Izin: `finance:manage`; modul `finance`. Tagihan yang sudah dibuat dari tarif ini tidak berubah. 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const deleted = await tx
          .delete(finFeePlan)
          .where(eq(finFeePlan.id, request.params.id))
          .returning({ id: finFeePlan.id });
        if (deleted.length === 0) throw notFound('Tarif');
        await audit(tx, ctx, 'finance.fee_plan_delete', 'fin_fee_plan', request.params.id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Tagihan ---------- */

  const generateBody = z.object({
    academicYearId: z.uuid(),
    feeTypeId: z.uuid(),
    period: z.string().nullable().describe('TTTT-BB untuk biaya bulanan; null untuk lainnya'),
    classId: z.uuid().nullable(),
    dueDate: z.iso.date(),
  });

  app.post(
    '/v1/finance/invoices/generate',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Buat tagihan massal',
        description:
          'Izin: `finance:manage`; modul `finance`. Membuat tagihan untuk setiap siswa aktif yang terdaftar di tahun ' +
          'ajaran itu (dibatasi `classId` bila diisi). Tarif dipilih dari tingkat kelas siswa; tarif tingkat yang cocok ' +
          'diutamakan daripada tarif semua tingkat (level null). Siswa tanpa tarif tidak dibuatkan tagihan dan ' +
          'dilaporkan di `missingPlan`. Idempoten: tagihan yang sudah ada (siswa, tahun, jenis biaya, periode) ' +
          'dilewati dan dihitung di `skipped`. Judul otomatis, mis. "SPP Agustus 2026". Galat: 400 `period_required` ' +
          '(`period` wajib TTTT-BB untuk jenis `monthly`, dan harus null untuk jenis lain), 400 `invalid_reference`, ' +
          '409 `inactive` (jenis biaya nonaktif).',
        headers: schoolHeader,
        body: generateBody,
        response: {
          200: z.object({
            created: z.number().int(),
            skipped: z.number().int(),
            missingPlan: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                className: z.string(),
                level: z.string(),
              }),
            ),
          }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const year = await requireYear(tx, b.academicYearId);
        const fee = await requireFeeType(tx, b.feeTypeId);
        if (fee.kind === 'monthly') {
          if (!b.period || !PERIOD_PATTERN.test(b.period)) {
            throw new HttpError(
              400,
              'period_required',
              'Biaya bulanan wajib punya periode berformat TTTT-BB.',
            );
          }
        } else if (b.period !== null) {
          throw new HttpError(
            400,
            'period_required',
            'Periode hanya untuk biaya bulanan; isi null untuk jenis ini.',
          );
        }
        if (!fee.active) throw new HttpError(409, 'inactive', 'Jenis biaya ini tidak aktif.');
        if (b.classId) {
          const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, b.classId));
          if (!cls || cls.academicYearId !== year.id) {
            throw invalidRef('Kelas tidak ditemukan pada tahun ajaran itu.');
          }
        }

        const plans = await tx
          .select()
          .from(finFeePlan)
          .where(and(eq(finFeePlan.academicYearId, year.id), eq(finFeePlan.feeTypeId, fee.id)));
        const byLevel = new Map(
          plans.filter((p) => p.level !== null).map((p) => [p.level as string, p.amount]),
        );
        const allLevels = plans.find((p) => p.level === null)?.amount;

        const roster = await tx
          .select({
            id: student.id,
            name: student.name,
            nis: student.nis,
            className: classRoom.name,
            level: classRoom.level,
          })
          .from(enrollment)
          .innerJoin(student, eq(student.id, enrollment.studentId))
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(
            and(
              eq(enrollment.academicYearId, year.id),
              isNull(student.deletedAt),
              eq(student.status, 'active'),
              b.classId ? eq(enrollment.classId, b.classId) : undefined,
            ),
          )
          .orderBy(asc(student.name), asc(student.id));

        const existing = await tx
          .select({ studentId: finInvoice.studentId })
          .from(finInvoice)
          .where(
            and(
              eq(finInvoice.academicYearId, year.id),
              eq(finInvoice.feeTypeId, fee.id),
              b.period === null ? isNull(finInvoice.period) : eq(finInvoice.period, b.period),
            ),
          );
        const have = new Set(existing.map((e) => e.studentId));

        const title = b.period ? `${fee.name} ${periodLabel(b.period)}` : `${fee.name} ${year.name}`;
        const missingPlan: {
          studentId: string;
          name: string;
          nis: string | null;
          className: string;
          level: string;
        }[] = [];
        const toCreate: (typeof finInvoice.$inferInsert)[] = [];
        let skipped = 0;
        for (const s of roster) {
          if (have.has(s.id)) {
            skipped++;
            continue;
          }
          const amount = byLevel.get(s.level) ?? allLevels;
          if (amount === undefined) {
            missingPlan.push({
              studentId: s.id,
              name: s.name,
              nis: s.nis,
              className: s.className,
              level: s.level,
            });
            continue;
          }
          toCreate.push({
            schoolId: ctx.schoolId,
            studentId: s.id,
            academicYearId: year.id,
            feeTypeId: fee.id,
            period: b.period,
            title,
            amount,
            dueDate: b.dueDate,
            createdBy: ctx.userId,
          });
        }

        let created = 0;
        for (let i = 0; i < toCreate.length; i += 500) {
          const inserted = await tx
            .insert(finInvoice)
            .values(toCreate.slice(i, i + 500))
            .onConflictDoNothing()
            .returning({ id: finInvoice.id });
          created += inserted.length;
        }
        skipped += toCreate.length - created;
        await audit(tx, ctx, 'finance.invoice_generate', 'fin_invoice', fee.id, {
          academicYearId: year.id,
          period: b.period,
          classId: b.classId,
          created,
          skipped,
          missingPlan: missingPlan.length,
        });
        return { created, skipped, missingPlan };
      });
    },
  );

  app.get(
    '/v1/finance/invoices',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar tagihan',
        description:
          'Izin: `finance:read`; modul `finance`. Filter opsional: `academicYearId`, `classId` (kelas siswa pada tahun ' +
          'tagihan), `studentId`, `feeTypeId`, `period`, `status`. Status diturunkan dari kwitansi yang tidak batal: ' +
          '`unpaid`, `partial`, `paid`, `void`. Urut jatuh tempo, nama siswa. `limit` maks 100 (bawaan 50), `offset` ' +
          'bawaan 0. `overdue` = masih ada sisa dan lewat jatuh tempo (hari ini menurut zona Jakarta).',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid().optional(),
          classId: z.uuid().optional(),
          studentId: z.uuid().optional(),
          feeTypeId: z.uuid().optional(),
          period: z.string().regex(PERIOD_PATTERN).optional(),
          status: z.enum(INVOICE_STATUS).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({ items: z.array(invoiceSchema), total: z.number().int() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { limit, offset, ...filter } = request.query;
      return tenant(request, (tx) => invoiceRows(tx, filter, { limit, offset }));
    },
  );

  /** Kunci satu tagihan (FOR UPDATE) agar pembayaran dan perubahan lain berjalan bergantian. */
  async function lockInvoice(tx: Tx, id: string) {
    const [inv] = await tx.select().from(finInvoice).where(eq(finInvoice.id, id)).for('update');
    if (!inv) throw notFound('Tagihan');
    return inv;
  }

  app.put(
    '/v1/finance/invoices/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah diskon dan jatuh tempo tagihan',
        description:
          'Izin: `finance:manage`; modul `finance`. `discount` rupiah bulat, tidak boleh melebihi nominal tagihan ' +
          '(400 `invalid_discount`) dan tidak boleh membuat sisa menjadi negatif karena sudah ada pembayaran ' +
          '(409 `overpay`). 409 `invoice_void` bila tagihan sudah dibatalkan; 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          discount: rupiah,
          discountReason: z.string().trim().max(300).nullable().default(null),
          dueDate: z.iso.date(),
        }),
        response: { 200: invoiceSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const inv = await lockInvoice(tx, request.params.id);
        if (inv.status === 'void') throw new HttpError(409, 'invoice_void', 'Tagihan ini sudah dibatalkan.');
        if (b.discount > inv.amount) {
          throw new HttpError(400, 'invalid_discount', 'Diskon tidak boleh melebihi nominal tagihan.');
        }
        const paid = (await paidFor(tx, [inv.id])).get(inv.id) ?? 0;
        if (inv.amount - b.discount < paid) {
          throw new HttpError(
            409,
            'overpay',
            'Diskon itu membuat tagihan lebih kecil dari yang sudah dibayar.',
          );
        }
        await tx
          .update(finInvoice)
          .set({ discount: b.discount, discountReason: b.discountReason || null, dueDate: b.dueDate })
          .where(eq(finInvoice.id, inv.id));
        await audit(tx, ctx, 'finance.invoice_update', 'fin_invoice', inv.id, {
          discount: b.discount,
          discountReason: b.discountReason,
          dueDate: b.dueDate,
        });
        return (await invoiceViewOf(tx, inv.id))!;
      });
    },
  );

  /** Satu tagihan dalam bentuk tampilan (jumlah terbayar, status turunan). */
  async function invoiceViewOf(tx: Tx, id: string): Promise<InvoiceView | undefined> {
    const [inv] = await tx
      .select({ studentId: finInvoice.studentId, academicYearId: finInvoice.academicYearId })
      .from(finInvoice)
      .where(eq(finInvoice.id, id));
    if (!inv) return undefined;
    const { items } = await invoiceRows(tx, inv);
    return items.find((i) => i.id === id);
  }

  app.post(
    '/v1/finance/invoices/:id/void',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Batalkan tagihan',
        description:
          'Izin: `finance:manage`; modul `finance`. `reason` wajib. 409 `has_payments` bila sudah ada pembayaran ' +
          'aktif (batalkan kwitansinya dulu); 409 `invoice_void` bila sudah dibatalkan; 404 `not_found` bila tak ada. ' +
          'Tagihan batal tetap tercatat dan tidak dihitung sebagai tunggakan.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ reason }),
        response: { 200: invoiceSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const inv = await lockInvoice(tx, request.params.id);
        if (inv.status === 'void') throw new HttpError(409, 'invoice_void', 'Tagihan ini sudah dibatalkan.');
        const paid = (await paidFor(tx, [inv.id])).get(inv.id) ?? 0;
        if (paid > 0) {
          throw new HttpError(
            409,
            'has_payments',
            'Tagihan ini sudah punya pembayaran; batalkan kwitansinya terlebih dahulu.',
          );
        }
        await tx
          .update(finInvoice)
          .set({ status: 'void', voidReason: request.body.reason })
          .where(eq(finInvoice.id, inv.id));
        await audit(tx, ctx, 'finance.invoice_void', 'fin_invoice', inv.id, { reason: request.body.reason });
        return (await invoiceViewOf(tx, inv.id))!;
      });
    },
  );

  /* ---------- Rekening siswa ---------- */

  app.get(
    '/v1/finance/students/:studentId/statement',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rekening siswa',
        description:
          'Izin: `finance:read`; modul `finance`. Semua tagihan siswa pada satu tahun ajaran (`academicYearId` wajib), ' +
          'kwitansi yang menyentuh tagihan itu (termasuk yang batal, bertanda `voided`), dan total. `totals` tidak ' +
          'menghitung tagihan batal maupun kwitansi batal. 404 `not_found` bila siswa tak ada.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        querystring: z.object({ academicYearId: z.uuid() }),
        response: {
          200: z.object({
            student: z.object({
              id: z.uuid(),
              name: z.string(),
              nis: z.string().nullable(),
              className: z.string().nullable(),
            }),
            invoices: z.array(invoiceSchema),
            payments: z.array(
              z.object({
                id: z.uuid(),
                receiptNo: z.string(),
                paidAt: z.iso.datetime({ offset: true }),
                method: z.enum(METHODS),
                total: z.number().int(),
                voided: z.boolean(),
              }),
            ),
            totals: z.object({
              billed: z.number().int(),
              discount: z.number().int(),
              paid: z.number().int(),
              outstanding: z.number().int(),
            }),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { studentId } = request.params;
      const { academicYearId } = request.query;
      return tenant(request, async (tx) => {
        const [stu] = await tx.select().from(student).where(eq(student.id, studentId));
        if (!stu) throw notFound('Siswa');
        const className = await classNameOf(tx, studentId, academicYearId);
        const { items } = await invoiceRows(tx, { studentId, academicYearId });
        const payRows = await tx
          .select({
            id: finPayment.id,
            receiptNo: finPayment.receiptNo,
            paidAt: finPayment.paidAt,
            method: finPayment.method,
            total: finPayment.total,
            voidedAt: finPayment.voidedAt,
          })
          .from(finPayment)
          .where(
            and(
              eq(finPayment.studentId, studentId),
              sql`exists (select 1 from fin_payment_item pi join fin_invoice i on i.id = pi.invoice_id
                where pi.payment_id = ${finPayment.id} and i.academic_year_id = ${academicYearId})`,
            ),
          )
          .orderBy(desc(finPayment.paidAt), desc(finPayment.receiptNo));
        const live = items.filter((i) => i.status !== 'void');
        const totals = {
          billed: live.reduce((a, i) => a + i.amount, 0),
          discount: live.reduce((a, i) => a + i.discount, 0),
          paid: live.reduce((a, i) => a + i.paid, 0),
          outstanding: live.reduce((a, i) => a + i.outstanding, 0),
        };
        return {
          student: { id: stu.id, name: stu.name, nis: stu.nis, className },
          invoices: items,
          payments: payRows.map((p) => ({
            id: p.id,
            receiptNo: p.receiptNo,
            paidAt: p.paidAt.toISOString(),
            method: p.method,
            total: p.total,
            voided: p.voidedAt !== null,
          })),
          totals,
        };
      });
    },
  );

  /* ---------- Pembayaran ---------- */

  async function receiptView(tx: Tx, id: string) {
    const [p] = await tx.select().from(finPayment).where(eq(finPayment.id, id));
    if (!p) throw notFound('Kwitansi');
    const [stu] = await tx.select().from(student).where(eq(student.id, p.studentId));
    const items = await tx
      .select({
        invoiceId: finPaymentItem.invoiceId,
        title: finInvoice.title,
        amount: finPaymentItem.amount,
        academicYearId: finInvoice.academicYearId,
      })
      .from(finPaymentItem)
      .innerJoin(finInvoice, eq(finInvoice.id, finPaymentItem.invoiceId))
      .where(eq(finPaymentItem.paymentId, id))
      .orderBy(asc(finInvoice.dueDate), asc(finInvoice.title), asc(finInvoice.id));
    const yearId = items[0]?.academicYearId;
    const className = yearId ? await classNameOf(tx, p.studentId, yearId) : null;
    const [sch] = await tx.select({ name: school.name }).from(school).where(eq(school.id, p.schoolId));
    const [setting] = await tx
      .select({ address: reportSetting.address })
      .from(reportSetting)
      .where(eq(reportSetting.schoolId, p.schoolId));
    const [cashier] = await tx.select({ name: user.name }).from(user).where(eq(user.id, p.recordedBy));
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      paidAt: p.paidAt.toISOString(),
      method: p.method,
      total: p.total,
      note: p.note,
      voided: p.voidedAt !== null,
      voidReason: p.voidReason,
      cashierName: cashier?.name ?? null,
      school: { name: sch?.name ?? '', address: setting?.address ?? null },
      student: { id: p.studentId, name: stu?.name ?? '', nis: stu?.nis ?? null, className },
      items: items.map((i) => ({ invoiceId: i.invoiceId, title: i.title, amount: i.amount })),
    };
  }

  app.post(
    '/v1/finance/payments',
    {
      onRequest: payGate,
      schema: {
        tags: tag,
        summary: 'Catat pembayaran (buat kwitansi)',
        description:
          'Izin: `finance:pay`; modul `finance`. Satu kwitansi untuk 1..50 tagihan milik satu siswa; `total` = jumlah ' +
          'item. Tiap `amount` bilangan bulat > 0 dan tidak boleh melebihi sisa tagihan saat ini; pemeriksaan dilakukan ' +
          'di dalam transaksi dengan penguncian baris tagihan sehingga pembayaran paralel tidak bisa melebihi sisa. ' +
          'Nomor kwitansi `KWT-{tahun}-{6 digit}` dibuat atomik dan berurutan per sekolah per tahun. `paidAt` bawaan ' +
          'sekarang. Galat: 400 `invalid_reference` (siswa/tagihan tak ditemukan atau bukan milik siswa itu), 400 ' +
          '`duplicate_item` (tagihan yang sama dua kali), 409 `invoice_void`, 409 `overpay`.',
        headers: schoolHeader,
        body: z.object({
          studentId: z.uuid(),
          method: z.enum(METHODS),
          paidAt: z.iso.datetime({ offset: true }).optional(),
          note: z.string().trim().max(300).optional(),
          items: z
            .array(z.object({ invoiceId: z.uuid(), amount: z.number().int().min(1).max(2_000_000_000) }))
            .min(1)
            .max(50),
        }),
        response: { 201: receiptSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const ids = b.items.map((i) => i.invoiceId);
      if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, 'duplicate_item', 'Satu tagihan hanya boleh muncul sekali dalam kwitansi.');
      }
      const total = b.items.reduce((a, i) => a + i.amount, 0);
      if (total > 2_000_000_000) throw new HttpError(400, 'validation', 'Total pembayaran terlalu besar.');
      const created = await tenant(request, async (tx) => {
        const [stu] = await tx.select({ id: student.id }).from(student).where(eq(student.id, b.studentId));
        if (!stu) throw invalidRef('Siswa tidak ditemukan.');
        // Urut id agar dua kwitansi yang menyentuh tagihan sama tidak saling menunggu (tanpa deadlock).
        const locked = await tx
          .select()
          .from(finInvoice)
          .where(inArray(finInvoice.id, ids))
          .orderBy(asc(finInvoice.id))
          .for('update');
        if (locked.length !== ids.length || locked.some((i) => i.studentId !== b.studentId)) {
          throw invalidRef('Tagihan tidak ditemukan atau bukan milik siswa ini.');
        }
        if (locked.some((i) => i.status === 'void')) {
          throw new HttpError(409, 'invoice_void', 'Ada tagihan yang sudah dibatalkan.');
        }
        const paid = await paidFor(tx, ids);
        for (const item of b.items) {
          const inv = locked.find((i) => i.id === item.invoiceId)!;
          const outstanding = inv.amount - inv.discount - (paid.get(inv.id) ?? 0);
          if (item.amount > outstanding) {
            throw new HttpError(
              409,
              'overpay',
              `Pembayaran untuk "${inv.title}" melebihi sisa tagihan (sisa Rp ${outstanding}).`,
            );
          }
        }

        const year = Number(todayInJakarta().slice(0, 4));
        const counter = await tx.execute<{ last: number }>(sql`
          insert into fin_counter (school_id, year, last) values (${ctx.schoolId}, ${year}, 1)
          on conflict (school_id, year) do update set last = fin_counter.last + 1
          returning last`);
        const receiptNo = `KWT-${year}-${String(counter.rows[0]!.last).padStart(6, '0')}`;

        const [pay] = await tx
          .insert(finPayment)
          .values({
            schoolId: ctx.schoolId,
            receiptNo,
            studentId: b.studentId,
            paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
            method: b.method,
            total,
            note: b.note || null,
            recordedBy: ctx.userId,
          })
          .returning({ id: finPayment.id });
        await tx.insert(finPaymentItem).values(
          b.items.map((i) => ({
            schoolId: ctx.schoolId,
            paymentId: pay!.id,
            invoiceId: i.invoiceId,
            amount: i.amount,
          })),
        );
        await audit(tx, ctx, 'finance.payment_create', 'fin_payment', pay!.id, {
          receiptNo,
          studentId: b.studentId,
          method: b.method,
          total,
          invoices: ids.length,
        });
        return receiptView(tx, pay!.id);
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/v1/finance/payments',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar kwitansi',
        description:
          'Izin: `finance:read`; modul `finance`. Filter opsional: `from`/`to` (tanggal bayar, inklusif, zona Jakarta), ' +
          '`studentId`, `method`, `status` (`active` atau `void`). Terbaru lebih dulu. `limit` maks 100 (bawaan 50).',
        headers: schoolHeader,
        querystring: z.object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          studentId: z.uuid().optional(),
          method: z.enum(METHODS).optional(),
          status: z.enum(['active', 'void']).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({ items: z.array(paymentSummarySchema), total: z.number().int() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const q = request.query;
      const where = and(
        q.from
          ? gte(finPayment.paidAt, sql`(${q.from}::date)::timestamp at time zone 'Asia/Jakarta'`)
          : undefined,
        q.to
          ? lt(finPayment.paidAt, sql`((${q.to}::date + 1)::timestamp at time zone 'Asia/Jakarta')`)
          : undefined,
        q.studentId ? eq(finPayment.studentId, q.studentId) : undefined,
        q.method ? eq(finPayment.method, q.method) : undefined,
        q.status === 'active' ? isNull(finPayment.voidedAt) : undefined,
        q.status === 'void' ? sql`${finPayment.voidedAt} is not null` : undefined,
      );
      return tenant(request, async (tx) => {
        const rows = await tx
          .select({
            id: finPayment.id,
            receiptNo: finPayment.receiptNo,
            paidAt: finPayment.paidAt,
            method: finPayment.method,
            total: finPayment.total,
            voidedAt: finPayment.voidedAt,
            studentId: finPayment.studentId,
            studentName: student.name,
            nis: student.nis,
          })
          .from(finPayment)
          .innerJoin(student, eq(student.id, finPayment.studentId))
          .where(where)
          .orderBy(desc(finPayment.paidAt), desc(finPayment.receiptNo))
          .limit(q.limit)
          .offset(q.offset);
        const [totalRow] = await tx.select({ n: count() }).from(finPayment).where(where);
        return {
          items: rows.map((r) => ({
            id: r.id,
            receiptNo: r.receiptNo,
            paidAt: r.paidAt.toISOString(),
            method: r.method,
            total: r.total,
            voided: r.voidedAt !== null,
            studentId: r.studentId,
            studentName: r.studentName,
            nis: r.nis,
          })),
          total: totalRow?.n ?? 0,
        };
      });
    },
  );

  app.get(
    '/v1/finance/payments/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Detail kwitansi',
        description:
          'Izin: `finance:read`; modul `finance`. Data cetak kwitansi: nomor, siswa, rincian tagihan, nama kasir, dan ' +
          'tanda batal (`voided`, `voidReason`). `school.address` diambil dari pengaturan rapor (null bila belum diisi). ' +
          '404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: receiptSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => receiptView(tx, request.params.id)),
  );

  app.post(
    '/v1/finance/payments/:id/void',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Batalkan kwitansi',
        description:
          'Izin: `finance:manage`; modul `finance`. `reason` wajib. Kwitansi tetap tercatat dengan tanda batal; nominalnya ' +
          'tidak lagi dihitung sehingga sisa tagihan pulih. 409 `payment_void` bila sudah dibatalkan; 404 `not_found` ' +
          'bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ reason }),
        response: { 200: receiptSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [p] = await tx
          .select()
          .from(finPayment)
          .where(eq(finPayment.id, request.params.id))
          .for('update');
        if (!p) throw notFound('Kwitansi');
        if (p.voidedAt) throw new HttpError(409, 'payment_void', 'Kwitansi ini sudah dibatalkan.');
        await tx
          .update(finPayment)
          .set({ voidedAt: new Date(), voidedBy: ctx.userId, voidReason: request.body.reason })
          .where(eq(finPayment.id, p.id));
        await audit(tx, ctx, 'finance.payment_void', 'fin_payment', p.id, {
          receiptNo: p.receiptNo,
          total: p.total,
          reason: request.body.reason,
        });
        return receiptView(tx, p.id);
      });
    },
  );

  /* ---------- Laporan ---------- */

  app.get(
    '/v1/finance/reports/arrears',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Laporan tunggakan',
        description:
          'Izin: `finance:read`; modul `finance`. Per siswa yang masih punya sisa tagihan pada satu tahun ajaran ' +
          '(`academicYearId` wajib; `classId` opsional; `asOf` bawaan hari ini). `overdueOutstanding` = sisa pada tagihan ' +
          'yang jatuh temponya sebelum `asOf`; `oldestDue` = jatuh tempo tertua di antara tagihan bersisa. Urut sisa ' +
          'terbesar. Tagihan batal tidak dihitung.',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid(),
          classId: z.uuid().optional(),
          asOf: z.iso.date().optional(),
        }),
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                studentId: z.uuid(),
                name: z.string(),
                nis: z.string().nullable(),
                className: z.string().nullable(),
                openInvoices: z.number().int(),
                outstanding: z.number().int(),
                overdueOutstanding: z.number().int(),
                oldestDue: z.iso.date(),
              }),
            ),
            totals: z.object({
              students: z.number().int(),
              openInvoices: z.number().int(),
              outstanding: z.number().int(),
              overdueOutstanding: z.number().int(),
            }),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { academicYearId, classId, asOf } = request.query;
      const cutoff = asOf ?? todayInJakarta();
      return tenant(request, async (tx) => {
        const { items } = await invoiceRows(tx, { academicYearId, classId }, { asOf: cutoff });
        const byStudent = new Map<
          string,
          {
            studentId: string;
            name: string;
            nis: string | null;
            className: string | null;
            openInvoices: number;
            outstanding: number;
            overdueOutstanding: number;
            oldestDue: string;
          }
        >();
        for (const i of items) {
          if (i.outstanding <= 0) continue;
          const row = byStudent.get(i.studentId) ?? {
            studentId: i.studentId,
            name: i.studentName,
            nis: i.nis,
            className: i.className,
            openInvoices: 0,
            outstanding: 0,
            overdueOutstanding: 0,
            oldestDue: i.dueDate,
          };
          row.openInvoices += 1;
          row.outstanding += i.outstanding;
          if (i.dueDate < cutoff) row.overdueOutstanding += i.outstanding;
          if (i.dueDate < row.oldestDue) row.oldestDue = i.dueDate;
          byStudent.set(i.studentId, row);
        }
        const rows = [...byStudent.values()].sort(
          (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name),
        );
        return {
          rows,
          totals: {
            students: rows.length,
            openInvoices: rows.reduce((a, r) => a + r.openInvoices, 0),
            outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
            overdueOutstanding: rows.reduce((a, r) => a + r.overdueOutstanding, 0),
          },
        };
      });
    },
  );

  const dayMs = 86_400_000;
  app.get(
    '/v1/finance/reports/daily',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Laporan penerimaan',
        description:
          'Izin: `finance:read`; modul `finance`. Penerimaan kwitansi yang tidak batal pada rentang tanggal bayar ' +
          '`from`..`to` (inklusif, zona Jakarta, maksimum 366 hari; selain itu 400 `invalid_range`). Dikelompokkan per ' +
          'metode, jenis biaya, dan hari.',
        headers: schoolHeader,
        querystring: z.object({ from: z.iso.date(), to: z.iso.date() }),
        response: {
          200: z.object({
            totals: z.object({ receipts: z.number().int(), amount: z.number().int() }),
            byMethod: z.array(
              z.object({ method: z.enum(METHODS), receipts: z.number().int(), amount: z.number().int() }),
            ),
            byFeeType: z.array(z.object({ feeTypeName: z.string(), amount: z.number().int() })),
            byDay: z.array(
              z.object({ date: z.iso.date(), receipts: z.number().int(), amount: z.number().int() }),
            ),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { from, to } = request.query;
      const days = (Date.parse(to) - Date.parse(from)) / dayMs + 1;
      if (days < 1 || days > 366) {
        throw new HttpError(
          400,
          'invalid_range',
          'Rentang tanggal harus 1 sampai 366 hari dan `from` <= `to`.',
        );
      }
      const inRange = and(
        isNull(finPayment.voidedAt),
        gte(finPayment.paidAt, sql`(${from}::date)::timestamp at time zone 'Asia/Jakarta'`),
        lt(finPayment.paidAt, sql`((${to}::date + 1)::timestamp at time zone 'Asia/Jakarta')`),
      );
      const day = sql<string>`to_char((${finPayment.paidAt} at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')`;
      return tenant(request, async (tx) => {
        const byMethod = await tx
          .select({
            method: finPayment.method,
            receipts: count(),
            amount: sql<number>`coalesce(sum(${finPayment.total}), 0)::bigint`.mapWith(Number),
          })
          .from(finPayment)
          .where(inRange)
          .groupBy(finPayment.method)
          .orderBy(finPayment.method);
        const byDay = await tx
          .select({
            date: day,
            receipts: count(),
            amount: sql<number>`coalesce(sum(${finPayment.total}), 0)::bigint`.mapWith(Number),
          })
          .from(finPayment)
          .where(inRange)
          .groupBy(day)
          .orderBy(day);
        const byFeeType = await tx
          .select({
            feeTypeName: finFeeType.name,
            amount: sql<number>`coalesce(sum(${finPaymentItem.amount}), 0)::bigint`.mapWith(Number),
          })
          .from(finPaymentItem)
          .innerJoin(finPayment, eq(finPayment.id, finPaymentItem.paymentId))
          .innerJoin(finInvoice, eq(finInvoice.id, finPaymentItem.invoiceId))
          .innerJoin(finFeeType, eq(finFeeType.id, finInvoice.feeTypeId))
          .where(inRange)
          .groupBy(finFeeType.name)
          .orderBy(finFeeType.name);
        return {
          totals: {
            receipts: byMethod.reduce((a, r) => a + r.receipts, 0),
            amount: byMethod.reduce((a, r) => a + r.amount, 0),
          },
          byMethod,
          byFeeType,
          byDay,
        };
      });
    },
  );
}
