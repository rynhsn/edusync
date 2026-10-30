import {
  addDays,
  computeLateFee,
  daysBetween,
  LATE_FEE_DUE_DAYS,
  LATE_FEE_MODES,
  LATE_FEE_PERIOD_PREFIX,
  type LateFeeSetting,
  lateFeeParentId,
} from '@edusync/contracts';
import { eq, finFeeType, finInvoice, finLateFeeSetting, inArray, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInJakarta } from '../attendance-lib';
import { type InvoiceView, invoiceRows } from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

const settingSchema = z.object({
  mode: z
    .enum(LATE_FEE_MODES)
    .describe('`none` = tanpa denda; `flat` = nominal tetap; `percent` = persen dari sisa tagihan'),
  value: z.number().int().describe('Rupiah (flat) atau persen 1..100 (percent)'),
  graceDays: z.number().int().describe('Hari toleransi setelah jatuh tempo'),
  capAmount: z.number().int().nullable().describe('Batas denda per tagihan (rupiah); kosong = tanpa batas'),
  feeTypeId: z.uuid().nullable().describe('Jenis biaya untuk tagihan denda'),
  feeTypeName: z.string().nullable(),
});

const settingBody = z
  .object({
    mode: z.enum(LATE_FEE_MODES),
    value: z.number().int().min(0).max(2_000_000_000),
    graceDays: z.number().int().min(0).max(365),
    capAmount: z.number().int().min(1).max(2_000_000_000).nullable().default(null),
    feeTypeId: z.uuid().nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'percent' && (v.value < 1 || v.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Persen harus 1 sampai 100.' });
    }
    if (v.mode === 'flat' && v.value < 1) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Nominal harus lebih dari 0.' });
    }
    if (v.mode !== 'none' && v.feeTypeId === null) {
      ctx.addIssue({ code: 'custom', path: ['feeTypeId'], message: 'Jenis biaya denda wajib dipilih.' });
    }
  });

const previewItem = z.object({
  invoiceId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  nis: z.string().nullable(),
  className: z.string().nullable(),
  title: z.string(),
  feeTypeName: z.string(),
  dueDate: z.iso.date(),
  outstanding: z.number().int(),
  daysLate: z.number().int().describe('Hari sejak jatuh tempo (hari ini - jatuh tempo)'),
  lateFee: z.number().int().describe('Denda terhitung dalam rupiah (> 0)'),
  fined: z.boolean().describe('Sudah dikenai denda (tagihan denda untuk tagihan ini sudah dibuat)'),
  fineInvoiceId: z.uuid().nullable(),
});

const previewSchema = z.object({
  today: z.iso.date(),
  enabled: z.boolean().describe('Denda aktif dan jenis biaya denda sudah diatur'),
  items: z.array(previewItem),
  pendingCount: z.number().int().describe('Tagihan yang belum dikenai denda'),
  pendingTotal: z.number().int().describe('Jumlah denda yang akan dibuat'),
});

const applyBody = z.object({
  invoiceIds: z
    .array(z.uuid())
    .max(1000)
    .nullable()
    .default(null)
    .describe('Batasi pada tagihan induk ini; kosong = semua tagihan yang kena denda'),
});

const applySchema = z.object({
  created: z.number().int().describe('Jumlah tagihan denda yang dibuat'),
  skipped: z.number().int().describe('Dilewati karena sudah dikenai denda'),
  total: z.number().int().describe('Jumlah rupiah denda yang dibuat'),
  invoiceIds: z.array(z.uuid()).describe('Id tagihan denda yang dibuat'),
});

