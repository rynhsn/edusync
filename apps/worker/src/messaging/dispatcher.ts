import {
  broadcastDelay,
  composeMessage,
  DEFAULT_TIMEZONE,
  localParts,
  MESSAGE_PRIORITY,
  zonedTimeToDate,
} from '@edusync/contracts';
import {
  and,
  asc,
  type Db,
  DEFAULT_MESSAGING_RETRY,
  eq,
  inArray,
  lte,
  type MessagingRetry,
  msgAttachment,
  msgBatch,
  msgMessage,
  msgSetting,
  school,
  sql,
  waAccount,
} from '@edusync/db';
import type { PlatformLoader } from './account-sync';
import { AttachmentCache } from './attachment-cache';
import { type Loop, startLoop } from './loop';
import type { MessageSender, SendAttachment } from './sender';

/**
 * Bawaan aturan kirim ulang (pengaturan platform `retry` menimpa). Jeda sebelum percobaan ke-n+1 setelah ke-n
 * gagal: 1m, 5m, 30m, 2j, 6j.
 */
export const BACKOFF_MS = DEFAULT_MESSAGING_RETRY.backoffMinutes.map((m) => m * 60_000);
export const MAX_ATTEMPTS = DEFAULT_MESSAGING_RETRY.maxAttempts;
/** Pesan yang tertahan lebih lama dari ini karena WhatsApp sekolah tidak siap dibuang. */
export const EXPIRY_MS = DEFAULT_MESSAGING_RETRY.expiryHours * 3_600_000;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Apakah `now` ada di dalam jendela kirim (HH:MM menurut zona waktu sekolah `tz`, bawaan Asia/Jakarta)? Bila di luar,
 * `nextStart` adalah awal jendela berikutnya. Jendela yang melewati tengah malam (mulai > selesai) didukung.
 */
