import { randomUUID } from 'node:crypto';
import {
  createPaymentProvider,
  decryptSecret,
  encryptSecret,
  InvalidWebhookError,
  type PaymentProvider,
} from '@edusync/billing';
import {
  and,
  asc,
  auditLog,
  desc,
  eq,
  finGatewaySetting,
  finInvoice,
  finOnlineCharge,
  finPayment,
  finPaymentItem,
  finPaymentMethod,
  inArray,
  school,
  sql,
  student,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInSchool } from '../attendance-lib';
import type { Env } from '../env';
import { listPaymentMethods, paidFor } from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { notifyPayment } from '../messaging-lib';
import { allowedStudentIds, loadLink, sectionFlags } from '../portal-lib';
import { audit, guarded, schoolHeader } from './helpers';

const tag = ['Finance'];
const tagPortal = ['Portal'];
const MODULE = 'finance';
const PORTAL_MODULE = 'parent_portal';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const payGate = [requirePermission('finance:pay'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];
const portalGate = [requirePermission('portal:read'), requireModule(PORTAL_MODULE)];

/** Kunci metode pembayaran yang dibuat otomatis untuk kwitansi hasil pembayaran online. */
export const ONLINE_METHOD_KEY = 'midtrans';
const ONLINE_METHOD_LABEL = 'Midtrans (online)';

type Mode = 'sandbox' | 'production';
const SNAP_URL: Record<Mode, string> = {
  sandbox: 'https://app.sandbox.midtrans.com/snap/v1/transactions',
  production: 'https://app.midtrans.com/snap/v1/transactions',
};
const API_BASE: Record<Mode, string> = {
  sandbox: 'https://api.sandbox.midtrans.com',
  production: 'https://api.midtrans.com',
};
const SERVER_PREFIX: Record<Mode, string> = { sandbox: 'SB-Mid-server-', production: 'Mid-server-' };

const settingSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['sandbox', 'production']),
  merchantId: z.string().nullable(),
  clientKey: z.string().nullable(),
  hasServerKey: z.boolean().describe('Kunci server sudah tersimpan (nilainya tidak pernah dikembalikan)'),
  ready: z.boolean().describe('Aktif dan kunci server tersimpan, sehingga pembayaran online bisa dipakai'),
  webhookUrl: z.string().describe('Alamat notifikasi yang didaftarkan di dasbor Midtrans sekolah'),
});

const chargeSchema = z.object({
  orderId: z.string(),
  studentId: z.uuid(),
  status: z.enum(['pending', 'paid', 'failed']),
  total: z.number().int(),
  paymentUrl: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  items: z.array(z.object({ invoiceId: z.uuid(), amount: z.number().int() })),
});

const createdSchema = z.object({ paymentUrl: z.string(), orderId: z.string(), total: z.number().int() });

const payBody = z.object({ invoiceIds: z.array(z.uuid()).min(1).max(50) });

const outcomeSchema = z.object({
  outcome: z.enum([
    'paid',
    'failed',
    'pending',
    'duplicate',
    'amount_mismatch',
    'needs_review',
    'unknown_order',
  ]),
});