/** Denda keterlambatan SPP: pengaturan, pratinjau, dan penerbitan tagihan denda. Modul `finance`. */
export async function financeLateFeeRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function readSetting(tx: Tx) {
    const [row] = await tx
      .select({
        mode: finLateFeeSetting.mode,
        value: finLateFeeSetting.value,
        graceDays: finLateFeeSetting.graceDays,
        capAmount: finLateFeeSetting.capAmount,
        feeTypeId: finLateFeeSetting.feeTypeId,
        feeTypeName: finFeeType.name,
      })
      .from(finLateFeeSetting)
      .leftJoin(finFeeType, eq(finFeeType.id, finLateFeeSetting.feeTypeId));
    return (
      row ?? {
        mode: 'none' as const,
        value: 0,
        graceDays: 0,
        capAmount: null,
        feeTypeId: null,
        feeTypeName: null,
      }
    );
  }

  /** Tagihan induk yang sudah lewat jatuh tempo + toleransi, beserta denda terhitung dan status "sudah dikenai". */
  async function candidates(tx: Tx, setting: Awaited<ReturnType<typeof readSetting>>, today: string) {
    if (setting.mode === 'none' || setting.feeTypeId === null) return [];
    const rule: LateFeeSetting = {
      mode: setting.mode,
      value: setting.value,
      graceDays: setting.graceDays,
      capAmount: setting.capAmount,
    };
    const unpaid = await invoiceRows(tx, { status: 'unpaid' });
    const partial = await invoiceRows(tx, { status: 'partial' });
    const parents: InvoiceView[] = [...unpaid.items, ...partial.items].filter(
      (i) => lateFeeParentId(i.period) === null,
    );
    const eligible = parents
      .map((i) => ({
        invoice: i,
        lateFee: computeLateFee(rule, { outstanding: i.outstanding, dueDate: i.dueDate, today }),
      }))
      .filter((e) => e.lateFee > 0);
    const periods = eligible.map((e) => `${LATE_FEE_PERIOD_PREFIX}${e.invoice.id}`);
    const existing = periods.length
      ? await tx
          .select({ id: finInvoice.id, period: finInvoice.period })
          .from(finInvoice)
          .where(inArray(finInvoice.period, periods))
      : [];
    const fineOf = new Map(existing.map((e) => [e.period, e.id]));
    return eligible
      .map((e) => ({ ...e, fineInvoiceId: fineOf.get(`${LATE_FEE_PERIOD_PREFIX}${e.invoice.id}`) ?? null }))
      .sort(
        (a, b) =>
          a.invoice.dueDate.localeCompare(b.invoice.dueDate) ||
          a.invoice.studentName.localeCompare(b.invoice.studentName) ||
          a.invoice.id.localeCompare(b.invoice.id),
      );
  }

  /* ---------- Pengaturan ---------- */

  app.get(
    '/v1/finance/late-fee-settings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan denda keterlambatan',
        description:
          'Izin: `finance:read`; modul `finance`. Bila belum pernah diatur, mengembalikan bawaan (`mode` `none`, tanpa denda).',
        headers: schoolHeader,
        response: { 200: settingSchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => readSetting(tx)),
  );

  app.put(
    '/v1/finance/late-fee-settings',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan denda keterlambatan',
        description:
          'Izin: `finance:manage`; modul `finance`. `mode`: `none` (tanpa denda), `flat` (nominal `value` rupiah > 0), ' +
          '`percent` (`value` 1..100 persen dari sisa tagihan, dibulatkan). `graceDays` 0..365 hari toleransi setelah ' +
          'jatuh tempo; `capAmount` batas denda per tagihan (kosong = tanpa batas). `feeTypeId` jenis biaya untuk tagihan ' +
          'denda, wajib bila mode bukan `none`. Galat: 400 `invalid_reference` bila jenis biaya bukan milik sekolah. ' +
          'Perubahan hanya memengaruhi penerbitan denda berikutnya.',
        headers: schoolHeader,
        body: settingBody,
        response: { 200: settingSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        if (b.feeTypeId !== null) {
          const [f] = await tx
            .select({ id: finFeeType.id })
            .from(finFeeType)
            .where(eq(finFeeType.id, b.feeTypeId));
          if (!f) throw invalidRef('Jenis biaya tidak ditemukan.');
        }
        const values = {
          mode: b.mode,
          value: b.value,
          graceDays: b.graceDays,
          capAmount: b.capAmount,
          feeTypeId: b.feeTypeId,
          updatedAt: new Date(),
        };
        await tx
          .insert(finLateFeeSetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: finLateFeeSetting.schoolId, set: values });
        await audit(tx, ctx, 'finance.late_fee_settings_update', 'fin_late_fee_setting', ctx.schoolId, b);
        return readSetting(tx);
      });
    },
  );

  /* ---------- Pratinjau dan penerbitan ---------- */

  app.get(
    '/v1/finance/late-fees/preview',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pratinjau denda keterlambatan',
        description:
          'Izin: `finance:read`; modul `finance`. Daftar tagihan (belum lunas, tidak batal) yang sudah lewat jatuh ' +
          'tempo + toleransi, dengan denda terhitung dari sisa tagihan saat ini dan penanda `fined` bila tagihan dendanya ' +
          'sudah dibuat. Tagihan denda sendiri tidak dikenai denda. Kosong dan `enabled` false bila denda dimatikan atau ' +
          'jenis biaya denda belum diatur. Hari ini menurut zona Jakarta.',
        headers: schoolHeader,
        response: { 200: previewSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const today = todayInJakarta();
        const setting = await readSetting(tx);
        const rows = await candidates(tx, setting, today);
        const pending = rows.filter((r) => r.fineInvoiceId === null);
        return {
          today,
          enabled: setting.mode !== 'none' && setting.feeTypeId !== null,
          items: rows.map((r) => ({
            invoiceId: r.invoice.id,
            studentId: r.invoice.studentId,
            studentName: r.invoice.studentName,
            nis: r.invoice.nis,
            className: r.invoice.className,
            title: r.invoice.title,
            feeTypeName: r.invoice.feeTypeName,
            dueDate: r.invoice.dueDate,
            outstanding: r.invoice.outstanding,
            daysLate: daysBetween(r.invoice.dueDate, today),
            lateFee: r.lateFee,
            fined: r.fineInvoiceId !== null,
            fineInvoiceId: r.fineInvoiceId,
          })),
          pendingCount: pending.length,
          pendingTotal: pending.reduce((s, r) => s + r.lateFee, 0),
        };
      }),
  );

  app.post(
    '/v1/finance/late-fees/apply',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Terbitkan tagihan denda',
        description:
          'Izin: `finance:manage`; modul `finance`. Membuat tagihan denda ("Denda <judul tagihan>", jenis biaya dari ' +
          'pengaturan, jatuh tempo hari ini + 7 hari) untuk setiap tagihan yang kena denda pada pratinjau, atau hanya ' +
          'untuk `invoiceIds` bila diisi. Idempoten per tagihan induk (`period` `denda-<id tagihan induk>`): tagihan ' +
          'yang sudah dikenai denda dilewati dan dihitung di `skipped`. Nominal denda dibekukan saat dibuat. Galat: ' +
          '400 `late_fee_disabled` bila denda dimatikan atau jenis biaya denda belum diatur.',
        headers: schoolHeader,
        body: applyBody,
        response: { 200: applySchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const today = todayInJakarta();
        const setting = await readSetting(tx);
        if (setting.mode === 'none' || setting.feeTypeId === null) {
          throw new HttpError(
            400,
            'late_fee_disabled',
            'Denda keterlambatan belum diaktifkan atau jenis biaya belum diatur.',
          );
        }
        const only = request.body.invoiceIds ? new Set(request.body.invoiceIds) : null;
        const rows = (await candidates(tx, setting, today)).filter(
          (r) => only === null || only.has(r.invoice.id),
        );
        const dueDate = addDays(today, LATE_FEE_DUE_DAYS);
        const createdIds: string[] = [];
        let skipped = 0;
        let total = 0;
        for (const r of rows) {
          if (r.fineInvoiceId !== null) {
            skipped++;
            continue;
          }
          const [row] = await tx
            .insert(finInvoice)
            .values({
              schoolId: ctx.schoolId,
              studentId: r.invoice.studentId,
              academicYearId: await academicYearOf(tx, r.invoice.id),
              feeTypeId: setting.feeTypeId,
              period: `${LATE_FEE_PERIOD_PREFIX}${r.invoice.id}`,
              title: `Denda ${r.invoice.title}`,
              amount: r.lateFee,
              dueDate,
              createdBy: ctx.userId,
            })
            .onConflictDoNothing()
            .returning({ id: finInvoice.id });
          if (!row) {
            skipped++;
            continue;
          }
          createdIds.push(row.id);
          total += r.lateFee;
        }
        await audit(tx, ctx, 'finance.late_fee_apply', 'fin_late_fee_setting', ctx.schoolId, {
          mode: setting.mode,
          created: createdIds.length,
          skipped,
          total,
          invoiceIds: createdIds.slice(0, 200),
        });
        return { created: createdIds.length, skipped, total, invoiceIds: createdIds };
      });
    },
  );

  async function academicYearOf(tx: Tx, invoiceId: string) {
    const [row] = await tx
      .select({ academicYearId: finInvoice.academicYearId })
      .from(finInvoice)
      .where(eq(finInvoice.id, invoiceId));
    return (row as { academicYearId: string }).academicYearId;
  }
}
