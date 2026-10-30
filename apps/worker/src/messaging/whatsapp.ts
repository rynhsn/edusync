import { type Db, eq, waAccount } from '@edusync/db';
import type { MessageSender, SendResult } from './sender';

/** Bagian klien whatsapp-web.js yang dipakai; memudahkan peniruan di tes. */
export interface WaClient {
  // biome-ignore lint/suspicious/noExplicitAny: pendengar peristiwa whatsapp-web.js bertanda tangan beragam
  on(event: string, listener: (...args: any[]) => void): unknown;
  initialize(): Promise<void>;
  getNumberId(phone: string): Promise<{ _serialized: string } | null>;
  sendMessage(chatId: string, text: string): Promise<unknown>;
  logout(): Promise<void>;
  destroy(): Promise<void>;
  info?: { wid?: { user?: string } };
}

export type WaClientFactory = (schoolId: string) => Promise<WaClient>;

export interface WhatsAppOptions {
  sessionDir?: string | undefined;
  chromePath?: string | undefined;
  /** Untuk tes: ganti pembuatan klien tanpa memuat whatsapp-web.js. */
  factory?: WaClientFactory;
  log?: Pick<Console, 'log' | 'error'>;
}

interface Entry {
  client: WaClient;
  ready: boolean;
}

/** Satu klien WhatsApp Web per sekolah; status ditulis ke wa_account lewat peran platform. */
export class WhatsAppManager implements MessageSender {
  private readonly clients = new Map<string, Entry>();
  private readonly connecting = new Set<string>();
  private readonly log: Pick<Console, 'log' | 'error'>;

  constructor(
    private readonly db: Db,
    private readonly options: WhatsAppOptions = {},
  ) {
    this.log = options.log ?? console;
  }

  has(schoolId: string) {
    return this.clients.has(schoolId) || this.connecting.has(schoolId);
  }

  isReady(schoolId: string) {
    return this.clients.get(schoolId)?.ready === true;
  }

  private async write(schoolId: string, values: Partial<typeof waAccount.$inferInsert>) {
    await this.db
      .update(waAccount)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(waAccount.schoolId, schoolId));
  }

  private async createClient(schoolId: string): Promise<WaClient> {
    if (this.options.factory) return this.options.factory(schoolId);
    // Dinamis agar tes/CI tanpa Chromium tidak memuat puppeteer.
    const mod = await import('whatsapp-web.js');
    const wweb = ((mod as { default?: unknown }).default ?? mod) as typeof mod;
    const { Client, LocalAuth } = wweb;
    return new Client({
      authStrategy: new LocalAuth({
        clientId: schoolId,
        dataPath: this.options.sessionDir ?? './.wa-sessions',
      }),
      puppeteer: {
        headless: true,
        executablePath: this.options.chromePath as string,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    }) as unknown as WaClient;
  }

  /** Mulai (atau abaikan bila sudah jalan) klien sebuah sekolah. */
  async connect(schoolId: string): Promise<void> {
    if (this.has(schoolId)) return;
    if (!this.options.factory && !this.options.chromePath) {
      await this.write(schoolId, { status: 'failed', qr: null, lastError: 'WA_CHROME_PATH belum diatur' });
      return;
    }
    this.connecting.add(schoolId);
    try {
      await this.write(schoolId, { status: 'connecting', qr: null, lastError: null });
      const client = await this.createClient(schoolId);
      const entry: Entry = { client, ready: false };
      this.clients.set(schoolId, entry);
      const safe = (fn: () => Promise<void>) => {
        fn().catch((error) => this.log.error(`[wa] tulis status ${schoolId} gagal`, error));
      };
      // Pendengar milik klien yang sudah diganti/dibuang diabaikan.
      const current = () => this.clients.get(schoolId) === entry;

      client.on('qr', (qr: string) => {
        if (current()) safe(() => this.write(schoolId, { status: 'qr', qr, lastError: null }));
      });
      const connecting = () => {
        if (current()) safe(() => this.write(schoolId, { status: 'connecting', qr: null }));
      };
      client.on('loading_screen', connecting);
      client.on('authenticated', connecting);
      client.on('ready', () => {
        if (!current()) return;
        entry.ready = true;
        const phone = (client.info?.wid?.user ?? '').replace(/\D/g, '') || null;
        safe(() => this.write(schoolId, { status: 'ready', phone, qr: null, lastError: null }));
      });
      client.on('auth_failure', (message: string) => {
        if (!current()) return;
        entry.ready = false;
        this.clients.delete(schoolId);
        safe(() => this.write(schoolId, { status: 'failed', qr: null, lastError: String(message) }));
      });
      client.on('disconnected', () => {
        if (!current()) return;
        entry.ready = false;
        this.clients.delete(schoolId);
        safe(() => this.write(schoolId, { status: 'disconnected', qr: null }));
      });

      // initialize menunggu browser siap; galatnya (mis. Chrome tak ditemukan) dicatat sebagai 'failed'.
      client.initialize().catch((error) => {
        if (!current()) return;
        this.clients.delete(schoolId);
        this.log.error(`[wa] initialize ${schoolId} gagal`, error);
        safe(() =>
          this.write(schoolId, {
            status: 'failed',
            qr: null,
            lastError: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    } catch (error) {
      this.clients.delete(schoolId);
      await this.write(schoolId, {
        status: 'failed',
        qr: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.connecting.delete(schoolId);
    }
  }

  /** Putus: keluar dari perangkat tertaut (sesi tersimpan dihapus) lalu tutup browser. */
  async disconnect(schoolId: string): Promise<void> {
    const entry = this.clients.get(schoolId);
    this.clients.delete(schoolId);
    if (entry) {
      entry.ready = false;
      await entry.client.logout().catch(() => undefined);
      await entry.client.destroy().catch(() => undefined);
    }
    await this.write(schoolId, { status: 'disconnected', qr: null });
  }

  /** Tutup satu klien tanpa logout (sesi tersimpan tetap); status tidak ditulis. */
  async release(schoolId: string): Promise<void> {
    const entry = this.clients.get(schoolId);
    this.clients.delete(schoolId);
    if (entry) {
      entry.ready = false;
      await entry.client.destroy().catch(() => undefined);
    }
  }

  /** Tutup semua browser tanpa logout, agar sesi tersimpan bisa dipakai lagi saat worker menyala. */
  async shutdown(): Promise<void> {
    const entries = [...this.clients.values()];
    this.clients.clear();
    await Promise.all(entries.map((e) => e.client.destroy().catch(() => undefined)));
  }

  async send(schoolId: string, phone: string, text: string): Promise<SendResult> {
    const entry = this.clients.get(schoolId);
    if (!entry?.ready) return { ok: false, retryable: true, error: 'not_ready' };
    try {
      const id = await entry.client.getNumberId(phone);
      if (!id) return { ok: false, retryable: false, error: 'not_on_whatsapp' };
      await entry.client.sendMessage(id._serialized, text);
      return { ok: true };
    } catch (error) {
      return { ok: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
