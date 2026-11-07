import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  desc,
  enrollment,
  eq,
  FIN_FEE_KINDS,
  FIN_FEE_SCOPES,
  finDiscountRule,
  finFeePlan,
  finFeeTarget,
  finFeeType,
  finInvoice,
  finPayment,
  finPaymentItem,
  finStudentDiscount,
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
import { todayInSchool } from '../attendance-lib';
import {
  discountFor,
  FILTER_PERIOD_PATTERN,
  type InstallmentPart,
  type InvoiceView,
  installmentParts,
  invoiceRows,
  isInstallmentPeriodOf,
  listPaymentMethods,
  PERIOD_PATTERN,
  paidFor,
  periodLabel,
  requireActiveMethod,
  SEMESTER_PERIOD_PATTERN,
  type SemesterPeriod,
  semesterLabel,
} from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { notifyPayment } from '../messaging-lib';
import { assertLevelAllowed } from '../school-lib';
import { zoneSql } from '../timezone-sql';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const payGate = [requirePermission('finance:pay'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const KINDS = FIN_FEE_KINDS;
/** Kunci metode pembayaran (dinamis, dikelola sekolah di `fin_payment_method`). */
const methodKey = z.string().trim().min(1).max(40);
const INVOICE_STATUS = ['unpaid', 'partial', 'paid', 'void'] as const;

const rupiah = z.number().int().min(0).max(2_000_000_000);

/* ---------- Skema ---------- */

const feeTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(KINDS),
  scope: z
    .enum(FIN_FEE_SCOPES)
    .describe('`all` = semua siswa, `class` = kelas tertentu, `student` = siswa tertentu'),
  active: z.boolean(),
  classIds: z.array(z.uuid()).describe('Kelas sasaran (cakupan `class`); kosong untuk cakupan lain'),
  studentIds: z.array(z.uuid()).describe('Siswa sasaran (cakupan `student`); kosong untuk cakupan lain'),
  targetCount: z.number().int().describe('Jumlah sasaran (kelas atau siswa)'),
  targetNames: z.array(z.string()).describe('Nama kelas atau siswa sasaran, urut abjad'),
  planCount: z.number().int().describe('Jumlah tarif yang memakai jenis biaya ini'),
  invoiceCount: z.number().int().describe('Jumlah tagihan yang memakai jenis biaya ini'),
});
const feeTypeBody = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(KINDS),
  active: z.boolean().default(true),
  scope: z.enum(FIN_FEE_SCOPES).default('all'),
  classIds: z.array(z.uuid()).max(500).optional().describe('Wajib tak kosong bila `scope` = `class`'),
  studentIds: z.array(z.uuid()).max(2000).optional().describe('Wajib tak kosong bila `scope` = `student`'),
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
  method: z.string().describe('Kunci metode pembayaran'),
  methodLabel: z.string().describe('Label metode dari pengaturan sekolah (kunci bila sudah tak ada)'),
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
  method: z.string().describe('Kunci metode pembayaran'),
  methodLabel: z.string().describe('Label metode dari pengaturan sekolah (kunci bila sudah tak ada)'),
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

  /** Peta kunci -> label metode pembayaran sekolah (termasuk yang nonaktif, agar riwayat tetap berlabel). */
  async function methodLabels(tx: Tx, schoolId: string) {
    const rows = await listPaymentMethods(tx, schoolId);
    return new Map(rows.map((r) => [r.key, r.label]));
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
    const targets = await tx
      .select({
        feeTypeId: finFeeTarget.feeTypeId,
        classId: finFeeTarget.classId,
        studentId: finFeeTarget.studentId,
        className: classRoom.name,
        studentName: student.name,
      })
      .from(finFeeTarget)
      .leftJoin(classRoom, eq(classRoom.id, finFeeTarget.classId))
      .leftJoin(student, eq(student.id, finFeeTarget.studentId))
      .where(onlyId ? eq(finFeeTarget.feeTypeId, onlyId) : undefined);
    return rows.map((r) => {
      const mine = targets.filter((t) => t.feeTypeId === r.id);
      const classes = mine.filter((t) => t.classId !== null);
      const students = mine.filter((t) => t.studentId !== null);
      const names = [...classes.map((t) => t.className ?? ''), ...students.map((t) => t.studentName ?? '')]
        .filter((n) => n !== '')
        .sort((a, b) => a.localeCompare(b));
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        scope: r.scope,
        active: r.active,
        classIds: classes.map((t) => t.classId as string),
        studentIds: students.map((t) => t.studentId as string),
        targetCount: mine.length,
        targetNames: names,
        planCount: plans.find((p) => p.id === r.id)?.n ?? 0,
        invoiceCount: invoices.find((p) => p.id === r.id)?.n ?? 0,
      };
    });
  }

  /** Validasi cakupan + sasaran dari body; kembalikan daftar id sasaran (kosong untuk `all`). */
  async function resolveTargets(
    tx: Tx,
    b: {
      scope: (typeof FIN_FEE_SCOPES)[number];
      classIds?: string[] | undefined;
      studentIds?: string[] | undefined;
    },
  ) {
    if (b.scope === 'all') return { classIds: [] as string[], studentIds: [] as string[] };
    if (b.scope === 'class') {
      const classIds = [...new Set(b.classIds ?? [])];
      if (classIds.length === 0) {
        throw new HttpError(400, 'targets_required', 'Pilih minimal satu kelas untuk cakupan kelas.');
      }
      const found = await tx
        .select({ id: classRoom.id })
        .from(classRoom)
        .where(inArray(classRoom.id, classIds));
      if (found.length !== classIds.length) throw invalidRef('Ada kelas sasaran yang tidak ditemukan.');
      return { classIds, studentIds: [] as string[] };
    }
    const studentIds = [...new Set(b.studentIds ?? [])];
    if (studentIds.length === 0) {
      throw new HttpError(400, 'targets_required', 'Pilih minimal satu siswa untuk cakupan siswa.');
    }
    const found = await tx
      .select({ id: student.id })
      .from(student)
      .where(and(inArray(student.id, studentIds), isNull(student.deletedAt)));
    if (found.length !== studentIds.length) throw invalidRef('Ada siswa sasaran yang tidak ditemukan.');
    return { classIds: [] as string[], studentIds };
  }

  /** Ganti seluruh sasaran jenis biaya secara atomik (di dalam transaksi pemanggil). */
  async function replaceTargets(
    tx: Tx,
    schoolId: string,
    feeTypeId: string,
    t: { classIds: string[]; studentIds: string[] },
  ) {
    await tx.delete(finFeeTarget).where(eq(finFeeTarget.feeTypeId, feeTypeId));
    const rows = [
      ...t.classIds.map((classId) => ({ schoolId, feeTypeId, classId })),
      ...t.studentIds.map((studentId) => ({ schoolId, feeTypeId, studentId })),
    ];
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(finFeeTarget).values(rows.slice(i, i + 500));
    }
  }

  app.get(
    '/v1/finance/fee-types',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar jenis biaya',
        description:
          'Izin: `finance:read`; modul `finance`. Urut nama. `planCount` dan `invoiceCount` = pemakaian jenis biaya ini. ' +
          '`scope` = `all` (semua siswa), `class` (hanya kelas di `classIds`), atau `student` (hanya siswa di `studentIds`); ' +
          '`targetCount` dan `targetNames` (nama kelas/siswa sasaran) untuk tampilan.',
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
          'Izin: `finance:manage`; modul `finance`. `kind`: `monthly` (per bulan, mis. SPP), `semester` (per semester, ' +
          'mis. SPP semester atau uang ujian semester; tarif = nominal per semester), `one_time` (sekali), `yearly` ' +
          '(per tahun ajaran). Nama unik di sekolah (409 `conflict`). `scope` (bawaan `all`): `all` = ditagihkan ke semua ' +
          'siswa; `class` = hanya siswa di kelas `classIds`; `student` = hanya siswa `studentIds`. Cakupan `class`/`student` ' +
          'wajib berisi sasaran (400 `targets_required`); id kelas/siswa yang tidak ada di sekolah ini ditolak 400 ' +
          '`invalid_reference`.',
        headers: schoolHeader,
        body: feeTypeBody,
        response: { 201: feeTypeSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { classIds: _c, studentIds: _s, ...fields } = request.body;
      const created = await conflictAs409('Nama jenis biaya itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const targets = await resolveTargets(tx, request.body);
          const [row] = await tx
            .insert(finFeeType)
            .values({ schoolId: ctx.schoolId, ...fields })
            .returning({ id: finFeeType.id });
          await replaceTargets(tx, ctx.schoolId, row!.id, targets);
          await audit(tx, ctx, 'finance.fee_type_create', 'fin_fee_type', row!.id, {
            ...fields,
            ...targets,
          });
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
          'Mengubah `kind` ditolak 409 `in_use` bila sudah ada tagihan yang memakainya. `scope`, `classIds`, `studentIds` ' +
          'seperti pada tambah: sasaran diganti seluruhnya secara atomik; `scope` `all` menghapus semua sasaran; ' +
          '400 `targets_required` bila cakupan `class`/`student` tanpa sasaran; 400 `invalid_reference` bila id tidak ' +
          'ditemukan di sekolah ini. Tagihan yang sudah dibuat tidak berubah.',
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
          const { classIds: _c, studentIds: _s, ...fields } = request.body;
          const targets = await resolveTargets(tx, request.body);
          await tx.update(finFeeType).set(fields).where(eq(finFeeType.id, current.id));
          await replaceTargets(tx, ctx.schoolId, current.id, targets);
          await audit(tx, ctx, 'finance.fee_type_update', 'fin_fee_type', current.id, {
            ...fields,
            ...targets,
          });
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

  app.get(
    '/v1/finance/students/:studentId/fees',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Jenis biaya yang berlaku untuk seorang siswa',
        description:
          'Izin: `finance:read`; modul `finance`. Mengembalikan jenis biaya yang berlaku bagi siswa menurut cakupan: ' +
          '`all` selalu berlaku, `class` bila siswa terdaftar di salah satu kelas sasaran, `student` bila siswa ada di ' +
          'sasaran. `academicYearId` opsional membatasi pendaftaran kelas yang dihitung pada tahun ajaran itu (bila ' +
          'kosong, semua pendaftaran siswa). Urut nama; jenis biaya nonaktif ikut tampil dengan `active` false. 404 ' +
          '`not_found` bila siswa tak ada.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: {
          200: z.array(
            z.object({
              id: z.uuid(),
              name: z.string(),
              kind: z.enum(KINDS),
              scope: z.enum(FIN_FEE_SCOPES),
              active: z.boolean(),
            }),
          ),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const { studentId } = request.params;
      return tenant(request, async (tx) => {
        const [s] = await tx
          .select({ id: student.id })
          .from(student)
          .where(and(eq(student.id, studentId), isNull(student.deletedAt)));
        if (!s) throw notFound('Siswa');
        const classes = await tx
          .select({ classId: enrollment.classId })
          .from(enrollment)
          .where(
            and(
              eq(enrollment.studentId, studentId),
              request.query.academicYearId
                ? eq(enrollment.academicYearId, request.query.academicYearId)
                : undefined,
            ),
          );
        const classIds = classes.map((c) => c.classId);
        const targets = await tx
          .select({
            feeTypeId: finFeeTarget.feeTypeId,
            classId: finFeeTarget.classId,
            studentId: finFeeTarget.studentId,
          })
          .from(finFeeTarget);
        const types = await tx.select().from(finFeeType).orderBy(asc(finFeeType.name));
        return types
          .filter((f) => {
            if (f.scope === 'all') return true;
            const mine = targets.filter((t) => t.feeTypeId === f.id);
            return f.scope === 'class'
              ? mine.some((t) => t.classId !== null && classIds.includes(t.classId))
              : mine.some((t) => t.studentId === studentId);
          })
          .map((f) => ({ id: f.id, name: f.name, kind: f.kind, scope: f.scope, active: f.active }));
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
          'jenis biaya tidak ditemukan; 400 `invalid_level` bila `level` tidak ada di daftar tingkat sekolah (bila daftar terisi).',
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
          await assertLevelAllowed(tx, b.level);
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
    period: z
      .string()
      .nullable()
      .describe(
        'TTTT-BB untuk biaya bulanan; `S1` (ganjil) atau `S2` (genap) untuk biaya semester; null untuk lainnya',
      ),
    classId: z.uuid().nullable(),
    dueDate: z.iso.date(),
    installments: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe(
        'Cicilan 2..12, hanya untuk jenis biaya non-bulanan (termasuk semester); kosong = satu tagihan',
      ),
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
          'dilewati dan dihitung di `skipped`. Judul otomatis, mis. "SPP Agustus 2026"; biaya semester: "SPP Semester Ganjil 2026/2027" (`S1` = ' +
          'ganjil, `S2` = genap; tarif = nominal per semester; cicilan berperiode `S1C01`.. agar tak bentrok ' +
          'antarsemester, dan hanya tagihan semester yang sama yang membuat siswa dilewati). Galat: 400 `period_required` ' +
          '(`period` wajib TTTT-BB untuk jenis `monthly`, wajib `S1`/`S2` untuk jenis `semester` (selain itu 400 ' +
          '`period_invalid`), dan harus null untuk jenis lain), 400 `invalid_reference`, ' +
          '409 `inactive` (jenis biaya nonaktif). Tarif bernominal 0 = gratis: tagihan tidak dibuat dan dihitung di ' +
          '`free`. Keringanan: aturan aktif yang dipasang pada siswa di tahun ajaran itu dan berlaku untuk jenis biaya ' +
          'ini (jenis kosong atau sama) dijumlahkan (persen dibulatkan ke bawah per aturan + nominal tetap, maksimal ' +
          'sebesar nominal) menjadi `discount` tagihan baru, nama aturan digabung di `discountReason`; `discounted` = ' +
          'jumlah tagihan baru yang berdiskon (tagihan yang sudah ada tidak diubah). `installments` (2..12, hanya jenis ' +
          'non-bulanan; 400 `installments_invalid`) membuat N tagihan berperiode `C01`..`C12` dengan nominal dibagi ' +
          'rata (sisa ke cicilan pertama), jatuh tempo `dueDate` + (i-1) bulan, dan diskon dibagi proporsional; siswa ' +
          'yang sudah punya tagihan jenis itu pada tahun ajaran tsb dilewati. Cakupan jenis biaya: `scope` `class` hanya ' +
          'menagih siswa yang pada tahun ajaran itu terdaftar di kelas sasaran, `student` hanya siswa sasaran, `all` ' +
          'semua siswa; bila `classId` juga diisi, hasilnya irisan keduanya. Siswa di luar sasaran dihitung di ' +
          '`outOfScope` (tidak masuk `missingPlan`).',
        headers: schoolHeader,
        body: generateBody,
        response: {
          200: z.object({
            created: z.number().int(),
            skipped: z.number().int(),
            free: z.number().int().describe('Siswa bertarif 0 (gratis); tagihan tidak dibuat'),
            discounted: z.number().int().describe('Jumlah tagihan baru yang berdiskon'),
            outOfScope: z
              .number()
              .int()
              .describe('Siswa aktif terdaftar yang dilewati karena di luar sasaran cakupan jenis biaya'),
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
        } else if (fee.kind === 'semester') {
          if (!b.period) {
            throw new HttpError(
              400,
              'period_required',
              'Biaya semester wajib punya periode S1 (ganjil) atau S2 (genap).',
            );
          }
          if (!SEMESTER_PERIOD_PATTERN.test(b.period)) {
            throw new HttpError(
              400,
              'period_invalid',
              'Periode biaya semester hanya S1 (ganjil) atau S2 (genap).',
            );
          }
        } else if (b.period !== null) {
          throw new HttpError(
            400,
            'period_required',
            'Periode hanya untuk biaya bulanan dan semester; isi null untuk jenis ini.',
          );
        }
        const semesterPeriod = fee.kind === 'semester' ? (b.period as SemesterPeriod) : null;
        if (!fee.active) throw new HttpError(409, 'inactive', 'Jenis biaya ini tidak aktif.');
        const installments = b.installments ?? null;
        if (installments !== null && (fee.kind === 'monthly' || installments < 2 || installments > 12)) {
          throw new HttpError(
            400,
            'installments_invalid',
            'Cicilan hanya untuk biaya non-bulanan dan harus 2 sampai 12 kali.',
          );
        }
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
            classId: enrollment.classId,
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

        // Cakupan jenis biaya: hanya siswa yang termasuk sasaran yang ditagih.
        let outOfScope = 0;
        if (fee.scope !== 'all') {
          const targets = await tx.select().from(finFeeTarget).where(eq(finFeeTarget.feeTypeId, fee.id));
          const classTargets = new Set(targets.map((t) => t.classId).filter((v): v is string => v !== null));
          const studentTargets = new Set(
            targets.map((t) => t.studentId).filter((v): v is string => v !== null),
          );
          const inScope = roster.filter((s) =>
            fee.scope === 'class' ? classTargets.has(s.classId) : studentTargets.has(s.id),
          );
          outOfScope = roster.length - inScope.length;
          roster.splice(0, roster.length, ...inScope);
        }

        const existing = await tx
          .select({ studentId: finInvoice.studentId, period: finInvoice.period })
          .from(finInvoice)
          .where(and(eq(finInvoice.academicYearId, year.id), eq(finInvoice.feeTypeId, fee.id)));
        // Mode cicilan: siswa dengan tagihan apa pun (utuh atau cicilan) dilewati. Mode biasa: periode yang sama,
        // atau sudah dicicil (periode C..) agar tidak tertagih dua kali.
        // Biaya semester: cicilan berperiode `S1C01`.. dan hanya semester yang sama yang dihitung.
        const have = new Set(
          existing
            .filter((e) =>
              semesterPeriod !== null
                ? e.period === semesterPeriod || isInstallmentPeriodOf(e.period, semesterPeriod)
                : installments !== null ||
                  (e.period ?? null) === b.period ||
                  isInstallmentPeriodOf(e.period, null),
            )
            .map((e) => e.studentId),
        );

        // Keringanan aktif yang terpasang pada tahun ajaran ini dan berlaku untuk jenis biaya ini.
        const assigned = await tx
          .select({
            studentId: finStudentDiscount.studentId,
            name: finDiscountRule.name,
            kind: finDiscountRule.kind,
            value: finDiscountRule.value,
          })
          .from(finStudentDiscount)
          .innerJoin(finDiscountRule, eq(finDiscountRule.id, finStudentDiscount.ruleId))
          .where(
            and(
              eq(finStudentDiscount.academicYearId, year.id),
              eq(finDiscountRule.active, true),
              sql`(${finDiscountRule.feeTypeId} is null or ${finDiscountRule.feeTypeId} = ${fee.id})`,
            ),
          )
          .orderBy(asc(finDiscountRule.name));
        const rulesByStudent = new Map<string, typeof assigned>();
        for (const a of assigned) {
          const list = rulesByStudent.get(a.studentId) ?? [];
          list.push(a);
          rulesByStudent.set(a.studentId, list);
        }

        const semesterName = semesterPeriod ? semesterLabel(semesterPeriod) : null;
        const title = semesterName
          ? `${fee.name} ${semesterName} ${year.name}`
          : b.period
            ? `${fee.name} ${periodLabel(b.period)}`
            : `${fee.name} ${year.name}`;
        const missingPlan: {
          studentId: string;
          name: string;
          nis: string | null;
          className: string;
          level: string;
        }[] = [];
        const toCreate: (typeof finInvoice.$inferInsert)[] = [];
        let skipped = 0;
        let free = 0;
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
          if (amount === 0) {
            free++;
            continue;
          }
          const rules = rulesByStudent.get(s.id) ?? [];
          const discount = discountFor(amount, rules);
          const discountReason =
            rules.length > 0 && discount > 0
              ? rules
                  .map((r) => r.name)
                  .join(', ')
                  .slice(0, 300)
              : null;
          const base = {
            schoolId: ctx.schoolId,
            studentId: s.id,
            academicYearId: year.id,
            feeTypeId: fee.id,
          };
          if (installments === null) {
            toCreate.push({
              ...base,
              period: b.period,
              title,
              amount,
              discount,
              discountReason,
              dueDate: b.dueDate,
              createdBy: ctx.userId,
            });
          } else {
            for (const part of installmentParts({
              base: semesterName ? `${fee.name} ${semesterName}` : fee.name,
              suffix: year.name,
              ...(semesterPeriod ? { periodPrefix: semesterPeriod } : {}),
              amount,
              discount,
              installments,
              firstDueDate: b.dueDate,
            })) {
              toCreate.push({
                ...base,
                period: part.period,
                title: part.title,
                amount: part.amount,
                discount: part.discount,
                discountReason: part.discount > 0 ? discountReason : null,
                dueDate: part.dueDate,
                createdBy: ctx.userId,
              });
            }
          }
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
        const discounted = toCreate.filter((r) => (r.discount ?? 0) > 0).length;
        await audit(tx, ctx, 'finance.invoice_generate', 'fin_invoice', fee.id, {
          installments,
          free,
          discounted,
          academicYearId: year.id,
          period: b.period,
          classId: b.classId,
          created,
          skipped,
          missingPlan: missingPlan.length,
          scope: fee.scope,
          outOfScope,
        });
        return { created, skipped, free, discounted, outOfScope, missingPlan };
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
          'tagihan), `studentId`, `feeTypeId`, `period` (TTTT-BB atau `S1`/`S2`), `status`. Status diturunkan dari kwitansi yang tidak batal: ' +
          '`unpaid`, `partial`, `paid`, `void`. Urut jatuh tempo, nama siswa. `limit` maks 100 (bawaan 50), `offset` ' +
          'bawaan 0. `overdue` = masih ada sisa dan lewat jatuh tempo (hari ini menurut zona waktu sekolah).',
        headers: schoolHeader,
        querystring: z.object({
          academicYearId: z.uuid().optional(),
          classId: z.uuid().optional(),
          studentId: z.uuid().optional(),
          feeTypeId: z.uuid().optional(),
          period: z.string().regex(FILTER_PERIOD_PATTERN).optional(),
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

  app.post(
    '/v1/finance/invoices/:id/split',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Pecah tagihan menjadi cicilan',
        description:
          'Izin: `finance:manage`; modul `finance`. Memecah satu tagihan terbuka yang belum punya pembayaran aktif ' +
          'menjadi `installments` (2..12) tagihan berperiode `C01`.. (`S1C01`.. bila tagihan asal berperiode semester `S1`/`S2`), nominal dibagi rata (sisa ke cicilan pertama), ' +
          'diskon dibagi proporsional, jatuh tempo `firstDueDate` + (i-1) bulan. Tagihan asal dibatalkan (void, alasan ' +
          '"dipecah menjadi cicilan"). Atomik. Galat: 409 `has_payments`, 409 `invoice_void`, 409 `conflict` bila ' +
          'tagihan cicilan jenis itu sudah ada, 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          installments: z.number().int().min(2).max(12),
          firstDueDate: z.iso.date(),
        }),
        response: {
          200: z.object({ voided: invoiceSchema, invoices: z.array(invoiceSchema) }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Tagihan cicilan untuk jenis biaya ini sudah ada.', () =>
        tenant(request, async (tx) => {
          const inv = await lockInvoice(tx, request.params.id);
          if (inv.status === 'void') {
            throw new HttpError(409, 'invoice_void', 'Tagihan ini sudah dibatalkan.');
          }
          const paid = (await paidFor(tx, [inv.id])).get(inv.id) ?? 0;
          if (paid > 0) {
            throw new HttpError(
              409,
              'has_payments',
              'Tagihan ini sudah punya pembayaran; batalkan kwitansinya terlebih dahulu.',
            );
          }
          const parts: InstallmentPart[] = installmentParts({
            base: inv.title,
            suffix: '',
            ...(inv.period && SEMESTER_PERIOD_PATTERN.test(inv.period) ? { periodPrefix: inv.period } : {}),
            amount: inv.amount,
            discount: inv.discount,
            installments: b.installments,
            firstDueDate: b.firstDueDate,
          });
          await tx
            .update(finInvoice)
            .set({ status: 'void', voidReason: 'dipecah menjadi cicilan' })
            .where(eq(finInvoice.id, inv.id));
          const created = await tx
            .insert(finInvoice)
            .values(
              parts.map((part) => ({
                schoolId: ctx.schoolId,
                studentId: inv.studentId,
                academicYearId: inv.academicYearId,
                feeTypeId: inv.feeTypeId,
                period: part.period,
                title: part.title,
                amount: part.amount,
                discount: part.discount,
                discountReason: part.discount > 0 ? inv.discountReason : null,
                dueDate: part.dueDate,
                createdBy: ctx.userId,
              })),
            )
            .returning({ id: finInvoice.id });
          await audit(tx, ctx, 'finance.invoice_split', 'fin_invoice', inv.id, {
            installments: b.installments,
            firstDueDate: b.firstDueDate,
            children: created.map((c) => c.id),
          });
          const voided = (await invoiceViewOf(tx, inv.id))!;
          const { items } = await invoiceRows(tx, {
            studentId: inv.studentId,
            academicYearId: inv.academicYearId,
            feeTypeId: inv.feeTypeId,
          });
          const ids = new Set(created.map((c) => c.id));
          return {
            voided,
            invoices: items
              .filter((i) => ids.has(i.id))
              .sort((a, b2) => (a.period ?? '').localeCompare(b2.period ?? '')),
          };
        }),
      );
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
                method: z.string(),
                methodLabel: z.string(),
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
        const labels = await methodLabels(tx, (request.ctx as TenantContext).schoolId);
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
            methodLabel: labels.get(p.method) ?? p.method,
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
    const labels = await methodLabels(tx, p.schoolId);
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      paidAt: p.paidAt.toISOString(),
      method: p.method,
      methodLabel: labels.get(p.method) ?? p.method,
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
          '`duplicate_item` (tagihan yang sama dua kali), 400 `invalid_method` (`method` bukan metode aktif sekolah; ' +
          'lihat `/v1/finance/payment-methods`), 409 `invoice_void`, 409 `overpay`.',
        headers: schoolHeader,
        body: z.object({
          studentId: z.uuid(),
          method: methodKey,
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
        await requireActiveMethod(tx, ctx.schoolId, b.method);
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

        const year = Number(todayInSchool().slice(0, 4));
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
        const view = await receiptView(tx, pay!.id);
        await notifyPayment(tx, ctx.schoolId, pay!.id, view);
        return view;
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
          'Izin: `finance:read`; modul `finance`. Filter opsional: `from`/`to` (tanggal bayar, inklusif, zona waktu sekolah), ' +
          '`studentId`, `method`, `status` (`active` atau `void`). Terbaru lebih dulu. `limit` maks 100 (bawaan 50).',
        headers: schoolHeader,
        querystring: z.object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          studentId: z.uuid().optional(),
          method: methodKey.optional().describe('Kunci metode (termasuk yang sudah nonaktif)'),
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
          ? gte(finPayment.paidAt, sql`(${q.from}::date)::timestamp at time zone ${zoneSql()}`)
          : undefined,
        q.to
          ? lt(finPayment.paidAt, sql`((${q.to}::date + 1)::timestamp at time zone ${zoneSql()})`)
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
        const labels = await methodLabels(tx, (request.ctx as TenantContext).schoolId);
        return {
          items: rows.map((r) => ({
            id: r.id,
            receiptNo: r.receiptNo,
            paidAt: r.paidAt.toISOString(),
            method: r.method,
            methodLabel: labels.get(r.method) ?? r.method,
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
      const cutoff = asOf ?? todayInSchool();
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
          '`from`..`to` (inklusif, zona waktu sekolah, maksimum 366 hari; selain itu 400 `invalid_range`). Dikelompokkan per ' +
          'metode, jenis biaya, dan hari.',
        headers: schoolHeader,
        querystring: z.object({ from: z.iso.date(), to: z.iso.date() }),
        response: {
          200: z.object({
            totals: z.object({ receipts: z.number().int(), amount: z.number().int() }),
            byMethod: z.array(
              z.object({
                method: z.string(),
                methodLabel: z.string(),
                receipts: z.number().int(),
                amount: z.number().int(),
              }),
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
        gte(finPayment.paidAt, sql`(${from}::date)::timestamp at time zone ${zoneSql()}`),
        lt(finPayment.paidAt, sql`((${to}::date + 1)::timestamp at time zone ${zoneSql()})`),
      );
      const day = sql<string>`to_char((${finPayment.paidAt} at time zone ${zoneSql()})::date, 'YYYY-MM-DD')`;
      return tenant(request, async (tx) => {
        const labels = await methodLabels(tx, (request.ctx as TenantContext).schoolId);
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
          byMethod: byMethod.map((r) => ({ ...r, methodLabel: labels.get(r.method) ?? r.method })),
          byFeeType,
          byDay,
        };
      });
    },
  );
}