type Outcome = z.infer<typeof outcomeSchema>['outcome'];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Midtrans milik sekolah: pembayaran online tagihan siswa langsung ke rekening sekolah. */
export async function financeGatewayRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;
  const webhookUrl = `${env.WEB_URL.replace(/\/$/, '')}/v1/webhooks/school-payments/midtrans`;

  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const providerFor = (mode: Mode, serverKey: string, webUrl = env.WEB_URL): PaymentProvider =>
    createPaymentProvider({
      provider: 'midtrans',
      webUrl,
      devSecret: env.PAYMENT_DEV_SECRET,
      midtransServerKey: serverKey,
      midtransSnapUrl: SNAP_URL[mode],
    });

  const view = (row: typeof finGatewaySetting.$inferSelect | undefined) => ({
    enabled: row?.enabled ?? false,
    mode: (row?.mode ?? 'sandbox') as Mode,
    merchantId: row?.merchantId ?? null,
    clientKey: row?.clientKey ?? null,
    hasServerKey: Boolean(row?.serverKeyEnc),
    ready: Boolean(row?.enabled && row?.serverKeyEnc),
    webhookUrl,
  });

  function readKey(row: typeof finGatewaySetting.$inferSelect | undefined): string | null {
    if (!row?.serverKeyEnc) return null;
    try {
      return decryptSecret(row.serverKeyEnc, env.AUTH_SECRET);
    } catch {
      return null;
    }
  }

  /* ---------- Pengaturan ---------- */

  app.get(
    '/v1/finance/gateway',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan Midtrans sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. Pengaturan pembayaran online ke akun Midtrans milik sekolah sendiri. ' +
          'Kunci server tidak pernah dikembalikan, hanya `hasServerKey`. `webhookUrl` didaftarkan di dasbor Midtrans ' +
          'sekolah sebagai Payment Notification URL.',
        headers: schoolHeader,
        response: { 200: settingSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [row] = await tx.select().from(finGatewaySetting);
        return view(row);
      }),
  );

  app.put(
    '/v1/finance/gateway',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan Midtrans sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. `serverKey` kosong/dihilangkan berarti mempertahankan kunci tersimpan; ' +
          'kunci disimpan terenkripsi. Awalan kunci server harus cocok dengan `mode` (sandbox: `SB-Mid-server-`; ' +
          'production: `Mid-server-`); kunci klien tidak diperiksa awalannya karena formatnya bisa berbeda antar akun. ' +
          'Galat: 400 `invalid_key` (awalan kunci server tidak cocok atau kunci tersimpan tidak cocok dengan mode baru), ' +
          '400 `key_required` (diaktifkan tanpa kunci server).',
        headers: schoolHeader,
        body: z.object({
          enabled: z.boolean(),
          mode: z.enum(['sandbox', 'production']),
          merchantId: z.string().trim().max(60).nullish(),
          clientKey: z.string().trim().max(200).nullish(),
          serverKey: z.string().trim().max(200).optional(),
        }),
        response: { 200: settingSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const newKey = b.serverKey?.trim() || undefined;
      const clientKey = b.clientKey?.trim() || null;
      if (newKey && !newKey.startsWith(SERVER_PREFIX[b.mode])) {
        throw new HttpError(
          400,
          'invalid_key',
          `Kunci server untuk mode ${b.mode} harus diawali ${SERVER_PREFIX[b.mode]}.`,
        );
      }
      return tenant(request, async (tx) => {
        const [current] = await tx.select().from(finGatewaySetting);
        let serverKeyEnc = current?.serverKeyEnc ?? null;
        if (newKey) serverKeyEnc = encryptSecret(newKey, env.AUTH_SECRET);
        else if (serverKeyEnc) {
          const stored = readKey(current);
          if (stored && !stored.startsWith(SERVER_PREFIX[b.mode])) {
            throw new HttpError(
              400,
              'invalid_key',
              'Kunci server tersimpan tidak cocok dengan mode ini; isi kunci server yang baru.',
            );
          }
        }
        if (b.enabled && !serverKeyEnc) {
          throw new HttpError(400, 'key_required', 'Isi kunci server Midtrans sebelum mengaktifkan.');
        }
        const values = {
          enabled: b.enabled,
          mode: b.mode,
          merchantId: b.merchantId?.trim() || null,
          clientKey,
          serverKeyEnc,
          updatedAt: new Date(),
        };
        const [row] = await tx
          .insert(finGatewaySetting)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: finGatewaySetting.schoolId, set: values })
          .returning();
        await audit(tx, ctx, 'finance.gateway_update', 'fin_gateway_setting', ctx.schoolId, {
          enabled: b.enabled,
          mode: b.mode,
          serverKeyChanged: Boolean(newKey),
        });
        return view(row);
      });
    },
  );

  app.post(
    '/v1/finance/gateway/test',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Uji kunci Midtrans sekolah',
        description:
          'Izin: `finance:manage`; modul `finance`. Memeriksa kunci server tersimpan dengan bertanya status pesanan ' +
          'fiktif ke Midtrans (tanpa transaksi dan tanpa uang). `ok` true bila kunci diterima; selain itu `reason` ' +
          'menjelaskan penyebabnya.',
        headers: schoolHeader,
        response: {
          200: z.object({ ok: z.boolean(), reason: z.string().nullable() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const [row] = await tenant(request, (tx) => tx.select().from(finGatewaySetting));
      const key = readKey(row);
      if (!row || !key) return { ok: false, reason: 'Kunci server belum diisi atau tidak terbaca.' };
      try {
        const res = await fetch(
          `${API_BASE[row.mode]}/v2/${encodeURIComponent(`EDUSYNC-TEST-${randomUUID()}`)}/status`,
          {
            headers: {
              accept: 'application/json',
              authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        const body = (await res.json().catch(() => ({}))) as { status_code?: string };
        const status = Number(body.status_code ?? res.status);
        if (status === 404) return { ok: true, reason: null };
        if (status === 401 || status === 403) {
          return { ok: false, reason: 'Midtrans menolak kunci server (tidak valid untuk mode ini).' };
        }
        return { ok: false, reason: `Midtrans menjawab dengan status tak terduga (${status}).` };
      } catch {
        return { ok: false, reason: 'Midtrans tidak dapat dihubungi. Coba lagi nanti.' };
      }
    },
  );

  /* ---------- Membuat transaksi ---------- */

  async function createOnlineCharge(
    request: { ctx?: TenantContext; authUser?: unknown; server: FastifyInstance },
    studentId: string,
    invoiceIds: string[],
    check?: (tx: Tx) => Promise<void>,
  ) {
    const ctx = request.ctx as TenantContext;
    const email = (request.authUser as { email?: string } | undefined)?.email ?? '';
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new HttpError(400, 'duplicate_item', 'Satu tagihan hanya boleh dipilih sekali.');
    }
    const prepared = await tenant(request, async (tx) => {
      if (check) await check(tx);
      const [setting] = await tx.select().from(finGatewaySetting);
      const key = readKey(setting);
      if (!setting?.enabled || !key) {
        throw new HttpError(409, 'gateway_disabled', 'Pembayaran online belum diaktifkan oleh sekolah.');
      }
      const [stu] = await tx
        .select({ id: student.id, name: student.name })
        .from(student)
        .where(eq(student.id, studentId));
      if (!stu) throw new HttpError(400, 'invalid_reference', 'Siswa tidak ditemukan.');
      const locked = await tx
        .select()
        .from(finInvoice)
        .where(inArray(finInvoice.id, invoiceIds))
        .orderBy(asc(finInvoice.id))
        .for('update');
      if (locked.length !== invoiceIds.length || locked.some((i) => i.studentId !== studentId)) {
        throw new HttpError(400, 'invalid_reference', 'Tagihan tidak ditemukan atau bukan milik siswa ini.');
      }
      if (locked.some((i) => i.status === 'void')) {
        throw new HttpError(409, 'invoice_void', 'Ada tagihan yang sudah dibatalkan.');
      }
      const paid = await paidFor(tx, invoiceIds);
      const items = invoiceIds.map((invoiceId) => {
        const inv = locked.find((i) => i.id === invoiceId)!;
        return {
          invoiceId,
          amount: inv.amount - inv.discount - (paid.get(invoiceId) ?? 0),
          title: inv.title,
        };
      });
      const settled = items.find((i) => i.amount <= 0);
      if (settled) {
        throw new HttpError(409, 'already_paid', `Tagihan "${settled.title}" sudah lunas.`);
      }
      const total = items.reduce((a, i) => a + i.amount, 0);
      if (total > 2_000_000_000) throw new HttpError(400, 'validation', 'Total pembayaran terlalu besar.');
      const orderId = `FEE-${randomUUID().replace(/-/g, '').slice(0, 8)}-${Date.now()}`;
      const [charge] = await tx
        .insert(finOnlineCharge)
        .values({
          schoolId: ctx.schoolId,
          studentId,
          orderId,
          items: items.map((i) => ({ invoiceId: i.invoiceId, amount: i.amount })),
          total,
          createdBy: ctx.userId,
        })
        .returning({ id: finOnlineCharge.id });
      await audit(tx, ctx, 'finance.online_charge_create', 'fin_online_charge', charge!.id, {
        orderId,
        studentId,
        total,
        invoices: invoiceIds.length,
      });
      return {
        id: charge!.id,
        orderId,
        total,
        mode: setting.mode as Mode,
        key,
        studentName: stu.name,
        description: items.map((i) => i.title).join(', '),
      };
    });

    // Sesi login terikat ke host sekolah, jadi pengguna harus kembali ke <slug>.<APP_DOMAIN>, bukan host utama.
    const [unit] = await request.server.platformDb
      .select({ slug: school.slug })
      .from(school)
      .where(eq(school.id, ctx.schoolId));
    const base = new URL(env.WEB_URL);
    const schoolWebUrl = unit ? `${base.protocol}//${unit.slug}.${env.APP_DOMAIN}` : env.WEB_URL;

    let paymentUrl: string;
    try {
      const charge = await providerFor(prepared.mode, prepared.key, schoolWebUrl).createCharge({
        orderId: prepared.orderId,
        amount: prepared.total,
        customer: { name: prepared.studentName, email },
        description: prepared.description || 'Tagihan sekolah',
        returnPath: `/pay/online/${prepared.orderId}`,
      });
      paymentUrl = charge.paymentUrl;
    } catch (error) {
      request.server.log.warn({ err: error }, 'Midtrans sekolah menolak pembuatan transaksi');
      await tenant(request, (tx) =>
        tx.update(finOnlineCharge).set({ status: 'failed' }).where(eq(finOnlineCharge.id, prepared.id)),
      );
      throw new HttpError(
        502,
        'gateway_error',
        'Midtrans menolak pembuatan transaksi. Periksa pengaturan kunci.',
      );
    }
    await tenant(request, (tx) =>
      tx.update(finOnlineCharge).set({ paymentUrl }).where(eq(finOnlineCharge.id, prepared.id)),
    );
    return { paymentUrl, orderId: prepared.orderId, total: prepared.total };
  }

  app.post(
    '/v1/finance/invoices/pay-online',
    {
      onRequest: payGate,
      schema: {
        tags: tag,
        summary: 'Buat pembayaran online untuk tagihan siswa',
        description:
          'Izin: `finance:pay`; modul `finance`. Membuat transaksi Midtrans (Snap) milik sekolah untuk 1..50 tagihan satu ' +
          'siswa. Nominal dihitung server dari sisa tagihan (nominal dari klien tidak dipakai). Kwitansi baru tercatat ' +
          'setelah Midtrans mengabarkan pembayaran berhasil. Galat: 409 `gateway_disabled`, 409 `already_paid`, 409 ' +
          '`invoice_void`, 400 `invalid_reference`, 400 `duplicate_item`, 502 `gateway_error`.',
        headers: schoolHeader,
        body: payBody.extend({ studentId: z.uuid() }),
        response: { 201: createdSchema, 400: errorSchema, 409: errorSchema, 502: errorSchema, ...guarded },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createOnlineCharge(request, request.body.studentId, request.body.invoiceIds)),
  );

  app.post(
    '/v1/portal/children/:studentId/pay-online',
    {
      onRequest: portalGate,
      schema: {
        tags: tagPortal,
        summary: 'Bayar tagihan anak secara online',
        description:
          'Izin: `portal:read`; modul `parent_portal` dan `finance`. Wali hanya untuk anaknya, siswa hanya untuk dirinya ' +
          '(selain itu 404 `not_found`). Perilaku dan galat sama dengan `/v1/finance/invoices/pay-online`.',
        headers: schoolHeader,
        params: z.object({ studentId: z.uuid() }),
        body: payBody,
        response: {
          201: createdSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          502: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const { studentId } = request.params;
      const result = await createOnlineCharge(request, studentId, request.body.invoiceIds, async (tx) => {
        const link = await loadLink(tx, request.ctx as TenantContext);
        const allowed = link ? await allowedStudentIds(tx, link) : [];
        if (!allowed.includes(studentId)) throw new HttpError(404, 'not_found', 'Anak tidak ditemukan.');
        if (!(await sectionFlags(tx)).finance) {
          throw new HttpError(409, 'gateway_disabled', 'Modul keuangan sekolah tidak aktif.');
        }
      });
      return reply.code(201).send(result);
    },
  );

  /* ---------- Menerapkan kabar pembayaran ---------- */

  async function ensureOnlineMethod(tx: Tx, schoolId: string) {
    const rows = await listPaymentMethods(tx, schoolId);
    if (rows.some((r) => r.key === ONLINE_METHOD_KEY)) return;
    const sort = rows.reduce((a, m) => Math.max(a, m.sort), -1) + 1;
    // Nonaktif: bukan pilihan kasir, tetapi sah untuk riwayat dan laporan.
    await tx
      .insert(finPaymentMethod)
      .values({ schoolId, key: ONLINE_METHOD_KEY, label: ONLINE_METHOD_LABEL, active: false, sort })
      .onConflictDoNothing();
  }

  /** Terapkan PaymentEvent yang sudah diverifikasi pada transaksi sekolah. Idempoten: transaksi hanya diproses sekali. */
  async function applyEvent(
    chargeId: string,
    schoolId: string,
    event: { status: 'paid' | 'failed' | 'pending'; amount: number },
  ): Promise<Outcome> {
    return withTenant(app.tenantDb, [schoolId], async (tx): Promise<Outcome> => {
      const [charge] = await tx
        .select()
        .from(finOnlineCharge)
        .where(eq(finOnlineCharge.id, chargeId))
        .for('update');
      if (!charge) return 'unknown_order';
      if (charge.status !== 'pending') return 'duplicate';
      if (event.status === 'pending') return 'pending';
      if (event.status === 'failed') {
        await tx.update(finOnlineCharge).set({ status: 'failed' }).where(eq(finOnlineCharge.id, charge.id));
        await tx.insert(auditLog).values({
          schoolId,
          actorId: 'midtrans',
          action: 'finance.online_charge_failed',
          entityType: 'fin_online_charge',
          entityId: charge.id,
          details: { orderId: charge.orderId },
        });
        return 'failed';
      }
      const ledger = (action: string, details: Record<string, unknown>) =>
        tx.insert(auditLog).values({
          schoolId,
          actorId: 'midtrans',
          action,
          entityType: 'fin_online_charge',
          entityId: charge.id,
          details: { orderId: charge.orderId, ...details },
        });
      if (event.amount !== charge.total) {
        await ledger('finance.online_charge_amount_mismatch', {
          expected: charge.total,
          received: event.amount,
        });
        return 'amount_mismatch';
      }

      const ids = charge.items.map((i) => i.invoiceId);
      const locked = await tx
        .select()
        .from(finInvoice)
        .where(inArray(finInvoice.id, ids))
        .orderBy(asc(finInvoice.id))
        .for('update');
      const paid = await paidFor(tx, ids);
      // Kasir mungkin sudah melunasi sambil menunggu: nominal dibatasi sisa tagihan agar tidak pernah melebihi.
      const allocations: { invoiceId: string; amount: number; title: string }[] = [];
      for (const item of charge.items) {
        const inv = locked.find((i) => i.id === item.invoiceId);
        if (!inv || inv.status === 'void') continue;
        const amount = Math.min(item.amount, inv.amount - inv.discount - (paid.get(inv.id) ?? 0));
        if (amount > 0) allocations.push({ invoiceId: inv.id, amount, title: inv.title });
      }
      if (allocations.length === 0) {
        await tx
          .update(finOnlineCharge)
          .set({ status: 'paid', paidAt: new Date() })
          .where(eq(finOnlineCharge.id, charge.id));
        await ledger('finance.online_charge_unallocated', { total: charge.total });
        return 'needs_review';
      }
      const total = allocations.reduce((a, i) => a + i.amount, 0);

      await ensureOnlineMethod(tx, schoolId);
      const year = Number(todayInSchool().slice(0, 4));
      const counter = await tx.execute<{ last: number }>(sql`
        insert into fin_counter (school_id, year, last) values (${schoolId}, ${year}, 1)
        on conflict (school_id, year) do update set last = fin_counter.last + 1
        returning last`);
      const receiptNo = `KWT-${year}-${String(counter.rows[0]!.last).padStart(6, '0')}`;
      const paidAt = new Date();
      const partial = total < charge.total;
      const [pay] = await tx
        .insert(finPayment)
        .values({
          schoolId,
          receiptNo,
          studentId: charge.studentId,
          paidAt,
          method: ONLINE_METHOD_KEY,
          total,
          note: `Pembayaran online Midtrans, pesanan ${charge.orderId}${partial ? ' (sebagian tagihan sudah lunas sebelumnya)' : ''}`,
          recordedBy: 'midtrans',
        })
        .returning({ id: finPayment.id });
      await tx.insert(finPaymentItem).values(
        allocations.map((a) => ({
          schoolId,
          paymentId: pay!.id,
          invoiceId: a.invoiceId,
          amount: a.amount,
        })),
      );
      await tx
        .update(finOnlineCharge)
        .set({ status: 'paid', paidAt, paymentId: pay!.id })
        .where(eq(finOnlineCharge.id, charge.id));
      await ledger('finance.online_charge_paid', { receiptNo, total, chargedTotal: charge.total });

      const [stu] = await tx
        .select({ name: student.name })
        .from(student)
        .where(eq(student.id, charge.studentId));
      const [sch] = await tx.select({ name: school.name }).from(school).where(eq(school.id, schoolId));
      await notifyPayment(tx, schoolId, pay!.id, {
        receiptNo,
        paidAt: paidAt.toISOString(),
        total,
        school: { name: sch?.name ?? '' },
        student: { id: charge.studentId, name: stu?.name ?? '', className: null },
        items: allocations.map((a) => ({ title: a.title })),
      });
      return 'paid';
    });
  }

  /** Cari transaksi menurut order id lewat koneksi platform (tanpa RLS) beserta pengaturan sekolahnya. */
  async function lookup(orderId: string) {
    const [charge] = await app.platformDb
      .select()
      .from(finOnlineCharge)
      .where(eq(finOnlineCharge.orderId, orderId));
    if (!charge) return null;
    const [setting] = await app.platformDb
      .select()
      .from(finGatewaySetting)
      .where(eq(finGatewaySetting.schoolId, charge.schoolId));
    return { charge, setting, key: readKey(setting) };
  }

  /** Verifikasi tanda tangan dengan kunci SEKOLAH pemilik transaksi, lalu terapkan. */
  async function handleNotification(body: unknown, orderId: string): Promise<Outcome> {
    const found = await lookup(orderId);
    if (!found) return 'unknown_order';
    if (!found.setting || !found.key) {
      throw new HttpError(401, 'invalid_signature', 'Tanda tangan webhook tidak valid.');
    }
    let event: ReturnType<PaymentProvider['parseWebhook']>;
    try {
      event = providerFor(found.setting.mode as Mode, found.key).parseWebhook(body);
    } catch (error) {
      if (error instanceof InvalidWebhookError) {
        throw new HttpError(401, 'invalid_signature', 'Tanda tangan webhook tidak valid.');
      }
      throw error;
    }
    if (event.orderId !== orderId)
      throw new HttpError(401, 'invalid_signature', 'Tanda tangan webhook tidak valid.');
    return applyEvent(found.charge.id, found.charge.schoolId, event);
  }

  app.post(
    '/v1/webhooks/school-payments/midtrans',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Webhook Midtrans milik sekolah',
        description:
          'Publik; dipanggil Midtrans. Sekolah dicari dari `order_id`, lalu tanda tangan diverifikasi dengan kunci server ' +
          'sekolah itu sendiri (bukan kunci platform). Kabar yang sama boleh dikirim berulang tanpa efek ganda. ' +
          'Nominal harus sama persis dengan transaksi (`amount_mismatch` bila beda) dan tidak pernah melebihi sisa ' +
          'tagihan. `order_id` yang tak dikenal dijawab 200 `unknown_order`.',
        body: z.record(z.string(), z.unknown()),
        response: { 200: outcomeSchema, 401: errorSchema },
      },
    },
    async (request) => {
      const orderId = request.body.order_id;
      if (typeof orderId !== 'string' || !orderId) {
        throw new HttpError(401, 'invalid_signature', 'Tanda tangan webhook tidak valid.');
      }
      return { outcome: await handleNotification(request.body, orderId) };
    },
  );

  /* ---------- Rekonsiliasi dan daftar ---------- */

  /** Cadangan webhook: tanya Midtrans langsung (maksimal sekali per 4 detik per pesanan). */
  const lastChecked = new Map<string, number>();
  async function reconcile(orderId: string) {
    const found = await lookup(orderId);
    if (!found || found.charge.status !== 'pending' || !found.setting || !found.key) return;
    if (Date.now() - (lastChecked.get(orderId) ?? 0) < 4000) return;
    lastChecked.set(orderId, Date.now());
    try {
      const provider = providerFor(found.setting.mode as Mode, found.key);
      const body = await provider.fetchStatus?.(orderId);
      if (!body || typeof body !== 'object') return;
      await handleNotification(body, orderId);
    } catch (error) {
      app.log.warn({ err: error }, 'rekonsiliasi pembayaran sekolah gagal');
    }
  }

  const chargeView = (c: typeof finOnlineCharge.$inferSelect) => ({
    orderId: c.orderId,
    studentId: c.studentId,
    status: c.status,
    total: c.total,
    paymentUrl: c.paymentUrl,
    paidAt: iso(c.paidAt),
    createdAt: c.createdAt.toISOString(),
    items: c.items,
  });

  const orderParams = z.object({ orderId: z.string().min(1).max(100) });

  app.get(
    '/v1/finance/online-charges/:orderId',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Status transaksi online',
        description:
          'Izin: `finance:read`; modul `finance`. Bila masih `pending`, server menanyakan status ke Midtrans sekolah ' +
          '(cadangan bila webhook tidak sampai; dibatasi sekali per 4 detik). 404 `not_found` bila bukan milik sekolah ini.',
        headers: schoolHeader,
        params: orderParams,
        response: { 200: chargeSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const read = () =>
        tenant(request, async (tx) => {
          const [c] = await tx
            .select()
            .from(finOnlineCharge)
            .where(eq(finOnlineCharge.orderId, request.params.orderId));
          if (!c) throw new HttpError(404, 'not_found', 'Transaksi tidak ditemukan.');
          return c;
        });
      const first = await read();
      if (first.status !== 'pending') return chargeView(first);
      await reconcile(first.orderId);
      return chargeView(await read());
    },
  );

  app.get(
    '/v1/portal/online-charges/:orderId',
    {
      onRequest: portalGate,
      schema: {
        tags: tagPortal,
        summary: 'Status transaksi online anak',
        description:
          'Izin: `portal:read`; modul `parent_portal`. Sama dengan status transaksi di keuangan, hanya untuk anak milik ' +
          'akun ini (selain itu 404 `not_found`). Memicu rekonsiliasi ke Midtrans bila masih `pending`.',
        headers: schoolHeader,
        params: orderParams,
        response: { 200: chargeSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const read = () =>
        tenant(request, async (tx) => {
          const [c] = await tx
            .select()
            .from(finOnlineCharge)
            .where(eq(finOnlineCharge.orderId, request.params.orderId));
          const link = await loadLink(tx, ctx);
          const allowed = link ? await allowedStudentIds(tx, link) : [];
          if (!c || !allowed.includes(c.studentId)) {
            throw new HttpError(404, 'not_found', 'Transaksi tidak ditemukan.');
          }
          return c;
        });
      const first = await read();
      if (first.status !== 'pending') return chargeView(first);
      await reconcile(first.orderId);
      return chargeView(await read());
    },
  );

  app.get(
    '/v1/finance/online-charges',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar transaksi online',
        description:
          'Izin: `finance:read`; modul `finance`. Transaksi Midtrans terbaru sekolah (terbaru dulu), beserta nama siswa ' +
          'dan nomor kwitansi bila sudah dibayar. `limit` bawaan 50 (maksimal 200); `status` menyaring.',
        headers: schoolHeader,
        querystring: z.object({
          status: z.enum(['pending', 'paid', 'failed']).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({
            items: z.array(
              chargeSchema.extend({
                studentName: z.string(),
                receiptNo: z.string().nullable(),
                createdBy: z.string(),
              }),
            ),
          }),
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx
          .select({
            charge: finOnlineCharge,
            studentName: student.name,
            receiptNo: finPayment.receiptNo,
          })
          .from(finOnlineCharge)
          .innerJoin(student, eq(student.id, finOnlineCharge.studentId))
          .leftJoin(finPayment, eq(finPayment.id, finOnlineCharge.paymentId))
          .where(request.query.status ? and(eq(finOnlineCharge.status, request.query.status)) : undefined)
          .orderBy(desc(finOnlineCharge.createdAt), desc(finOnlineCharge.id))
          .limit(request.query.limit);
        return {
          items: rows.map((r) => ({
            ...chargeView(r.charge),
            studentName: r.studentName,
            receiptNo: r.receiptNo,
            createdBy: r.charge.createdBy,
          })),
        };
      }),
  );
}
