import { eq, finBankAccount, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listBankAccounts } from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

/** Batas rekening per sekolah (cukup untuk beberapa bank; mencegah daftar membengkak di portal). */
export const MAX_BANK_ACCOUNTS = 10;

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const accountSchema = z.object({
  id: z.uuid(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountHolder: z.string(),
  note: z.string().nullable(),
  active: z.boolean().describe('Hanya rekening aktif yang tampil di portal wali dan siswa'),
  sort: z.number().int(),
});

const bankName = z.string().trim().min(2).max(60);
const accountNumber = z
  .string()
  .trim()
  .min(5)
  .max(30)
  .regex(/^[0-9][0-9 -]*$/, 'Nomor rekening hanya boleh berisi angka, spasi, dan tanda hubung.')
  .refine((v) => v.replace(/\D/g, '').length >= 5, 'Nomor rekening minimal 5 angka.');
const accountHolder = z.string().trim().min(2).max(100);
const note = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .transform((v) => (v === null || v === '' ? null : v));

const fields = z.object({ bankName, accountNumber, accountHolder });

/** Rekening bank sekolah untuk pembayaran transfer. Modul `finance`. */
export async function financeBankAccountRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const notFound = () => new HttpError(404, 'not_found', 'Rekening tidak ditemukan.');

  app.get(
    '/v1/finance/bank-accounts',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar rekening sekolah',
        description:
          'Izin: `finance:read`; modul `finance`. Semua rekening sekolah (aktif dan nonaktif) urut `sort`. Rekening ' +
          '`active` tampil kepada wali dan siswa di tab tagihan portal sebagai tujuan pembayaran transfer.',
        headers: schoolHeader,
        response: { 200: z.object({ items: z.array(accountSchema) }), ...guarded },
      },
    },
    async (request) => tenant(request, async (tx) => ({ items: await listBankAccounts(tx) })),
  );

  app.post(
    '/v1/finance/bank-accounts',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah rekening sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. `accountNumber` berisi angka, spasi, atau tanda hubung (5-30 ' +
          'karakter, minimal 5 angka). `note` opsional (maks 200 karakter, mis. cabang atau berita transfer). Rekening ' +
          'baru ditaruh di urutan terakhir. Galat: 400 validasi, 409 `limit_reached` bila sudah 10 rekening.',
        headers: schoolHeader,
        body: fields.extend({ note: note.default(null), active: z.boolean().default(true) }),
        response: { 201: accountSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const created = await tenant(request, async (tx) => {
        const existing = await listBankAccounts(tx);
        if (existing.length >= MAX_BANK_ACCOUNTS) {
          throw new HttpError(
            409,
            'limit_reached',
            `Maksimal ${MAX_BANK_ACCOUNTS} rekening per sekolah; hapus yang tidak dipakai.`,
          );
        }
        const sort = existing.reduce((a, r) => Math.max(a, r.sort), -1) + 1;
        const [row] = await tx
          .insert(finBankAccount)
          .values({ schoolId: ctx.schoolId, ...b, sort })
          .returning({ id: finBankAccount.id });
        await audit(tx, ctx, 'finance.bank_account_create', 'fin_bank_account', row!.id, {
          bankName: b.bankName,
          accountHolder: b.accountHolder,
        });
        return (await listBankAccounts(tx)).find((r) => r.id === row!.id)!;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/finance/bank-accounts/order',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur urutan rekening sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. `ids` harus memuat SEMUA rekening sekolah tepat satu kali, sesuai ' +
          'urutan baru. Galat: 400 `invalid_reference` bila daftar tidak lengkap atau memuat id asing.',
        headers: schoolHeader,
        body: z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
        response: { 200: z.object({ items: z.array(accountSchema) }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { ids } = request.body;
      return tenant(request, async (tx) => {
        const existing = await listBankAccounts(tx);
        const have = new Set(existing.map((r) => r.id));
        if (new Set(ids).size !== ids.length || ids.length !== have.size || ids.some((i) => !have.has(i))) {
          throw new HttpError(
            400,
            'invalid_reference',
            'Daftar urutan harus memuat semua rekening tepat sekali.',
          );
        }
        for (const [index, id] of ids.entries()) {
          await tx.update(finBankAccount).set({ sort: index }).where(eq(finBankAccount.id, id));
        }
        await audit(tx, ctx, 'finance.bank_account_reorder', 'fin_bank_account', ctx.schoolId, { ids });
        return { items: await listBankAccounts(tx) };
      });
    },
  );

  app.patch(
    '/v1/finance/bank-accounts/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah rekening sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. Ubah sebagian atau semua dari `bankName`, `accountNumber`, ' +
          '`accountHolder`, `note` (null/kosong menghapus), `active`. Galat: 400 validasi, 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: fields
          .partial()
          .extend({ note: note.optional(), active: z.boolean().optional() })
          .refine((v) => Object.values(v).some((x) => x !== undefined), {
            message: 'Tidak ada yang diubah.',
          }),
        response: { 200: accountSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const [current] = await tx
          .select()
          .from(finBankAccount)
          .where(eq(finBankAccount.id, request.params.id));
        if (!current) throw notFound();
        const set = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
        await tx.update(finBankAccount).set(set).where(eq(finBankAccount.id, current.id));
        await audit(tx, ctx, 'finance.bank_account_update', 'fin_bank_account', current.id, {
          changed: Object.keys(set),
        });
        return (await listBankAccounts(tx)).find((r) => r.id === current.id)!;
      });
    },
  );

  app.delete(
    '/v1/finance/bank-accounts/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus rekening sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. Menghapus rekening dari daftar (tidak memengaruhi kwitansi yang sudah ' +
          'ada). Untuk menyembunyikan sementara dari portal, nonaktifkan saja. 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const deleted = await tx
          .delete(finBankAccount)
          .where(eq(finBankAccount.id, request.params.id))
          .returning({ id: finBankAccount.id, bankName: finBankAccount.bankName });
        if (deleted.length === 0) throw notFound();
        await audit(tx, ctx, 'finance.bank_account_delete', 'fin_bank_account', request.params.id, {
          bankName: deleted[0]!.bankName,
        });
        return { ok: true as const };
      });
    },
  );
}
