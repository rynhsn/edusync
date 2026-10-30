import {
  DEFAULT_TEMPLATES,
  EVENT_KEYS,
  EVENT_PLACEHOLDERS,
  type EventKey,
  normalizePhone,
  unknownPlaceholders,
} from '@edusync/contracts';
import {
  and,
  count,
  desc,
  enqueueRaw,
  eq,
  inArray,
  loadPlatformMessaging,
  msgMessage,
  msgSetting,
  msgTemplate,
  sql,
  student,
  type Tx,
  waAccount,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { effectiveProvider, maskPhone, providerActive } from '../messaging-lib';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Messaging'];
const MODULE = 'messaging';
const readGate = [requirePermission('message:read'), requireModule(MODULE)];
const manageGate = [requirePermission('message:manage'), requireModule(MODULE)];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const eventKeySchema = z.enum(EVENT_KEYS);
const STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;

const DEFAULT_SETTINGS = {
  enabled: false,
  delayMinSeconds: 5,
  delayMaxSeconds: 15,
  windowStart: '06:00',
  windowEnd: '20:00',
  absentNoticeAt: '09:00' as string | null,
};

const settingsSchema = z.object({
  enabled: z.boolean().describe('Saklar utama notifikasi sekolah'),
  delayMinSeconds: z.number().int().min(0).max(120).describe('Jeda acak minimum antar pesan (detik)'),
  delayMaxSeconds: z.number().int().min(0).max(300).describe('Jeda acak maksimum antar pesan (detik)'),
  windowStart: hhmm.describe('Awal jendela kirim (Asia/Jakarta)'),
  windowEnd: hhmm.describe('Akhir jendela kirim (Asia/Jakarta)'),
  absentNoticeAt: hhmm.nullable().describe('Jam pengingat "belum tiba"; null = nonaktif'),
});

const templateSchema = z.object({
  eventKey: eventKeySchema,
  body: z.string().describe('Templat yang berlaku (milik sekolah, atau bawaan bila belum ada)'),
  enabled: z.boolean().describe('Peristiwa ini mengirim pesan; tanpa templat milik sekolah = mati'),
  isDefault: z.boolean().describe('Isi sama dengan templat bawaan'),
  defaultBody: z.string(),
  placeholders: z.array(z.string()).describe('Pengganti {{nama}} yang boleh dipakai pada peristiwa ini'),
});

const accountSchema = z.object({
  desiredState: z.enum(['on', 'off']),
  status: z.enum(['disconnected', 'connecting', 'qr', 'ready', 'failed']),
  qr: z.string().nullable(),
  phone: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  providerActive: z
    .boolean()
    .describe('Saklar global platform menyala dan penyedia pesan adalah WhatsApp (bukan mode log)'),
  provider: z
    .enum(['whatsapp', 'log', 'disabled'])
    .describe(
      '`disabled` bila saklar global platform mati; `log` bila penyedia efektif adalah mode uji (pesan dicatat, tidak dikirim); selain itu `whatsapp`',
    ),
});

const messageItemSchema = z.object({
  id: z.uuid(),
  eventKey: z.string(),
  studentName: z.string().nullable(),
  toPhone: z.string().describe('Disamarkan, mis. 6281****678'),
  status: z.enum(STATUSES),
  detail: z.string().nullable(),
  attempts: z.number().int(),
  createdAt: z.iso.datetime({ offset: true }),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
});

const notFound = () => new HttpError(404, 'not_found', 'Pesan tidak ditemukan.');

/** Notifikasi WhatsApp ke wali murid: pengaturan, templat, sambungan, pesan uji, dan riwayat. Modul `messaging`. */
export async function messagingRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /* ---------- Pengaturan ---------- */

  app.get(
    '/v1/messaging/settings',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Pengaturan notifikasi',
        description:
          'Izin: `message:read`; modul `messaging`. Bila sekolah belum menyimpan pengaturan, nilai bawaan ' +
          '(mati) dikembalikan.',
        headers: schoolHeader,
        response: { 200: settingsSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [row] = await tx.select().from(msgSetting);
        return row
          ? {
              enabled: row.enabled,
              delayMinSeconds: row.delayMinSeconds,
              delayMaxSeconds: row.delayMaxSeconds,
              windowStart: row.windowStart,
              windowEnd: row.windowEnd,
              absentNoticeAt: row.absentNoticeAt,
            }
          : DEFAULT_SETTINGS;
      }),
  );

  app.put(
    '/v1/messaging/settings',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan notifikasi',
        description:
          'Izin: `message:manage`; modul `messaging`. `delayMaxSeconds` harus >= `delayMinSeconds` (400 ' +
          '`invalid_delay`) dan `windowStart` harus lebih awal dari `windowEnd` (400 `invalid_window`). Saat ' +
          '`enabled` pertama kali menjadi true dan sekolah belum punya templat sama sekali, seluruh templat bawaan ' +
          'dibuat dan diaktifkan.',
        headers: schoolHeader,
        body: settingsSchema,
        response: { 200: settingsSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      if (b.delayMaxSeconds < b.delayMinSeconds) {
        throw new HttpError(400, 'invalid_delay', 'Jeda maksimum tidak boleh lebih kecil dari jeda minimum.');
      }
      if (b.windowStart >= b.windowEnd) {
        throw new HttpError(400, 'invalid_window', 'Jam mulai kirim harus lebih awal dari jam akhir.');
      }
      return tenant(request, async (tx) => {
        await tx
          .insert(msgSetting)
          .values({ schoolId: ctx.schoolId, ...b })
          .onConflictDoUpdate({ target: msgSetting.schoolId, set: { ...b, updatedAt: new Date() } });
        if (b.enabled) {
          const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(msgTemplate);
          if (n === 0) {
            await tx.insert(msgTemplate).values(
              EVENT_KEYS.map((eventKey) => ({
                schoolId: ctx.schoolId,
                eventKey,
                body: DEFAULT_TEMPLATES[eventKey],
                enabled: true,
              })),
            );
          }
        }
        await audit(tx, ctx, 'messaging.settings', 'msg_setting', ctx.schoolId, b);
        return b;
      });
    },
  );

  /* ---------- Templat ---------- */

  type TemplateRow = typeof msgTemplate.$inferSelect;
  const templateView = (eventKey: EventKey, row: TemplateRow | undefined) => ({
    eventKey,
    body: row?.body ?? DEFAULT_TEMPLATES[eventKey],
    enabled: row?.enabled ?? false,
    isDefault: !row || row.body === DEFAULT_TEMPLATES[eventKey],
    defaultBody: DEFAULT_TEMPLATES[eventKey],
    placeholders: [...EVENT_PLACEHOLDERS[eventKey]],
  });

  app.get(
    '/v1/messaging/templates',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar templat pesan',
        description:
          'Izin: `message:read`; modul `messaging`. Satu entri per peristiwa (`arrival`, `departure`, `absent`, ' +
          '`skipped_class`, `payment`, `overdue`, `report_card`). Peristiwa tanpa templat milik sekolah memakai isi ' +
          'bawaan dan berstatus mati (`enabled` false, `isDefault` true).',
        headers: schoolHeader,
        response: { 200: z.array(templateSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const rows = await tx.select().from(msgTemplate);
        return EVENT_KEYS.map((key) =>
          templateView(
            key,
            rows.find((r) => r.eventKey === key),
          ),
        );
      }),
  );

  app.put(
    '/v1/messaging/templates',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Simpan templat pesan satu peristiwa',
        description:
          'Izin: `message:manage`; modul `messaging`. `body` 1..1000 karakter. Pengganti `{{nama}}` yang tidak ' +
          'dikenal untuk peristiwa itu ditolak: 400 `invalid_placeholder`.',
        headers: schoolHeader,
        body: z.object({
          eventKey: eventKeySchema,
          body: z.string().trim().min(1).max(1000),
          enabled: z.boolean(),
        }),
        response: { 200: templateSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const unknown = unknownPlaceholders(b.eventKey, b.body);
      if (unknown.length > 0) {
        throw new HttpError(
          400,
          'invalid_placeholder',
          `Pengganti tidak dikenal untuk peristiwa ini: ${unknown.map((u) => `{{${u}}}`).join(', ')}.`,
        );
      }
      return tenant(request, async (tx) => {
        const [row] = await tx
          .insert(msgTemplate)
          .values({ schoolId: ctx.schoolId, ...b })
          .onConflictDoUpdate({
            target: [msgTemplate.schoolId, msgTemplate.eventKey],
            set: { body: b.body, enabled: b.enabled, updatedAt: new Date() },
          })
          .returning();
        await audit(tx, ctx, 'messaging.template', 'msg_template', b.eventKey, { enabled: b.enabled });
        return templateView(b.eventKey, row);
      });
    },
  );

  app.post(
    '/v1/messaging/templates/:eventKey/reset',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kembalikan templat ke bawaan',
        description:
          'Izin: `message:manage`; modul `messaging`. Isi templat diganti templat bawaan; status `enabled` tidak ' +
          'berubah, dan peristiwa yang belum punya templat milik sekolah tetap mati.',
        headers: schoolHeader,
        params: z.object({ eventKey: eventKeySchema }),
        response: { 200: templateSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { eventKey } = request.params;
      return tenant(request, async (tx) => {
        const [row] = await tx
          .update(msgTemplate)
          .set({ body: DEFAULT_TEMPLATES[eventKey], updatedAt: new Date() })
          .where(and(eq(msgTemplate.schoolId, ctx.schoolId), eq(msgTemplate.eventKey, eventKey)))
          .returning();
        if (row) await audit(tx, ctx, 'messaging.template_reset', 'msg_template', eventKey);
        return templateView(eventKey, row);
      });
    },
  );

  /* ---------- Sambungan WhatsApp ---------- */

  const accountView = async (tx: Tx) => {
    const [row] = await tx.select().from(waAccount);
    const platform = await loadPlatformMessaging(app.platformDb);
    return {
      desiredState: row?.desiredState ?? ('off' as const),
      status: row?.status ?? ('disconnected' as const),
      qr: row?.qr ?? null,
      phone: row?.phone ?? null,
      lastError: row?.lastError ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      providerActive: providerActive(env, platform),
      provider: !platform.enabled
        ? ('disabled' as const)
        : effectiveProvider(env, platform) === 'log'
          ? ('log' as const)
          : ('whatsapp' as const),
    };
  };

  app.get(
    '/v1/messaging/account',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Status sambungan WhatsApp',
        description:
          'Izin: `message:read`; modul `messaging`. `status` ditulis worker (`disconnected`, `connecting`, `qr`, ' +
          '`ready`, `failed`); `qr` terisi hanya saat `qr` untuk dipindai dari ponsel. `providerActive` false ' +
          'berarti saklar global platform mati atau penyedia pesan sedang mode log, sehingga WhatsApp tidak tersambung.',
        headers: schoolHeader,
        response: { 200: accountSchema, ...guarded },
      },
    },
    async (request) => tenant(request, accountView),
  );

  const setDesired =
    (desiredState: 'on' | 'off') => async (request: { ctx?: TenantContext; server: FastifyInstance }) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        await tx
          .insert(waAccount)
          .values({ schoolId: ctx.schoolId, desiredState })
          .onConflictDoUpdate({
            target: waAccount.schoolId,
            set: { desiredState, ...(desiredState === 'off' ? { qr: null } : {}), updatedAt: new Date() },
          });
        await audit(
          tx,
          ctx,
          `messaging.${desiredState === 'on' ? 'connect' : 'disconnect'}`,
          'wa_account',
          ctx.schoolId,
        );
        return accountView(tx);
      });
    };

  app.post(
    '/v1/messaging/account/connect',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Sambungkan WhatsApp',
        description:
          'Izin: `message:manage`; modul `messaging`. Menyetel `desiredState` menjadi `on`; worker lalu menyiapkan ' +
          'QR yang tampil di `GET /v1/messaging/account`. Status tidak diubah oleh API.',
        headers: schoolHeader,
        response: { 200: accountSchema, ...guarded },
      },
    },
    setDesired('on'),
  );

  app.post(
    '/v1/messaging/account/disconnect',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Putuskan WhatsApp',
        description:
          'Izin: `message:manage`; modul `messaging`. Menyetel `desiredState` menjadi `off` dan mengosongkan QR. ' +
          'Status tidak diubah oleh API; worker yang menutup sambungan.',
        headers: schoolHeader,
        response: { 200: accountSchema, ...guarded },
      },
    },
    setDesired('off'),
  );

  /* ---------- Pesan uji ---------- */

  app.post(
    '/v1/messaging/test',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kirim pesan uji',
        description:
          'Izin: `message:manage`; modul `messaging`. Memasukkan satu pesan (peristiwa `test`) ke antrean untuk ' +
          'nomor itu. Nomor tidak valid: 400 `invalid_phone`. Pesan tetap menunggu worker dan sambungan WhatsApp.',
        headers: schoolHeader,
        body: z.object({ phone: z.string().trim().min(1).max(30), text: z.string().trim().min(1).max(500) }),
        response: { 200: z.object({ queued: z.literal(true) }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const phone = normalizePhone(request.body.phone);
      if (!phone) throw new HttpError(400, 'invalid_phone', 'Nomor telepon tidak valid.');
      await tenant(request, async (tx) => {
        await enqueueRaw(tx, {
          schoolId: ctx.schoolId,
          eventKey: 'test',
          toPhone: phone,
          body: request.body.text,
        });
        await audit(tx, ctx, 'messaging.test', 'msg_message', phone.slice(-3));
      });
      return { queued: true as const };
    },
  );

  /* ---------- Riwayat ---------- */

  app.get(
    '/v1/messaging/messages',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Riwayat pesan',
        description:
          'Izin: `message:read`; modul `messaging`. Terbaru dulu. Nomor tujuan disamarkan. `counts` menghitung ' +
          'seluruh pesan yang cocok dengan `eventKey`/`studentId` (tanpa menyaring `status`); status `sending` ' +
          'dihitung sebagai `queued`.',
        headers: schoolHeader,
        querystring: z.object({
          status: z.enum(STATUSES).optional(),
          eventKey: z.string().trim().min(1).max(30).optional(),
          studentId: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            items: z.array(messageItemSchema),
            total: z.number().int(),
            counts: z.object({
              queued: z.number().int(),
              sent: z.number().int(),
              failed: z.number().int(),
              skipped: z.number().int(),
            }),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const q = request.query;
      return tenant(request, async (tx) => {
        const base = [
          q.eventKey ? eq(msgMessage.eventKey, q.eventKey) : undefined,
          q.studentId ? eq(msgMessage.studentId, q.studentId) : undefined,
        ];
        const filter = and(...base, q.status ? eq(msgMessage.status, q.status) : undefined);
        const [totalRow] = await tx.select({ n: count() }).from(msgMessage).where(filter);
        const rows = await tx
          .select({
            id: msgMessage.id,
            eventKey: msgMessage.eventKey,
            studentName: student.name,
            toPhone: msgMessage.toPhone,
            status: msgMessage.status,
            detail: msgMessage.detail,
            attempts: msgMessage.attempts,
            createdAt: msgMessage.createdAt,
            sentAt: msgMessage.sentAt,
          })
          .from(msgMessage)
          .leftJoin(student, eq(student.id, msgMessage.studentId))
          .where(filter)
          .orderBy(desc(msgMessage.createdAt), desc(msgMessage.id))
          .limit(q.limit)
          .offset(q.offset);
        const grouped = await tx
          .select({ status: msgMessage.status, n: count() })
          .from(msgMessage)
          .where(and(...base))
          .groupBy(msgMessage.status);
        const n = (...s: (typeof STATUSES)[number][]) =>
          grouped.filter((g) => s.includes(g.status)).reduce((a, g) => a + g.n, 0);
        return {
          items: rows.map((r) => ({
            ...r,
            toPhone: maskPhone(r.toPhone),
            createdAt: r.createdAt.toISOString(),
            sentAt: r.sentAt?.toISOString() ?? null,
          })),
          total: totalRow?.n ?? 0,
          counts: {
            queued: n('queued', 'sending'),
            sent: n('sent'),
            failed: n('failed'),
            skipped: n('skipped'),
          },
        };
      });
    },
  );

  app.post(
    '/v1/messaging/messages/:id/retry',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Kirim ulang pesan',
        description:
          'Izin: `message:manage`; modul `messaging`. Hanya pesan `failed` atau `skipped`; dikembalikan ke ' +
          '`queued` dengan percobaan 0. Selain itu 409 `not_retryable`; pesan tidak ada: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [row] = await tx.select().from(msgMessage).where(eq(msgMessage.id, request.params.id));
        if (!row) throw notFound();
        if (row.status !== 'failed' && row.status !== 'skipped') {
          throw new HttpError(
            409,
            'not_retryable',
            'Hanya pesan gagal atau dilewati yang bisa dikirim ulang.',
          );
        }
        await tx
          .update(msgMessage)
          .set({ status: 'queued', attempts: 0, detail: null, notBefore: sql`now()` })
          .where(and(eq(msgMessage.id, row.id), inArray(msgMessage.status, ['failed', 'skipped'])));
        await audit(tx, ctx, 'messaging.retry', 'msg_message', row.id);
        return { ok: true as const };
      });
    },
  );
}
