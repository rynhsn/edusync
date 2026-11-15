import { createHash } from 'node:crypto';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentUploadSchema,
  BATCH_CONFIRM_THRESHOLD,
  DIRECT_BODY_MAX,
  DIRECT_TEMPLATE_NAME_MAX,
  DIRECT_TITLE_MAX,
  detectAttachmentMime,
  directBodyIssue,
  formatDateId,
  localParts,
  normalizePhone,
  recipientSelectionSchema,
  renderDirect,
  safeAttachmentName,
  selectionIsBroad,
  selectionIsEmpty,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  BatchError,
  classRoom,
  count,
  desc,
  enqueueBatch,
  enrollment,
  eq,
  gte,
  guardian,
  ilike,
  inArray,
  isNull,
  loadSendLimits,
  msgAttachment,
  msgBatch,
  msgDirectTemplate,
  msgMessage,
  msgOptOut,
  msgSetting,
  notInArray,
  or,
  type ResolvedRecipient,
  resolveRecipients,
  school,
  sql,
  student,
  type Tx,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { maskPhone } from '../messaging-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Messaging'];
const MODULE = 'messaging';
const readGate = [requirePermission('message:read'), requireModule(MODULE)];
const manageGate = [requirePermission('message:manage'), requireModule(MODULE)];
const sendGate = [requirePermission('message:send'), requireModule(MODULE)];

export const excludedSchema = z.object({
  noPhone: z.number().int().describe('Wali/staf tanpa nomor'),
  invalid: z.number().int().describe('Nomor tidak valid'),
  duplicate: z.number().int().describe('Nomor ganda (mis. wali dua anak) digabung jadi satu pesan'),
  optedOut: z.number().int().describe('Menolak siaran, dibuang dari siaran (selalu 0 untuk pesan langsung)'),
});
export const countsSchema = z.object({
  queued: z.number().int().describe('Termasuk `sending`'),
  sent: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
});
export const attachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  size: z.number().int().describe('Byte'),
  purged: z.boolean().describe('Isi berkas sudah dihapus (kedaluwarsa); metadata tetap'),
});
const batchSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['direct', 'broadcast']),
  title: z.string(),
  createdBy: z.string().nullable().describe('Nama pengirim; null bila akunnya sudah dihapus'),
  createdAt: z.iso.datetime({ offset: true }),
  recipientCount: z.number().int(),
  excluded: excludedSchema,
  counts: countsSchema,
  status: z.enum(['sending', 'done']).describe('Dihitung: `sending` bila masih ada pesan antre/dikirim'),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  attachment: attachmentSchema.nullable().describe('Lampiran batch; null = teks saja'),
});
const templateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  body: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const templateBody = z.object({
  name: z.string().trim().min(1).max(DIRECT_TEMPLATE_NAME_MAX),
  body: z.string().trim().min(1).max(DIRECT_BODY_MAX),
});
const bodyText = z.string().trim().min(1).max(DIRECT_BODY_MAX);

/** `failed` dengan detail ini tidak berguna diulang: nomor memang bukan WhatsApp, atau lampiran sudah kedaluwarsa. */
const NOT_RETRYABLE = ['not_on_whatsapp', 'attachment_expired', 'opted_out'];

export const batchErrorStatus: Record<BatchError['code'], number> = {
  unknown_placeholder: 400,
  sensitive_content: 400,
  no_recipients: 400,
  count_changed: 409,
  messaging_disabled: 409,
  daily_limit: 409,
  queue_full: 409,
};

/** Dekode base64 unggahan lampiran dan periksa ukurannya (400 `invalid_base64` / `attachment_too_large`). */
export function decodeAttachment(dataBase64: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
    throw new HttpError(400, 'invalid_base64', 'Isi berkas bukan base64 yang valid.');
  }
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    throw new HttpError(400, 'attachment_too_large', 'Lampiran maksimal 2 MB.');
  }
  return bytes;
}

/** Simpan lampiran milik sekolah (jenis sudah diperiksa pemanggil) dan catat audit; `extra` ikut ke audit. */
export async function storeAttachment(
  tx: Tx,
  ctx: TenantContext,
  fileName: string,
  mime: z.infer<typeof attachmentSchema>['mime'],
  bytes: Buffer,
  extra: Record<string, unknown> = {},
) {
  const name = safeAttachmentName(fileName);
  const [row] = await tx
    .insert(msgAttachment)
    .values({
      schoolId: ctx.schoolId,
      fileName: name,
      mime,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      data: bytes,
      createdBy: ctx.userId,
    })
    .returning({ id: msgAttachment.id });
  const id = (row as { id: string }).id;
  await audit(tx, ctx, 'messaging.attachment.upload', 'msg_attachment', id, {
    mime,
    size: bytes.length,
    ...extra,
  });
  return { id, fileName: name, mime, size: bytes.length, purged: false };
}

