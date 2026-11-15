import {
  announcementBroadcastText,
  BATCH_CONFIRM_THRESHOLD,
  broadcastDelay,
  broadcastStaffMode,
  type RecipientSelection,
} from '@edusync/contracts';
import {
  announcement,
  BatchError,
  count,
  enqueueBatch,
  eq,
  loadSendLimits,
  msgAttachment,
  msgBatch,
  msgMessage,
  msgSetting,
  resolveRecipients,
  school,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { maskPhone } from '../messaging-lib';
import { audit, guarded, idParams, isUniqueViolation, schoolHeader } from './helpers';
import { batchErrorStatus, countsSchema, excludedSchema } from './messaging-batches';

const tags = ['Announcements'];
const gate = [
  requirePermission('announcement:manage', 'message:broadcast'),
  requireModule('announcements'),
  requireModule('messaging'),
];
const statusGate = [
  requirePermission('announcement:read', 'message:read'),
  requireModule('announcements'),
  requireModule('messaging'),
];

const targetBody = z.object({
  includeStaff: z
    .boolean()
    .optional()
    .describe('Ikut kirim ke staf aktif; hanya untuk audiens `all`/`public` (bawaan: wali saja)'),
  classes: z.array(z.uuid()).max(500).optional().describe('Persempit wali ke rombel ini'),
  gradeLevels: z
    .array(z.string().trim().min(1).max(30))
    .max(500)
    .optional()
    .describe('Persempit wali ke tingkat ini'),
  attachmentId: z.uuid().optional(),
});

/** Wali dan/atau staf sasaran siaran menurut audiens pengumuman (rancangan §1C.3), dipersempit bila diminta. */
function selectionFor(
  audience: 'public' | 'portal' | 'staff' | 'all',
  t: {
    includeStaff?: boolean | undefined;
    classes?: string[] | undefined;
    gradeLevels?: string[] | undefined;
  },
): RecipientSelection {
  const staff = broadcastStaffMode(audience);
  const narrowed = Boolean(t.classes?.length || t.gradeLevels?.length);
  if (t.includeStaff && staff === 'none') {
    throw new HttpError(400, 'broadcast_target', 'Pengumuman untuk portal hanya disiarkan ke wali.');
  }
  if (staff === 'forced') {
    if (narrowed) {
      throw new HttpError(
        400,
        'broadcast_target',
        'Pengumuman untuk staf tidak bisa dipersempit per rombel/tingkat.',
      );
    }
    return { allStaff: true };
  }
  const selection: RecipientSelection = narrowed
    ? { classes: t.classes, gradeLevels: t.gradeLevels, guardianScope: 'primary' }
    : { wholeSchool: true, guardianScope: 'primary' };
  if (staff === 'optional' && t.includeStaff) selection.allStaff = true;
  return selection;
}

/** Siaran pengumuman lewat WhatsApp (tahap C): terpisah dari penerbitan, galatnya tak pernah memengaruhi pengumuman. */
export async function announcementBroadcastRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const liveAnnouncement = async (tx: Tx, id: string) => {
    const [a] = await tx.select().from(announcement).where(eq(announcement.id, id));
    if (!a) throw new HttpError(404, 'not_found', 'Pengumuman tidak ditemukan.');
    if (a.status !== 'published') {
      throw new HttpError(409, 'not_published', 'Hanya pengumuman yang sudah terbit yang bisa disiarkan.');
    }
    if (a.expiresAt && a.expiresAt <= new Date()) {
      throw new HttpError(409, 'announcement_expired', 'Pengumuman sudah kedaluwarsa.');
    }
    return a;
  };
  const existingBatch = async (tx: Tx, announcementId: string) => {
    const [b] = await tx.select().from(msgBatch).where(eq(msgBatch.announcementId, announcementId));
    return b;
  };

  app.post(
    '/v1/announcements/:id/broadcast/preview',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Pratinjau siaran pengumuman lewat WhatsApp',
        description:
          'Izin: `announcement:manage` dan `message:broadcast`; modul `announcements` dan `messaging`. Tanpa efek. ' +
          'Pengumuman harus terbit dan belum kedaluwarsa (409 `not_published`, `announcement_expired`). Sasaran mengikuti ' +
          '`audience`: `portal` = wali, `staff` = staf, `all`/`public` = wali (staf bila `includeStaff`); murid tidak ' +
          'pernah jadi sasaran. Wali dipersempit dengan `classes`/`gradeLevels`. Nomor dinormalisasi, digabung per ' +
          'nomor, dan yang di daftar tolak siaran dilewati (`excluded.optedOut`). `message` = isi yang dikirim ' +
          '(`*judul*` + isi sebagai teks polos, dipotong 1.000 karakter dengan rujukan ke portal; `truncated`). ' +
          '`existingBatchId` terisi bila pengumuman sudah pernah disiarkan (paling banyak satu siaran per pengumuman).',
        headers: schoolHeader,
        params: idParams,
        body: targetBody.omit({ attachmentId: true }),
        response: {
          200: z.object({
            total: z.number().int(),
            excluded: excludedSchema,
            sample: z.array(
              z.object({
                name: z.string(),
                phone: z.string().describe('Disamarkan'),
                recipientType: z.enum(['guardian', 'teacher']),
              }),
            ),
            message: z.string(),
            truncated: z.boolean(),
            audience: z.enum(['public', 'portal', 'staff', 'all']),
            staffMode: z.enum(['forced', 'optional', 'none']),
            existingBatchId: z.uuid().nullable(),
            dailyLimit: z.number().int(),
            dailyUsed: z.number().int(),
            dailyRemaining: z.number().int(),
            newNumber: z.boolean(),
            queueRemaining: z.number().int(),
            accountReady: z.boolean(),
            enabled: z.boolean(),
            confirmTyping: z.boolean().describe('Pengguna wajib mengetik jumlah penerima untuk konfirmasi'),
            avgDelaySeconds: z.number().describe('Rata-rata jeda antar pesan siaran, untuk perkiraan durasi'),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const a = await liveAnnouncement(tx, request.params.id);
        const selection = selectionFor(a.audience, request.body);
        const limits = await loadSendLimits(tx, ctx.schoolId);
        const { recipients, excluded } = await resolveRecipients(tx, ctx.schoolId, selection, {
          dropOptedOut: true,
        });
        const [setting] = await tx.select().from(msgSetting);
        const delay = broadcastDelay(setting?.delayMinSeconds ?? 5, setting?.delayMaxSeconds ?? 15);
        const { text, truncated } = announcementBroadcastText(a.title, a.body);
        return {
          total: recipients.length,
          excluded,
          sample: recipients.slice(0, 10).map((r) => ({
            name: r.name,
            phone: maskPhone(r.phone),
            recipientType: r.kind,
          })),
          message: text,
          truncated,
          audience: a.audience,
          staffMode: broadcastStaffMode(a.audience),
          existingBatchId: (await existingBatch(tx, a.id))?.id ?? null,
          dailyLimit: limits.limit,
          dailyUsed: limits.used,
          dailyRemaining: limits.remaining,
          newNumber: limits.newNumber,
          queueRemaining: limits.queueRemaining,
          accountReady: limits.accountReady,
          enabled: limits.enabled,
          confirmTyping: recipients.length > BATCH_CONFIRM_THRESHOLD,
          avgDelaySeconds: (delay.min + delay.max) / 2,
        };
      });
    },
  );

  app.post(
    '/v1/announcements/:id/broadcast',
    {
      onRequest: gate,
      schema: {
        tags,
        summary: 'Siarkan pengumuman lewat WhatsApp',
        description:
          'Izin: `announcement:manage` dan `message:broadcast`; modul `announcements` dan `messaging`. Terpisah dari ' +
          '`publish`: penerbitan tidak pernah bergantung pada WhatsApp. Pengumuman harus terbit dan belum kedaluwarsa ' +
          '(409 `not_published`, `announcement_expired`); paling banyak satu siaran per pengumuman (409 ' +
          '`already_broadcast`, termasuk yang sudah dibatalkan). Sasaran, isi, dan pengurangan nomor sama dengan ' +
          '`/broadcast/preview`; `expectedTotal` = jumlah penerima dari pratinjau (409 `count_changed` bila berubah). ' +
          'Satu pesan per nomor masuk antrean prioritas 2 (setelah pesan peristiwa dan pesan langsung) dengan jeda ' +
          'minimal 10 detik, jendela kirim, dan batas harian sekolah; `attachmentId` (opsional, ' +
          '`POST /v1/messaging/attachments`) ikut sebagai lampiran dengan isi sebagai caption. Galat lain: 400 ' +
          '`broadcast_target`, `no_recipients`, `sensitive_content` (deret 16 digit), `attachment_invalid`; 409 ' +
          '`messaging_disabled`, `daily_limit`, `queue_full`. Pengumuman ditarik ke draf atau dihapus: pesan siaran ' +
          'yang masih antre dibatalkan (`skipped`/`cancelled`).',
        headers: schoolHeader,
        params: idParams,
        body: targetBody.extend({ expectedTotal: z.number().int().min(0).max(100_000) }),
        response: {
          200: z.object({ id: z.uuid(), total: z.number().int(), excluded: excludedSchema }),
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
      try {
        return await tenant(request, async (tx) => {
          const a = await liveAnnouncement(tx, request.params.id);
          if (await existingBatch(tx, a.id)) {
            throw new HttpError(409, 'already_broadcast', 'Pengumuman ini sudah pernah disiarkan.');
          }
          const selection = selectionFor(a.audience, b);
          if (b.attachmentId) {
            const [f] = await tx
              .select({ purgedAt: msgAttachment.purgedAt })
              .from(msgAttachment)
              .where(eq(msgAttachment.id, b.attachmentId));
            if (!f || f.purgedAt) {
              throw new HttpError(
                400,
                'attachment_invalid',
                'Lampiran tidak ditemukan atau sudah kedaluwarsa.',
              );
            }
          }
          const [sch] = await tx
            .select({ name: school.name })
            .from(school)
            .where(eq(school.id, ctx.schoolId));
          const r = await enqueueBatch(tx, {
            schoolId: ctx.schoolId,
            kind: 'broadcast',
            title: a.title.slice(0, 120),
            body: announcementBroadcastText(a.title, a.body).text,
            plain: true,
            announcementId: a.id,
            selection,
            createdBy: ctx.userId,
            expectedTotal: b.expectedTotal,
            schoolName: sch?.name ?? '',
            attachmentId: b.attachmentId ?? null,
          });
          await audit(tx, ctx, 'announcement.broadcast', 'announcement', a.id, {
            batchId: r.batchId,
            total: r.total,
            attachment: Boolean(b.attachmentId),
          });
          return { id: r.batchId, total: r.total, excluded: r.excluded };
        });
      } catch (error) {
        if (error instanceof BatchError) {
          const extra = Object.values(error.extra)[0];
          throw new HttpError(
            batchErrorStatus[error.code],
            error.code,
            extra === undefined ? error.message : `${error.message} (${extra})`,
          );
        }
        // Dua permintaan bersamaan: yang kedua menabrak indeks unik satu-siaran-per-pengumuman.
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'already_broadcast', 'Pengumuman ini sudah pernah disiarkan.');
        }
        throw error;
      }
    },
  );

  app.get(
    '/v1/announcements/:id/broadcast',
    {
      onRequest: statusGate,
      schema: {
        tags,
        summary: 'Status siaran WhatsApp sebuah pengumuman',
        description:
          'Izin: `announcement:read` dan `message:read`; modul `announcements` dan `messaging`. `batch` null bila ' +
          'pengumuman belum pernah disiarkan. `counts` per status pesan (`sending` dihitung `queued`); `status` ' +
          'dihitung: `sending` bila masih ada pesan antre/dikirim, selain itu `done`. Rincian per penerima ada di ' +
          '`GET /v1/messaging/batches/{id}`. 404 `not_found` bila pengumuman tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({
            batch: z
              .object({
                id: z.uuid(),
                createdAt: z.iso.datetime({ offset: true }),
                recipientCount: z.number().int(),
                excluded: excludedSchema,
                counts: countsSchema,
                status: z.enum(['sending', 'done']),
                cancelledAt: z.iso.datetime({ offset: true }).nullable(),
                attachment: z.boolean(),
              })
              .nullable(),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [a] = await tx
          .select({ id: announcement.id })
          .from(announcement)
          .where(eq(announcement.id, request.params.id));
        if (!a) throw new HttpError(404, 'not_found', 'Pengumuman tidak ditemukan.');
        const b = await existingBatch(tx, a.id);
        if (!b) return { batch: null };
        const grouped = await tx
          .select({ status: msgMessage.status, n: count() })
          .from(msgMessage)
          .where(eq(msgMessage.batchId, b.id))
          .groupBy(msgMessage.status);
        const n = (...s: string[]) =>
          grouped.filter((g) => s.includes(g.status)).reduce((x, g) => x + g.n, 0);
        const counts = {
          queued: n('queued', 'sending'),
          sent: n('sent'),
          failed: n('failed'),
          skipped: n('skipped'),
        };
        return {
          batch: {
            id: b.id,
            createdAt: b.createdAt.toISOString(),
            recipientCount: b.recipientCount,
            excluded: b.excluded,
            counts,
            status: counts.queued > 0 ? ('sending' as const) : ('done' as const),
            cancelledAt: b.cancelledAt?.toISOString() ?? null,
            attachment: b.attachmentId !== null,
          },
        };
      }),
  );
}