export function sendWindow(
  now: Date,
  start: string,
  end: string,
  tz: string = DEFAULT_TIMEZONE,
): { open: true } | { open: false; nextStart: Date } {
  const local = localParts(now, tz);
  const minutes = toMinutes(local.time);
  const s = toMinutes(start);
  const e = toMinutes(end);
  const open = s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  if (open) return { open: true };
  let day = local.date;
  if (minutes >= s) {
    const next = new Date(`${local.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return { open: false, nextStart: zonedTimeToDate(day, start, tz) };
}

export interface DispatcherOptions {
  getPlatform: PlatformLoader;
  intervalMs?: number;
  /** Disuntik untuk tes. */
  now?: () => Date;
  random?: () => number;
  /** Batasi ke sekolah tertentu (untuk tes yang berbagi basis data). */
  schoolIds?: string[];
  log?: Pick<Console, 'log' | 'error'>;
}

/**
 * Mengirim antrean `msg_message`. Satu pesan per sekolah per putaran (sekolah dibagi adil: yang pesan tertuanya
 * paling lama menunggu didahulukan), dengan jeda acak antar kirim per sekolah. Berjalan di peran platform.
 */
export class Dispatcher {
  private loop: Loop | null = null;
  /** Kapan sekolah boleh mengirim lagi (ms epoch); hanya di memori proses ini. */
  private readonly nextAllowed = new Map<string, number>();
  private readonly now: () => Date;
  private readonly random: () => number;
  /** Isi lampiran yang baru dipakai; dibaca dari DB lewat peran platform hanya saat tidak ada di sini. */
  private readonly attachments = new AttachmentCache();

  constructor(
    private readonly db: Db,
    private readonly sender: MessageSender,
    private readonly options: DispatcherOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  start() {
    this.loop = startLoop(
      'pengirim',
      this.options.intervalMs ?? 2000,
      async () => void (await this.tick()),
      this.options.log,
    );
  }

  async stop() {
    await this.loop?.stop();
    this.loop = null;
  }

  /** Satu putaran: kembalikan jumlah percobaan kirim. */
  async tick(): Promise<number> {
    const platform = await this.options.getPlatform();
    if (!platform.enabled) return 0; // pesan dibiarkan 'queued'

    const now = this.now();
    const due = and(
      eq(msgMessage.status, 'queued'),
      lte(msgMessage.notBefore, now),
      this.options.schoolIds ? inArray(msgMessage.schoolId, this.options.schoolIds) : undefined,
    );
    const schools = await this.db
      .select({ schoolId: msgMessage.schoolId, oldest: sql<Date>`min(${msgMessage.createdAt})` })
      .from(msgMessage)
      .where(due)
      .groupBy(msgMessage.schoolId)
      .orderBy(asc(sql`min(${msgMessage.createdAt})`));

    const retry = platform.retry ?? DEFAULT_MESSAGING_RETRY;
    const results = await Promise.all(
      schools.map((s) =>
        this.serveSchool(s.schoolId, now, retry).catch((error) => {
          this.options.log?.error(`[pesan] pengiriman sekolah ${s.schoolId} gagal`, error);
          return 0;
        }),
      ),
    );
    return results.reduce((a, b) => a + b, 0);
  }

  /**
   * Lampiran batch: undefined = batch tanpa lampiran, null = isinya sudah dihapus (kedaluwarsa, tidak diulang).
   * Baris disaring `school_id` juga karena pool platform melewati RLS.
   */
  private async loadAttachment(
    schoolId: string,
    batchId: string,
  ): Promise<SendAttachment | null | undefined> {
    const [meta] = await this.db
      .select({
        id: msgAttachment.id,
        fileName: msgAttachment.fileName,
        mime: msgAttachment.mime,
        purgedAt: msgAttachment.purgedAt,
      })
      .from(msgBatch)
      .innerJoin(
        msgAttachment,
        and(eq(msgAttachment.schoolId, msgBatch.schoolId), eq(msgAttachment.id, msgBatch.attachmentId)),
      )
      .where(and(eq(msgBatch.schoolId, schoolId), eq(msgBatch.id, batchId)));
    if (!meta) return undefined;
    if (meta.purgedAt) {
      this.attachments.delete(meta.id);
      return null;
    }
    let data = this.attachments.get(meta.id);
    if (!data) {
      const [row] = await this.db
        .select({ data: msgAttachment.data })
        .from(msgAttachment)
        .where(and(eq(msgAttachment.schoolId, schoolId), eq(msgAttachment.id, meta.id)));
      if (!row?.data) return null;
      data = row.data;
      this.attachments.set(meta.id, data);
    }
    return { data, mime: meta.mime, fileName: meta.fileName };
  }

  private async serveSchool(schoolId: string, now: Date, retry: MessagingRetry): Promise<number> {
    const dueOfSchool = and(
      eq(msgMessage.schoolId, schoolId),
      eq(msgMessage.status, 'queued'),
      lte(msgMessage.notBefore, now),
    );

    const [setting] = await this.db.select().from(msgSetting).where(eq(msgSetting.schoolId, schoolId));
    if (!setting) {
      await this.db.update(msgMessage).set({ status: 'skipped', detail: 'disabled' }).where(dueOfSchool);
      return 0;
    }
    if (!setting.enabled) {
      // Pesan uji tetap dikirim walau pengiriman otomatis dimatikan: gunanya memeriksa sambungan WhatsApp.
      await this.db
        .update(msgMessage)
        .set({ status: 'skipped', detail: 'disabled' })
        .where(and(dueOfSchool, sql`${msgMessage.eventKey} <> 'test'`));
    }

    const [account] = await this.db.select().from(waAccount).where(eq(waAccount.schoolId, schoolId));
    if (account?.status !== 'ready') {
      // Ditahan tanpa menyentuh percobaan; yang terlalu lama menunggu dibuang.
      await this.db
        .update(msgMessage)
        .set({ status: 'skipped', detail: 'expired' })
        .where(
          and(
            dueOfSchool,
            lte(msgMessage.createdAt, new Date(now.getTime() - retry.expiryHours * 3_600_000)),
          ),
        );
      return 0;
    }

    const [sch] = await this.db
      .select({ timezone: school.timezone, name: school.name })
      .from(school)
      .where(eq(school.id, schoolId));
    const window = sendWindow(now, setting.windowStart, setting.windowEnd, sch?.timezone);
    if (!window.open) {
      await this.db.update(msgMessage).set({ notBefore: window.nextStart }).where(dueOfSchool);
      return 0;
    }

    if ((this.nextAllowed.get(schoolId) ?? 0) > now.getTime()) return 0;

    // Klaim atomik, prioritas lebih kecil dulu (0 peristiwa/uji, 1 pesan langsung, 2 siaran): hanya satu pemanggil yang mendapat baris yang sama (SKIP LOCKED untuk dispatcher paralel).
    const claimed = await this.db.execute<{
      id: string;
      to_phone: string;
      body: string;
      attempts: number;
      batch_id: string | null;
      priority: number;
    }>(sql`
      update msg_message set status = 'sending', attempts = attempts + 1
      where id = (
        select id from msg_message
        where school_id = ${schoolId}::uuid and status = 'queued' and not_before <= ${now.toISOString()}::timestamptz
        order by priority, created_at, id
        limit 1
        for update skip locked
      ) and status = 'queued'
      returning id, to_phone, body, attempts, batch_id, priority`);
    const msg = claimed.rows[0];
    if (!msg) return 0;

    // Siaran (prioritas 2) tak pernah lebih rapat dari BROADCAST_DELAY_MIN_SECONDS; pesan lain memakai pengaturan sekolah.
    const { min, max } =
      msg.priority === MESSAGE_PRIORITY.broadcast
        ? broadcastDelay(setting.delayMinSeconds, setting.delayMaxSeconds)
        : { min: setting.delayMinSeconds, max: setting.delayMaxSeconds };
    const delaySeconds = min + this.random() * Math.max(0, max - min);
    this.nextAllowed.set(schoolId, now.getTime() + delaySeconds * 1000);

    let result: Awaited<ReturnType<MessageSender['send']>>;
    try {
      // Header/footer dipasang di sini: pesan antre ikut berubah dan msg_message.body tetap isi asli.
      const text = composeMessage(msg.body, {
        headerText: setting.headerText,
        footerText: setting.footerText,
        schoolName: sch?.name ?? null,
      });
      const attachment = msg.batch_id ? await this.loadAttachment(schoolId, msg.batch_id) : undefined;
      result =
        attachment === null
          ? { ok: false, retryable: false, error: 'attachment_expired' }
          : await this.sender.send(schoolId, msg.to_phone, text, attachment);
    } catch (error) {
      result = { ok: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
    }

    const where = eq(msgMessage.id, msg.id);
    if (result.ok) {
      await this.db.update(msgMessage).set({ status: 'sent', sentAt: this.now(), detail: null }).where(where);
    } else if (result.error === 'not_ready') {
      // Klien belum siap saat kirim: bukan salah pesan, jangan hitung sebagai percobaan.
      await this.db
        .update(msgMessage)
        .set({ status: 'queued', attempts: msg.attempts - 1, notBefore: new Date(now.getTime() + 30_000) })
        .where(where);
    } else if (!result.retryable || msg.attempts >= retry.maxAttempts) {
      await this.db.update(msgMessage).set({ status: 'failed', detail: result.error }).where(where);
    } else {
      const steps = retry.backoffMinutes;
      const wait = (steps[msg.attempts - 1] ?? steps[steps.length - 1] ?? 1) * 60_000;
      await this.db
        .update(msgMessage)
        .set({ status: 'queued', detail: result.error, notBefore: new Date(now.getTime() + wait) })
        .where(where);
    }
    return 1;
  }
}
