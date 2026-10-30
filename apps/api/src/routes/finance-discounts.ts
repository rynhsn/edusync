import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  enrollment,
  eq,
  finDiscountRule,
  finFeeType,
  finStudentDiscount,
  inArray,
  isNull,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const ruleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['percent', 'amount']),
  value: z.number().int().describe('Persen (1..100) atau nominal rupiah'),
  feeTypeId: z.uuid().nullable().describe('Kosong = berlaku untuk semua jenis biaya'),
  feeTypeName: z.string().nullable(),
  active: z.boolean(),
  assignedCount: z.number().int().describe('Jumlah pemasangan ke siswa'),
});

const ruleBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['percent', 'amount']),
    value: z.number().int().max(2_000_000_000),
    feeTypeId: z.uuid().nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'percent' && (v.value < 1 || v.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Persen harus 1 sampai 100.' });
    }
    if (v.kind === 'amount' && v.value <= 0) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Nominal harus lebih dari 0.' });
    }
  });

const assignedSchema = z.object({
  id: z.uuid(),
  rule: z.object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(['percent', 'amount']),
    value: z.number().int(),
    feeTypeId: z.uuid().nullable(),
    active: z.boolean(),
  }),
  reason: z.string().nullable(),
});

/** Aturan keringanan/beasiswa dan pemasangannya ke siswa. Modul `finance`. */
export async function financeDiscountRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function requireFeeType(tx: Tx, id: string | null) {
    if (id === null) return null;
    const [f] = await tx.select({ id: finFeeType.id }).from(finFeeType).where(eq(finFeeType.id, id));
    if (!f) throw invalidRef('Jenis biaya tidak ditemukan.');
    return f;
  }

  async function ruleViews(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select({
        id: finDiscountRule.id,
        name: finDiscountRule.name,
        kind: finDiscountRule.kind,
        value: finDiscountRule.value,
        feeTypeId: finDiscountRule.feeTypeId,
        feeTypeName: finFeeType.name,
        active: finDiscountRule.active,
      })
      .from(finDiscountRule)
      .leftJoin(finFeeType, eq(finFeeType.id, finDiscountRule.feeTypeId))
      .where(onlyId ? eq(finDiscountRule.id, onlyId) : undefined)
      .orderBy(asc(finDiscountRule.name));
    const used = await tx
      .select({ id: finStudentDiscount.ruleId, n: count() })
      .from(finStudentDiscount)
      .groupBy(finStudentDiscount.ruleId);
    return rows.map((r) => ({ ...r, assignedCount: used.find((u) => u.id === r.id)?.n ?? 0 }));
  }

  /* ---------- Aturan ---------- */

  app.get(
    '/v1/finance/discount-rules',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar aturan keringanan',
        description:
          'Izin: `finance:read`; modul `finance`. Aturan keringanan/beasiswa sekolah, urut nama. `assignedCount` = jumlah ' +
          'pemasangan ke siswa.',
        headers: schoolHeader,
        response: { 200: z.array(ruleSchema), ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => ruleViews(tx)),
  );

  app.post(
    '/v1/finance/discount-rules',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah aturan keringanan',
        description:
          'Izin: `finance:manage`; modul `finance`. `kind` `percent` (nilai 1..100) atau `amount` (rupiah > 0). ' +
          '`feeTypeId` kosong = berlaku untuk semua jenis biaya. Nama unik di sekolah (409 `conflict`); 400 ' +
          '`invalid_reference` bila jenis biaya bukan milik sekolah.',
        headers: schoolHeader,
        body: ruleBody,
        response: { 201: ruleSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Nama aturan keringanan itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await requireFeeType(tx, request.body.feeTypeId);
          const [row] = await tx
            .insert(finDiscountRule)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: finDiscountRule.id });
          await audit(tx, ctx, 'finance.discount_rule_create', 'fin_discount_rule', row!.id, request.body);
          return (await ruleViews(tx, row!.id))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/finance/discount-rules/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah aturan keringanan',
        description:
          'Izin: `finance:manage`; modul `finance`. Perubahan hanya memengaruhi tagihan yang dibuat sesudahnya. ' +
          'Nama unik (409 `conflict`); 404 `not_found`; 400 `invalid_reference`.',
        headers: schoolHeader,
        params: idParams,
        body: ruleBody,
        response: { 200: ruleSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Nama aturan keringanan itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [current] = await tx
            .select({ id: finDiscountRule.id })
            .from(finDiscountRule)
            .where(eq(finDiscountRule.id, request.params.id));
          if (!current) throw notFound('Aturan keringanan');
          await requireFeeType(tx, request.body.feeTypeId);
          await tx.update(finDiscountRule).set(request.body).where(eq(finDiscountRule.id, current.id));
          await audit(tx, ctx, 'finance.discount_rule_update', 'fin_discount_rule', current.id, request.body);
          return (await ruleViews(tx, current.id))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/finance/discount-rules/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus aturan keringanan',
        description:
          'Izin: `finance:manage`; modul `finance`. Ditolak 409 `in_use` bila sudah dipasang ke siswa (nonaktifkan ' +
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
        const [view] = await ruleViews(tx, id);
        if (!view) throw notFound('Aturan keringanan');
        if (view.assignedCount > 0) {
          throw new HttpError(
            409,
            'in_use',
            'Aturan ini sudah dipasang ke siswa; lepas pemasangannya atau nonaktifkan aturan.',
          );
        }
        await tx.delete(finDiscountRule).where(eq(finDiscountRule.id, id));
        await audit(tx, ctx, 'finance.discount_rule_delete', 'fin_discount_rule', id, { name: view.name });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Pemasangan ke siswa ---------- */

  app.get(
    '/v1/finance/students/:studentId/discounts',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Keringanan terpasang pada siswa',
        description:
          'Izin: `finance:read`; modul `finance`. Daftar keringanan yang dipasang pada siswa di satu tahun ajaran ' +
          '(`academicYearId` wajib), urut nama aturan. 404 `not_found` bila siswa tak ada.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        querystring: z.object({ academicYearId: z.uuid() }),
        response: { 200: z.array(assignedSchema), 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [s] = await tx
          .select({ id: student.id })
          .from(student)
          .where(eq(student.id, request.params.studentId));
        if (!s) throw notFound('Siswa');
        return tx
          .select({
            id: finStudentDiscount.id,
            rule: {
              id: finDiscountRule.id,
              name: finDiscountRule.name,
              kind: finDiscountRule.kind,
              value: finDiscountRule.value,
              feeTypeId: finDiscountRule.feeTypeId,
              active: finDiscountRule.active,
            },
            reason: finStudentDiscount.reason,
          })
          .from(finStudentDiscount)
          .innerJoin(finDiscountRule, eq(finDiscountRule.id, finStudentDiscount.ruleId))
          .where(
            and(
              eq(finStudentDiscount.studentId, s.id),
              eq(finStudentDiscount.academicYearId, request.query.academicYearId),
            ),
          )
          .orderBy(asc(finDiscountRule.name), asc(finStudentDiscount.id));
      }),
  );

  app.post(
    '/v1/finance/discounts/assign',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Pasang keringanan ke siswa',
        description:
          'Izin: `finance:manage`; modul `finance`. Pasang satu aturan ke `studentIds` (maks 300) atau ke seluruh siswa ' +
          'satu `classId` (terdaftar di kelas itu pada tahun ajaran tsb), tepat salah satunya. Pemasangan yang sudah ada ' +
          '(siswa, aturan, tahun) dilewati dan dihitung di `skipped`. Tidak mengubah tagihan yang sudah dibuat. Galat: ' +
          '400 `invalid_reference` (aturan, tahun ajaran, kelas, atau siswa bukan milik sekolah).',
        headers: schoolHeader,
        body: z
          .object({
            ruleId: z.uuid(),
            academicYearId: z.uuid(),
            studentIds: z.array(z.uuid()).min(1).max(300).optional(),
            classId: z.uuid().optional(),
            reason: z.string().trim().max(300).optional(),
          })
          .refine((v) => (v.studentIds === undefined) !== (v.classId === undefined), {
            message: 'Isi tepat salah satu: studentIds atau classId.',
          }),
        response: {
          200: z.object({ assigned: z.number().int(), skipped: z.number().int() }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const [rule] = await tx
          .select({ id: finDiscountRule.id })
          .from(finDiscountRule)
          .where(eq(finDiscountRule.id, b.ruleId));
        if (!rule) throw invalidRef('Aturan keringanan tidak ditemukan.');
        const [year] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.id, b.academicYearId));
        if (!year) throw invalidRef('Tahun ajaran tidak ditemukan.');

        let studentIds: string[];
        if (b.classId) {
          const [cls] = await tx
            .select({ academicYearId: classRoom.academicYearId })
            .from(classRoom)
            .where(eq(classRoom.id, b.classId));
          if (!cls || cls.academicYearId !== year.id) {
            throw invalidRef('Kelas tidak ditemukan pada tahun ajaran itu.');
          }
          const rows = await tx
            .select({ id: enrollment.studentId })
            .from(enrollment)
            .innerJoin(student, eq(student.id, enrollment.studentId))
            .where(
              and(
                eq(enrollment.classId, b.classId),
                eq(enrollment.academicYearId, year.id),
                isNull(student.deletedAt),
              ),
            );
          studentIds = rows.map((r) => r.id);
        } else {
          studentIds = [...new Set(b.studentIds ?? [])];
          const found = await tx
            .select({ id: student.id })
            .from(student)
            .where(and(inArray(student.id, studentIds), isNull(student.deletedAt)));
          if (found.length !== studentIds.length) throw invalidRef('Ada siswa yang tidak ditemukan.');
        }

        let assigned = 0;
        for (let i = 0; i < studentIds.length; i += 500) {
          const inserted = await tx
            .insert(finStudentDiscount)
            .values(
              studentIds.slice(i, i + 500).map((studentId) => ({
                schoolId: ctx.schoolId,
                studentId,
                ruleId: rule.id,
                academicYearId: year.id,
                reason: b.reason || null,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: finStudentDiscount.id });
          assigned += inserted.length;
        }
        const skipped = studentIds.length - assigned;
        await audit(tx, ctx, 'finance.discount_assign', 'fin_discount_rule', rule.id, {
          academicYearId: year.id,
          classId: b.classId ?? null,
          assigned,
          skipped,
        });
        return { assigned, skipped };
      });
    },
  );

  app.delete(
    '/v1/finance/discounts/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Lepas keringanan dari siswa',
        description:
          'Izin: `finance:manage`; modul `finance`. Melepas satu pemasangan. Tidak mengubah tagihan yang sudah dibuat. ' +
          '404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [row] = await tx
          .delete(finStudentDiscount)
          .where(eq(finStudentDiscount.id, request.params.id))
          .returning({
            id: finStudentDiscount.id,
            studentId: finStudentDiscount.studentId,
            ruleId: finStudentDiscount.ruleId,
          });
        if (!row) throw notFound('Keringanan');
        await audit(tx, ctx, 'finance.discount_unassign', 'fin_student_discount', row.id, {
          studentId: row.studentId,
          ruleId: row.ruleId,
        });
        return { ok: true as const };
      });
    },
  );
}
