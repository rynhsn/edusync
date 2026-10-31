import { type Db, eq, inArray, type MessagingRetry, waAccount } from '@edusync/db';
import { type Loop, startLoop } from './loop';
import type { WhatsAppManager } from './whatsapp';

/** Pengaturan global pesan di konsol platform (lihat loadPlatformMessaging di @edusync/db). */
export interface PlatformMessagingSettings {
  enabled: boolean;
  provider: 'whatsapp' | 'log';
  maxQueuedPerSchool: number;
  /** Aturan kirim ulang; tidak ada = bawaan (DEFAULT_MESSAGING_RETRY). */
  retry?: MessagingRetry;
}

export type PlatformLoader = () => Promise<PlatformMessagingSettings>;

export interface AccountSyncOptions {
  /** Mode pengirim proses ini: 'log' = akun langsung dianggap siap tanpa WhatsApp sungguhan. */
  mode: 'log' | 'whatsapp';
  manager?: WhatsAppManager | undefined;
  getPlatform: PlatformLoader;
  intervalMs?: number;
  /** Jeda minimum antar percobaan sambung ulang per sekolah (mencegah putaran gagal-sambung tiap 3 detik). */
  reconnectMs?: number;
  now?: () => number;
  /** Batasi ke sekolah tertentu (untuk tes yang berbagi basis data). */
  schoolIds?: string[];
  log?: Pick<Console, 'log' | 'error'>;
}

/**
 * Menyamakan klien WhatsApp (atau akun palsu mode log) dengan `wa_account.desired_state`.
 * Dipanggil tiap beberapa detik; putaran pertama sekaligus menyambung ulang akun yang sebelumnya menyala.
 */
export class AccountSync {
  private loop: Loop | null = null;
  private readonly lastAttempt = new Map<string, number>();
  private readonly intervalMs: number;
  private readonly reconnectMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly options: AccountSyncOptions,
  ) {
    this.intervalMs = options.intervalMs ?? 3000;
    this.reconnectMs = options.reconnectMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  start() {
    this.loop = startLoop('sinkronisasi akun', this.intervalMs, () => this.tick(), this.options.log);
  }

  async stop() {
    await this.loop?.stop();
    this.loop = null;
  }

  private async setStatus(schoolId: string, values: Partial<typeof waAccount.$inferInsert>) {
    await this.db
      .update(waAccount)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(waAccount.schoolId, schoolId));
  }

  /** Satu putaran sinkronisasi. Dibuka agar tes bisa memanggilnya langsung. */
  async tick() {
    const platform = await this.options.getPlatform();
    const accounts = await this.db
      .select()
      .from(waAccount)
      .where(this.options.schoolIds ? inArray(waAccount.schoolId, this.options.schoolIds) : undefined);
    const manager = this.options.manager;

    for (const acc of accounts) {
      try {
        // Saklar global mati: jangan menyambung; yang sudah tersambung dilepas tanpa logout (sesi tetap tersimpan).
        if (!platform.enabled) {
          if (manager?.has(acc.schoolId)) await manager.release(acc.schoolId);
          if (acc.status !== 'disconnected') {
            await this.setStatus(acc.schoolId, { status: 'disconnected', qr: null });
          }
          continue;
        }

        if (this.options.mode === 'log') {
          if (acc.desiredState === 'on' && acc.status !== 'ready') {
            await this.setStatus(acc.schoolId, { status: 'ready', phone: '0000', qr: null, lastError: null });
          } else if (acc.desiredState === 'off' && acc.status !== 'disconnected') {
            await this.setStatus(acc.schoolId, { status: 'disconnected', qr: null });
          }
          continue;
        }

        if (!manager) continue;
        if (acc.desiredState === 'on') {
          if (manager.has(acc.schoolId)) continue;
          const last = this.lastAttempt.get(acc.schoolId);
          if (last !== undefined && this.now() - last < this.reconnectMs) continue;
          this.lastAttempt.set(acc.schoolId, this.now());
          await manager.connect(acc.schoolId);
        } else {
          this.lastAttempt.delete(acc.schoolId);
          if (manager.has(acc.schoolId) || acc.status !== 'disconnected') {
            await manager.disconnect(acc.schoolId);
          }
        }
      } catch (error) {
        this.options.log?.error(`[pesan] sinkronisasi akun ${acc.schoolId} gagal`, error);
      }
    }
  }
}