function bodyIssue(body: string) {
  const issue = directBodyIssue(body);
  if (!issue) return;
  throw new HttpError(
    400,
    issue.code,
    issue.code === 'unknown_placeholder'
      ? `Pengganti tidak dikenal: ${issue.detail}.`
      : 'Isi pesan memuat deret 16 digit (mirip NIK). Hapus data pribadi dari pesan.',
  );
}

/** Pesan langsung dan siaran ke wali/staf terpilih: pratinjau, batch, riwayat, dan templat. Modul `messaging`. */
export async function messagingBatchRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  const schoolInfo = async (tx: Tx, schoolId: string) => {
    const [s] = await tx.select({ name: school.name }).from(school).where(eq(school.id, schoolId));
    return s?.name ?? '';
  };
  const renderOne = (body: string, r: ResolvedRecipient, ctx: { school: string; date: string }) =>
    renderDirect(
      body,
      {
        guardianName: r.kind === 'guardian' ? r.name : null,
        teacherName: r.kind === 'teacher' ? r.name : null,
        studentNames: r.studentNames,
        classNames: r.classNames,
      },
      ctx,
    );

  /* ---------- Pencarian penerima ---------- */

  app.get(
    '/v1/messaging/recipients/search',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Cari penerima pesan langsung',
        description:
          'Izin: `message:send`; modul `messaging`. Pencarian untuk pemilih penerima: `kind` = `student` (murid aktif ' +
          'terdaftar di tahun ajaran aktif), `class` (rombel tahun ajaran aktif), `guardian` (wali; `q` minimal 2 ' +
          'karakter), atau `teacher` (staf aktif). Maksimal 20 hasil, urut nama. `hint` = rombel atau nomor disamarkan.',
        headers: schoolHeader,
        querystring: z.object({
          kind: z.enum(['student', 'class', 'guardian', 'teacher']),
          q: z.string().trim().max(80).default(''),
        }),
        response: {
          200: z.array(z.object({ id: z.uuid(), label: z.string(), hint: z.string().nullable() })),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { kind, q } = request.query;
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      return tenant(request, async (tx) => {
        const [year] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.isActive, true));
        if (kind === 'student') {
          if (!year) return [];
          const rows = await tx
            .select({ id: student.id, label: student.name, hint: classRoom.name })
            .from(student)
            .innerJoin(
              enrollment,
              and(eq(enrollment.studentId, student.id), eq(enrollment.academicYearId, year.id)),
            )
            .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
            .where(
              and(
                eq(student.status, 'active'),
                isNull(student.deletedAt),
                q ? or(ilike(student.name, like), ilike(student.nis, like)) : undefined,
              ),
            )
            .orderBy(asc(student.name), asc(student.id))
            .limit(20);
          return rows;
        }
        if (kind === 'class') {
          if (!year) return [];
          return tx
            .select({ id: classRoom.id, label: classRoom.name, hint: classRoom.level })
            .from(classRoom)
            .where(and(eq(classRoom.academicYearId, year.id), q ? ilike(classRoom.name, like) : undefined))
            .orderBy(asc(classRoom.name), asc(classRoom.id))
            .limit(20);
        }
        const phoneHint = (p: string | null) => (p ? maskPhone(p.replace(/\D/g, '') || p) : null);
        if (kind === 'guardian') {
          if (q.length < 2) return [];
          const rows = await tx
            .select({ id: guardian.id, label: guardian.name, phone: guardian.phone })
            .from(guardian)
            .where(or(ilike(guardian.name, like), ilike(guardian.phone, like)))
            .orderBy(asc(guardian.name), asc(guardian.id))
            .limit(20);
          return rows.map((r) => ({ id: r.id, label: r.label, hint: phoneHint(r.phone) }));
        }
        const rows = await tx
          .select({ id: teacher.id, label: teacher.name, phone: teacher.phone })
          .from(teacher)
          .where(and(eq(teacher.status, 'active'), q ? ilike(teacher.name, like) : undefined))
          .orderBy(asc(teacher.name), asc(teacher.id))
          .limit(20);
        return rows.map((r) => ({ id: r.id, label: r.label, hint: phoneHint(r.phone) }));
      });
    },
  );

  /* ---------- Pratinjau ---------- */

  app.post(
    '/v1/messaging/recipients/preview',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Pratinjau penerima pesan langsung',
        description:
          'Izin: `message:send`; modul `messaging`. Tanpa efek: tidak membuat pesan. `selection` memilih ' +
          '`students`/`classes`/`gradeLevels`/`wholeSchool` (menuju wali; `guardianScope` `primary` = wali utama, jatuh ke ' +
          'wali lain bila tidak bernomor, `all` = semua wali), `guardians`, `teachers`, `allStaff` (maks 500 id per ' +
          'larik). Murid/rombel hanya yang aktif dan terdaftar di tahun ajaran aktif; staf hanya guru aktif. Nomor ' +
          'dinormalisasi dan digabung per nomor. `body` (opsional) dirender untuk `sample` (maks 10 penerima, nomor ' +
          'disamarkan); pengganti tidak dikenal 400 `unknown_placeholder`, deret 16 digit 400 `sensitive_content`. ' +
          '`requiresBroadcast` true bila pemilih luas (rombel/tingkat/seluruh sekolah/semua staf) atau penerima > ' +
          `${BATCH_CONFIRM_THRESHOLD}; \`canSend\` false bila pemanggil belum punya \`message:broadcast\`. ` +
          '`enabled` false bila saklar sekolah/platform mati (pembuatan batch 409 `messaging_disabled`). ' +
          '`dailyRemaining` sisa batas harian (nomor yang belum 7 hari dipakai: maks 50). `optedOutWarning` = jumlah ' +
          'penerima yang nomornya di daftar tolak siaran: hanya peringatan, pesan langsung tetap terkirim.',
        headers: schoolHeader,
        body: z.object({
          selection: recipientSelectionSchema,
          kind: z.literal('direct').default('direct'),
          body: bodyText.optional(),
        }),
        response: {
          200: z.object({
            total: z.number().int(),
            excluded: excludedSchema,
            sample: z.array(
              z.object({
                name: z.string(),
                phone: z.string().describe('Disamarkan'),
                recipientType: z.enum(['guardian', 'teacher']),
                message: z.string().nullable().describe('Isi untuk penerima ini bila `body` dikirim'),
              }),
            ),
            dailyLimit: z.number().int(),
            dailyUsed: z.number().int(),
            dailyRemaining: z.number().int(),
            newNumber: z.boolean(),
            queueRemaining: z.number().int(),
            accountReady: z.boolean(),
            enabled: z.boolean(),
            optedOutWarning: z
              .number()
              .int()
              .describe('Penerima yang menolak siaran: hanya peringatan, pesan langsung tetap boleh dikirim'),
            requiresBroadcast: z.boolean(),
            canSend: z.boolean(),
            confirmTyping: z.boolean().describe('Pengguna wajib mengetik jumlah penerima untuk konfirmasi'),
            avgDelaySeconds: z
              .number()
              .describe('Rata-rata jeda antar pesan sekolah, untuk perkiraan durasi'),
          }),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { selection, body } = request.body;
      if (body) bodyIssue(body);
      return tenant(request, async (tx) => {
        const limits = await loadSendLimits(tx, ctx.schoolId);
        const { recipients, excluded, optedOutWarning } = await resolveRecipients(
          tx,
          ctx.schoolId,
          selection,
        );
        const total = recipients.length;
        const render = body
          ? {
              school: await schoolInfo(tx, ctx.schoolId),
              date: formatDateId(localParts(new Date(), limits.timezone).date),
            }
          : null;
        const requiresBroadcast = selectionIsBroad(selection) || total > BATCH_CONFIRM_THRESHOLD;
        const [setting] = await tx.select().from(msgSetting);
        return {
          total,
          excluded,
          sample: recipients.slice(0, 10).map((r) => ({
            name: r.name,
            phone: maskPhone(r.phone),
            recipientType: r.kind,
            message: render ? renderOne(body as string, r, render) : null,
          })),
          dailyLimit: limits.limit,
          dailyUsed: limits.used,
          dailyRemaining: limits.remaining,
          newNumber: limits.newNumber,
          queueRemaining: limits.queueRemaining,
          accountReady: limits.accountReady,
          enabled: limits.enabled,
          optedOutWarning,
          requiresBroadcast,
          canSend: !requiresBroadcast || ctx.permissions.has('message:broadcast'),
          confirmTyping: total > BATCH_CONFIRM_THRESHOLD,
          avgDelaySeconds: setting ? (setting.delayMinSeconds + setting.delayMaxSeconds) / 2 : 10,
        };
      });
    },
  );

  /* ---------- Buat batch ---------- */

  app.post(
    '/v1/messaging/batches',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Kirim pesan langsung (buat batch)',
        description:
          'Izin: `message:send`; pemilih luas (rombel/tingkat/seluruh sekolah/semua staf) atau lebih dari ' +
          `${BATCH_CONFIRM_THRESHOLD} penerima juga butuh \`message:broadcast\` (403). Modul \`messaging\`. Satu pesan per ` +
          'nomor unik masuk antrean yang sama dengan pesan otomatis (prioritas 1: sesudah pesan peristiwa, sebelum ' +
          'siaran), dengan jeda acak, jendela kirim, dan header/footer sekolah yang sama. `expectedTotal` = jumlah ' +
          'penerima dari pratinjau; hasil resolusi berbeda: 409 `count_changed`. Semua atau tidak sama sekali. Galat: ' +
          '400 `unknown_placeholder`, `sensitive_content`, `no_recipients`; 409 `messaging_disabled`, `daily_limit`, ' +
          '`queue_full` (100 slot antrean dicadangkan untuk pesan peristiwa), `duplicate_batch` (isi, lampiran, dan ' +
          'penerima yang sama dikirim pengguna yang sama dalam 30 detik terakhir). `attachmentId` (opsional) = ' +
          'lampiran dari `POST /v1/messaging/attachments` yang dikirim ke tiap penerima dengan isi pesan sebagai ' +
          'caption (header/footer sekolah ikut); lampiran tidak ada atau isinya sudah dihapus: 400 `attachment_invalid`. Pengganti: `{{guardian}}`, `{{student}}`, ' +
          '`{{class}}`, `{{school}}`, `{{date}}`, `{{teacher}}`. `title` = subjek internal (bawaan: awal isi pesan).',
        headers: schoolHeader,
        body: z.object({
          selection: recipientSelectionSchema,
          body: bodyText,
          title: z.string().trim().min(1).max(DIRECT_TITLE_MAX).optional(),
          expectedTotal: z.number().int().min(0).max(100_000),
          attachmentId: z.uuid().optional(),
        }),
        response: {
          200: z.object({ id: z.uuid(), total: z.number().int(), excluded: excludedSchema }),
          400: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      bodyIssue(b.body);
      if (selectionIsEmpty(b.selection)) {
        throw new HttpError(400, 'no_recipients', 'Pilih setidaknya satu penerima.');
      }
      if (
        (selectionIsBroad(b.selection) || b.expectedTotal > BATCH_CONFIRM_THRESHOLD) &&
        !ctx.permissions.has('message:broadcast')
      ) {
        throw forbidden('Mengirim ke rombel/seluruh sekolah atau lebih dari 30 penerima butuh izin siaran.');
      }
      const title = b.title ?? b.body.replace(/\s+/g, ' ').slice(0, 60);
      try {
        return await tenant(request, async (tx) => {
          if (b.attachmentId) {
            const [a] = await tx
              .select({ id: msgAttachment.id, purgedAt: msgAttachment.purgedAt })
              .from(msgAttachment)
              .where(eq(msgAttachment.id, b.attachmentId));
            if (!a || a.purgedAt) {
              throw new HttpError(
                400,
                'attachment_invalid',
                'Lampiran tidak ditemukan atau sudah kedaluwarsa.',
              );
            }
          }
          const [dup] = await tx
            .select({ id: msgBatch.id })
            .from(msgBatch)
            .where(
              and(
                eq(msgBatch.createdBy, ctx.userId),
                eq(msgBatch.bodyTemplate, b.body),
                sql`${msgBatch.selection} = ${JSON.stringify(b.selection)}::jsonb`,
                sql`${msgBatch.attachmentId} is not distinct from ${b.attachmentId ?? null}::uuid`,
                gte(msgBatch.createdAt, new Date(Date.now() - 30_000)),
              ),
            );
          if (dup) throw new HttpError(409, 'duplicate_batch', 'Pesan yang sama baru saja dikirim.');
          const r = await enqueueBatch(tx, {
            schoolId: ctx.schoolId,
            kind: 'direct',
            title,
            body: b.body,
            selection: b.selection,
            createdBy: ctx.userId,
            expectedTotal: b.expectedTotal,
            schoolName: await schoolInfo(tx, ctx.schoolId),
            attachmentId: b.attachmentId ?? null,
          });
          await audit(tx, ctx, 'messaging.batch.create', 'msg_batch', r.batchId, {
            kind: 'direct',
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
        throw error;
      }
    },
  );

  /* ---------- Lampiran ---------- */

  app.post(
    '/v1/messaging/attachments',
    {
      onRequest: sendGate,
      bodyLimit: 3 * 1024 * 1024,
      schema: {
        tags: tag,
        summary: 'Unggah lampiran pesan langsung',
        description:
          'Izin: `message:send`; modul `messaging`. PDF, JPEG, atau PNG sampai 2 MB (asli), base64 di `dataBase64` ' +
          '(tanpa awalan `data:`). Jenis diperiksa dari isi berkas (magic bytes), bukan hanya `mime` kiriman: tidak ' +
          'cocok atau bukan salah satu dari tiga jenis itu 400 `attachment_type`; lebih dari 2 MB 400 ' +
          '`attachment_too_large`; base64 rusak 400 `invalid_base64`. `id` dipakai sebagai `attachmentId` di ' +
          '`POST /v1/messaging/batches`. Isi berkas dihapus otomatis bila tak dipakai batch dalam 24 jam, atau 7 hari ' +
          'setelah batch terakhirnya selesai; metadata tetap. Badan permintaan di atas 3 MB: 413.',
        headers: schoolHeader,
        body: attachmentUploadSchema,
        response: { 200: attachmentSchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { fileName, mime, dataBase64 } = request.body;
      const bytes = decodeAttachment(dataBase64);
      if (detectAttachmentMime(bytes) !== mime) {
        throw new HttpError(
          400,
          'attachment_type',
          'Lampiran harus berkas PDF, JPG, atau PNG yang isinya sesuai.',
        );
      }
      return tenant(request, (tx) => storeAttachment(tx, ctx, fileName, mime, bytes));
    },
  );

  app.get(
    '/v1/messaging/attachments/:id/content',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Unduh isi lampiran',
        description:
          'Izin: `message:send` (pengirim memeriksa ulang lampiran sebelum mengirim); modul `messaging`. Isi berkas ' +
          'asli dengan `content-type` aslinya. Lampiran tidak ada: 404 `not_found`; isi sudah dihapus: 410 ' +
          '`attachment_expired`.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.any().describe('Isi berkas (PDF, JPEG, atau PNG)'),
          404: errorSchema,
          410: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const [row] = await tenant(request, (tx) =>
        tx.select().from(msgAttachment).where(eq(msgAttachment.id, request.params.id)),
      );
      if (!row) throw new HttpError(404, 'not_found', 'Lampiran tidak ditemukan.');
      if (!row.data) throw new HttpError(410, 'attachment_expired', 'Isi lampiran sudah dihapus.');
      return reply
        .header('content-type', row.mime)
        .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`)
        .header('cache-control', 'private, no-store')
        .header('x-content-type-options', 'nosniff')
        .send(row.data);
    },
  );

  /* ---------- Riwayat batch ---------- */

  const countsOf = (rows: { status: string; n: number }[]) => {
    const n = (...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
    return { queued: n('queued', 'sending'), sent: n('sent'), failed: n('failed'), skipped: n('skipped') };
  };
  type BatchRow = typeof msgBatch.$inferSelect;
  type AttachmentMeta = z.infer<typeof attachmentSchema>;
  const view = (
    b: BatchRow,
    rows: { status: string; n: number }[],
    createdBy: string | null,
    attachment: AttachmentMeta | null,
  ) => {
    const counts = countsOf(rows);
    return {
      id: b.id,
      kind: b.kind,
      title: b.title,
      createdBy,
      createdAt: b.createdAt.toISOString(),
      recipientCount: b.recipientCount,
      excluded: b.excluded,
      counts,
      status: counts.queued > 0 ? ('sending' as const) : ('done' as const),
      cancelledAt: b.cancelledAt?.toISOString() ?? null,
      attachment,
    };
  };
  const attachmentsOf = async (tx: Tx, ids: (string | null)[]) => {
    const want = [...new Set(ids.filter((i): i is string => Boolean(i)))];
    if (want.length === 0) return new Map<string, AttachmentMeta>();
    const rows = await tx
      .select({
        id: msgAttachment.id,
        fileName: msgAttachment.fileName,
        mime: msgAttachment.mime,
        size: msgAttachment.size,
        purgedAt: msgAttachment.purgedAt,
      })
      .from(msgAttachment)
      .where(inArray(msgAttachment.id, want));
    return new Map(
      rows.map(
        ({ purgedAt, ...r }) => [r.id, { ...r, purged: purgedAt !== null }] as [string, AttachmentMeta],
      ),
    );
  };
  const notFound = () => new HttpError(404, 'not_found', 'Batch tidak ditemukan.');

  app.get(
    '/v1/messaging/batches',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar batch pesan',
        description:
          'Izin: `message:read`; modul `messaging`. Terbaru dulu. `counts` per status pesan (`sending` dihitung ' +
          '`queued`); `status` batch dihitung: `sending` bila masih ada pesan antre/dikirim, selain itu `done`.',
        headers: schoolHeader,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(batchSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [totalRow] = await tx.select({ n: count() }).from(msgBatch);
        const rows = await tx
          .select()
          .from(msgBatch)
          .orderBy(desc(msgBatch.createdAt), desc(msgBatch.id))
          .limit(request.query.limit)
          .offset(request.query.offset);
        if (rows.length === 0) return { items: [], total: totalRow?.n ?? 0 };
        const grouped = await tx
          .select({ batchId: msgMessage.batchId, status: msgMessage.status, n: count() })
          .from(msgMessage)
          .where(
            inArray(
              msgMessage.batchId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(msgMessage.batchId, msgMessage.status);
        const users = await tx
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, [...new Set(rows.map((r) => r.createdBy))]));
        const files = await attachmentsOf(
          tx,
          rows.map((r) => r.attachmentId),
        );
        return {
          items: rows.map((r) =>
            view(
              r,
              grouped.filter((g) => g.batchId === r.id),
              users.find((u) => u.id === r.createdBy)?.name ?? null,
              files.get(r.attachmentId ?? '') ?? null,
            ),
          ),
          total: totalRow?.n ?? 0,
        };
      }),
  );

  app.get(
    '/v1/messaging/batches/:id',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Rincian batch pesan',
        description:
          'Izin: `message:read`; modul `messaging`. Memuat isi asli (`body`), pemilih penerima (`selection`), dan ' +
          'penerima (nama, nomor disamarkan, status, `detail`, urut nama; `limit` maks 500). `detail` mis. `cancelled`, ' +
          '`expired`, `not_on_whatsapp`. Batch tidak ada: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(500).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: batchSchema.extend({
            body: z.string(),
            selection: z.record(z.string(), z.unknown()),
            recipients: z.array(
              z.object({
                id: z.uuid(),
                name: z.string().nullable(),
                phone: z.string().describe('Disamarkan'),
                recipientType: z.enum(['guardian', 'teacher']),
                status: z.enum(['queued', 'sending', 'sent', 'failed', 'skipped']),
                detail: z.string().nullable(),
                attempts: z.number().int(),
                sentAt: z.iso.datetime({ offset: true }).nullable(),
              }),
            ),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [b] = await tx.select().from(msgBatch).where(eq(msgBatch.id, request.params.id));
        if (!b) throw notFound();
        const grouped = await tx
          .select({ status: msgMessage.status, n: count() })
          .from(msgMessage)
          .where(eq(msgMessage.batchId, b.id))
          .groupBy(msgMessage.status);
        const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, b.createdBy));
        const rows = await tx
          .select({
            id: msgMessage.id,
            guardianName: guardian.name,
            teacherName: teacher.name,
            teacherId: msgMessage.teacherId,
            toPhone: msgMessage.toPhone,
            status: msgMessage.status,
            detail: msgMessage.detail,
            attempts: msgMessage.attempts,
            sentAt: msgMessage.sentAt,
          })
          .from(msgMessage)
          .leftJoin(guardian, eq(guardian.id, msgMessage.guardianId))
          .leftJoin(teacher, eq(teacher.id, msgMessage.teacherId))
          .where(eq(msgMessage.batchId, b.id))
          .orderBy(asc(sql`coalesce(${guardian.name}, ${teacher.name})`), asc(msgMessage.id))
          .limit(request.query.limit)
          .offset(request.query.offset);
        return {
          ...view(
            b,
            grouped,
            u?.name ?? null,
            (await attachmentsOf(tx, [b.attachmentId])).get(b.attachmentId ?? '') ?? null,
          ),
          body: b.bodyTemplate,
          selection: b.selection,
          recipients: rows.map((r) => ({
            id: r.id,
            name: r.guardianName ?? r.teacherName,
            phone: maskPhone(r.toPhone),
            recipientType: r.teacherId ? ('teacher' as const) : ('guardian' as const),
            status: r.status,
            detail: r.detail,
            attempts: r.attempts,
            sentAt: r.sentAt?.toISOString() ?? null,
          })),
        };
      }),
  );

  app.post(
    '/v1/messaging/batches/:id/cancel',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Batalkan batch pesan',
        description:
          'Izin: `message:send`; modul `messaging`. Pesan `queued` menjadi `skipped` dengan `detail` `cancelled` ' +
          '(tidak dihitung ke batas harian); yang sudah `sending`/`sent` tidak disentuh. Aman diulang. Batch tidak ada: ' +
          '404 `not_found`. `cancelled` = jumlah pesan yang dibatalkan kali ini.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: z.object({ cancelled: z.number().int() }), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [b] = await tx.select().from(msgBatch).where(eq(msgBatch.id, request.params.id));
        if (!b) throw notFound();
        const cancelled = await tx
          .update(msgMessage)
          .set({ status: 'skipped', detail: 'cancelled' })
          .where(and(eq(msgMessage.batchId, b.id), eq(msgMessage.status, 'queued')))
          .returning({ id: msgMessage.id });
        if (!b.cancelledAt) {
          await tx
            .update(msgBatch)
            .set({ cancelledAt: new Date(), cancelledBy: ctx.userId })
            .where(eq(msgBatch.id, b.id));
        }
        await audit(tx, ctx, 'messaging.batch.cancel', 'msg_batch', b.id, { cancelled: cancelled.length });
        return { cancelled: cancelled.length };
      });
    },
  );

  app.post(
    '/v1/messaging/batches/:id/retry-failed',
    {
      onRequest: sendGate,
      schema: {
        tags: tag,
        summary: 'Kirim ulang pesan batch yang gagal',
        description:
          'Izin: `message:send`; modul `messaging`. Pesan `failed` (kecuali `not_on_whatsapp`, `attachment_expired`, ' +
          '`opted_out`) dan `skipped` karena `expired` kembali `queued` dengan percobaan 0; tidak menambah hitungan ' +
          'batas harian (pesannya sudah terhitung). Batch dibatalkan: 409 `batch_cancelled`; pengiriman dimatikan: ' +
          '409 `messaging_disabled`. Batch tidak ada: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: {
          200: z.object({ requeued: z.number().int() }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [b] = await tx.select().from(msgBatch).where(eq(msgBatch.id, request.params.id));
        if (!b) throw notFound();
        if (b.cancelledAt) throw new HttpError(409, 'batch_cancelled', 'Batch ini sudah dibatalkan.');
        if (!(await loadSendLimits(tx, ctx.schoolId)).enabled) {
          throw new HttpError(
            409,
            'messaging_disabled',
            'Pengiriman pesan sedang dimatikan untuk sekolah ini.',
          );
        }
        const requeued = await tx
          .update(msgMessage)
          .set({ status: 'queued', attempts: 0, detail: null, notBefore: sql`now()` })
          .where(
            and(
              eq(msgMessage.batchId, b.id),
              or(
                and(
                  eq(msgMessage.status, 'failed'),
                  or(isNull(msgMessage.detail), notInArray(msgMessage.detail, NOT_RETRYABLE)),
                ),
                and(eq(msgMessage.status, 'skipped'), eq(msgMessage.detail, 'expired')),
              ),
            ),
          )
          .returning({ id: msgMessage.id });
        await audit(tx, ctx, 'messaging.batch.retry_failed', 'msg_batch', b.id, {
          requeued: requeued.length,
        });
        return { requeued: requeued.length };
      });
    },
  );

  /* ---------- Opt-out siaran ---------- */

  const optOutSchema = z.object({
    id: z.uuid(),
    phone: z.string().describe('Disamarkan'),
    guardianId: z.uuid().nullable(),
    guardianName: z.string().nullable().describe('Null bila wali sudah dihapus'),
    source: z.enum(['staff', 'portal']),
    createdBy: z.string().nullable().describe('Nama staf yang menandai; null bila akunnya sudah dihapus'),
    createdAt: z.iso.datetime({ offset: true }),
  });
  const optOutRows = (tx: Tx) =>
    tx
      .select({
        id: msgOptOut.id,
        phone: msgOptOut.phone,
        guardianId: msgOptOut.guardianId,
        guardianName: guardian.name,
        source: msgOptOut.source,
        createdBy: user.name,
        createdAt: msgOptOut.createdAt,
      })
      .from(msgOptOut)
      .leftJoin(
        guardian,
        and(eq(guardian.schoolId, msgOptOut.schoolId), eq(guardian.id, msgOptOut.guardianId)),
      )
      .leftJoin(user, eq(user.id, msgOptOut.createdBy));
  const optOutView = (r: Awaited<ReturnType<typeof optOutRows>>[number]) => ({
    ...r,
    phone: maskPhone(r.phone),
    createdAt: r.createdAt.toISOString(),
  });

  app.get(
    '/v1/messaging/opt-outs',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Daftar wali yang menolak siaran',
        description:
          'Izin: `message:manage`; modul `messaging`. Nomor di daftar ini dilewati siaran pengumuman (`excluded.optedOut`); ' +
          'pesan langsung tetap boleh dan hanya diberi peringatan di pratinjau. Nomor disamarkan. Terbaru dulu.',
        headers: schoolHeader,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: z.object({ items: z.array(optOutSchema), total: z.number().int() }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [totalRow] = await tx.select({ n: count() }).from(msgOptOut);
        const rows = await optOutRows(tx)
          .orderBy(desc(msgOptOut.createdAt), desc(msgOptOut.id))
          .limit(request.query.limit)
          .offset(request.query.offset);
        return { items: rows.map(optOutView), total: totalRow?.n ?? 0 };
      }),
  );

  app.put(
    '/v1/messaging/opt-outs',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tandai wali menolak siaran',
        description:
          'Izin: `message:manage`; modul `messaging`. Staf menandai wali (`guardianId`); yang disimpan nomor wali itu ' +
          'yang sudah dinormalisasi, jadi berlaku juga untuk wali lain dengan nomor sama. Aman diulang. Wali tidak ada: ' +
          '404 `not_found`; wali tanpa nomor atau nomornya tidak valid: 400 `invalid_phone`.',
        headers: schoolHeader,
        body: z.object({ guardianId: z.uuid() }),
        response: { 200: optOutSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [g] = await tx
          .select({ id: guardian.id, phone: guardian.phone })
          .from(guardian)
          .where(eq(guardian.id, request.body.guardianId));
        if (!g) throw new HttpError(404, 'not_found', 'Wali tidak ditemukan.');
        const phone = normalizePhone(g.phone);
        if (!phone)
          throw new HttpError(400, 'invalid_phone', 'Wali ini tidak punya nomor WhatsApp yang valid.');
        await tx
          .insert(msgOptOut)
          .values({ schoolId: ctx.schoolId, phone, guardianId: g.id, source: 'staff', createdBy: ctx.userId })
          .onConflictDoNothing();
        const [row] = await optOutRows(tx).where(eq(msgOptOut.phone, phone));
        await audit(tx, ctx, 'messaging.opt_out.set', 'msg_opt_out', (row as { id: string }).id, {
          guardianId: g.id,
        });
        return optOutView(row as Awaited<ReturnType<typeof optOutRows>>[number]);
      });
    },
  );

  app.delete(
    '/v1/messaging/opt-outs/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Cabut penolakan siaran',
        description:
          'Izin: `message:manage`; modul `messaging`. Nomor kembali menerima siaran berikutnya. Tidak ada: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const rows = await tx
          .delete(msgOptOut)
          .where(eq(msgOptOut.id, request.params.id))
          .returning({ id: msgOptOut.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Data tidak ditemukan.');
        await audit(tx, ctx, 'messaging.opt_out.remove', 'msg_opt_out', request.params.id);
        return { ok: true as const };
      });
    },
  );

  /* ---------- Templat pesan langsung ---------- */

  const templateView = (r: typeof msgDirectTemplate.$inferSelect) => ({
    id: r.id,
    name: r.name,
    body: r.body,
    updatedAt: r.updatedAt.toISOString(),
  });
  const validateTemplate = (body: string) => {
    const issue = directBodyIssue(body);
    if (issue?.code === 'unknown_placeholder') {
      throw new HttpError(400, 'unknown_placeholder', `Pengganti tidak dikenal: ${issue.detail}.`);
    }
  };

  app.get(
    '/v1/messaging/direct-templates',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar templat pesan langsung',
        description:
          'Izin: `message:read`; modul `messaging`. Hanya templat milik sekolah (urut nama); templat bawaan ' +
          '(mis. "Pemanggilan orang tua") ada di kode klien, bukan di sini.',
        headers: schoolHeader,
        response: { 200: z.array(templateSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        (await tx.select().from(msgDirectTemplate).orderBy(asc(msgDirectTemplate.name))).map(templateView),
      ),
  );

  app.post(
    '/v1/messaging/direct-templates',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Buat templat pesan langsung',
        description:
          'Izin: `message:manage`; modul `messaging`. `name` 1..60 (unik per sekolah: 409 `conflict`), `body` ' +
          '1..1000 karakter dengan pengganti `{{guardian}}`, `{{student}}`, `{{class}}`, `{{school}}`, `{{date}}`, ' +
          '`{{teacher}}`; selainnya 400 `unknown_placeholder`.',
        headers: schoolHeader,
        body: templateBody,
        response: { 200: templateSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      validateTemplate(request.body.body);
      return conflictAs409('Nama templat sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .insert(msgDirectTemplate)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning();
          await audit(
            tx,
            ctx,
            'messaging.direct_template.create',
            'msg_direct_template',
            (row as { id: string }).id,
          );
          return templateView(row as typeof msgDirectTemplate.$inferSelect);
        }),
      );
    },
  );

  app.put(
    '/v1/messaging/direct-templates/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah templat pesan langsung',
        description:
          'Izin: `message:manage`; modul `messaging`. Aturan isi sama dengan pembuatan. Tidak ada: 404 `not_found`; ' +
          'nama bentrok: 409 `conflict`.',
        headers: schoolHeader,
        params: idParams,
        body: templateBody,
        response: { 200: templateSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      validateTemplate(request.body.body);
      return conflictAs409('Nama templat sudah dipakai.', () =>
        tenant(request, async (tx) => {
          const [row] = await tx
            .update(msgDirectTemplate)
            .set({ ...request.body, updatedAt: new Date() })
            .where(eq(msgDirectTemplate.id, request.params.id))
            .returning();
          if (!row) throw new HttpError(404, 'not_found', 'Templat tidak ditemukan.');
          await audit(tx, ctx, 'messaging.direct_template.update', 'msg_direct_template', row.id);
          return templateView(row);
        }),
      );
    },
  );

  app.delete(
    '/v1/messaging/direct-templates/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus templat pesan langsung',
        description:
          'Izin: `message:manage`; modul `messaging`. Pesan yang sudah dibuat dari templat ini tidak terpengaruh ' +
          '(isi disalin ke batch). Tidak ada: 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const rows = await tx
          .delete(msgDirectTemplate)
          .where(eq(msgDirectTemplate.id, request.params.id))
          .returning({ id: msgDirectTemplate.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Templat tidak ditemukan.');
        await audit(tx, ctx, 'messaging.direct_template.delete', 'msg_direct_template', request.params.id);
        return { ok: true as const };
      });
    },
  );
}
