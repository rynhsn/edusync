import { DEFAULT_TIMEZONE, localParts, zonedTimeToDate } from '@edusync/contracts';
import {
  and,
  asc,
  type Db,
  DEFAULT_MESSAGING_RETRY,
  eq,
  inArray,
  lte,
  type MessagingRetry,
  msgMessage,
  msgSetting,
  school,
  sql,
  waAccount,
} from '@edusync/db';
import type { PlatformLoader } from './account-sync';
import { type Loop, startLoop } from './loop';
import type { MessageSender } from './sender';

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

  private async serveSchool(schoolId: string, now: Date, retry: MessagingRetry): Promise<number> {
    const dueOfSchool = and(
      eq(msgMessage.schoolId, schoolId),
      eq(msgMessage.status, 'queued'),
      lte(msgMessage.notBefore, now),
    );

    const [setting] = await this.db.select().from(msgSetting).where(eq(msgSetting.schoolId, schoolId));
    if (!setting?.enabled) {
      await this.db.update(msgMessage).set({ status: 'skipped', detail: 'disabled' }).where(dueOfSchool);
      return 0;
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
      .select({ timezone: school.timezone })
      .from(school)
      .where(eq(school.id, schoolId));
    const window = sendWindow(now, setting.windowStart, setting.windowEnd, sch?.timezone);
    if (!window.open) {
      await this.db.update(msgMessage).set({ notBefore: window.nextStart }).where(dueOfSchool);
      return 0;
    }

    if ((this.nextAllowed.get(schoolId) ?? 0) > now.getTime()) return 0;

    // Klaim atomik: hanya satu pemanggil yang mendapat baris yang sama (SKIP LOCKED untuk dispatcher paralel).
    const claimed = await this.db.execute<{
      id: string;
      to_phone: string;
      body: string;
      attempts: number;
    }>(sql`
      update msg_message set status = 'sending', attempts = attempts + 1
      where id = (
        select id from msg_message
        where school_id = ${schoolId}::uuid and status = 'queued' and not_before <= ${now.toISOString()}::timestamptz
        order by created_at, id
        limit 1
        for update skip locked
      ) and status = 'queued'
      returning id, to_phone, body, attempts`);
    const msg = claimed.rows[0];
    if (!msg) return 0;

    const delaySeconds =
      setting.delayMinSeconds +
      this.random() * Math.max(0, setting.delayMaxSeconds - setting.delayMinSeconds);
    this.nextAllowed.set(schoolId, now.getTime() + delaySeconds * 1000);

    let result: Awaited<ReturnType<MessageSender['send']>>;
    try {
      result = await this.sender.send(schoolId, msg.to_phone, msg.body);
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
