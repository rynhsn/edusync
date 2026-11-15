import { WA_CAPTION_MAX } from '@edusync/contracts';
import type { Db } from '@edusync/db';
import type { SendAttachment } from './sender';
import type { WaClient } from './whatsapp';

/** Kode putus Baileys (DisconnectReason); ditulis ulang agar modul ini bisa dimuat tanpa Baileys di tes. */
const CODE = {
  loggedOut: 401,
  replaced: 440,
  badSession: 500,
  multideviceMismatch: 411,
  restartRequired: 515,
} as const;

/** Isi pesan Baileys yang dipakai (bagian dari AnyMessageContent); tanpa impor Baileys agar modul ini ringan di tes. */
export type WaContent =
  | { text: string }
  | { image: Buffer; caption?: string }
  | { document: Buffer; mimetype: string; fileName: string; caption?: string };

/** Bagian soket Baileys yang dipakai; memudahkan peniruan di tes. */
export interface WaSocket {
  // biome-ignore lint/suspicious/noExplicitAny: tanda tangan peristiwa beragam
  ev: { on(event: string, listener: (...args: any[]) => void): unknown };
  user?: { id?: string } | undefined;
  onWhatsApp(...jids: string[]): Promise<{ jid: string; exists: boolean }[] | undefined>;
  sendMessage(jid: string, content: WaContent): Promise<unknown>;
  logout(): Promise<void>;
  end(error: Error | undefined): void;
}

export interface AuthHandle {
  state: unknown;
  saveCreds(): Promise<void>;
  clear(): Promise<void>;
}

export interface BaileysClientOptions {
  loadAuth: () => Promise<AuthHandle>;
  createSocket: (auth: AuthHandle) => WaSocket;
  /** Percobaan sambung ulang beruntun sebelum menyerah dan melapor 'disconnected' (AccountSync mencoba lagi nanti). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  log?: Pick<Console, 'error'>;
}

type Listener = (...args: unknown[]) => void;

/**
 * Adaptor Baileys ke kontrak WaClient (peristiwa ala whatsapp-web.js: qr, loading_screen, authenticated, ready,
 * auth_failure, disconnected). Sambung ulang untuk putus sementara ada di sini; logout/penggantian sesi dilaporkan
 * ke manajer. Rate limit WhatsApp muncul sebagai galat kirim biasa dan dicoba ulang oleh antrean dispatcher.
 */
export class BaileysClient implements WaClient {
  info: { wid?: { user?: string } } = {};
  private readonly listeners = new Map<string, Listener[]>();
  private auth: AuthHandle | null = null;
  private sock: WaSocket | null = null;
  private open = false;
  private closed = false;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private credsTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: BaileysClientOptions) {}

  // biome-ignore lint/suspicious/noExplicitAny: sesuai kontrak WaClient
  on(event: string, listener: (...args: any[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }

  async initialize() {
    this.auth = await this.options.loadAuth();
    this.start();
  }

  private start() {
    const auth = this.auth as AuthHandle;
    const sock = this.options.createSocket(auth);
    this.sock = sock;
    // Penyimpanan kredensial berurutan agar snapshot lama tidak menimpa yang baru.
    sock.ev.on('creds.update', () => {
      this.credsTail = this.credsTail
        .catch(() => undefined)
        .then(() => auth.saveCreds())
        .catch((e) =>
          this.options.log?.error('[wa] simpan kredensial gagal', e instanceof Error ? e.message : e),
        );
    });
    sock.ev.on(
      'connection.update',
      (u: { connection?: string; qr?: string; lastDisconnect?: { error?: unknown } }) => {
        if (this.closed || this.sock !== sock) return;
        if (u.qr) this.emit('qr', u.qr);
        if (u.connection === 'open') {
          this.open = true;
          this.retries = 0;
          this.info = { wid: { user: String(sock.user?.id ?? '').split(/[:@]/)[0] ?? '' } };
          this.emit('ready');
        } else if (u.connection === 'close') {
          this.open = false;
          void this.onClose(u.lastDisconnect?.error);
        }
      },
    );
  }

  private async onClose(error: unknown) {
    const code = (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    const reason = error instanceof Error ? error.message : String(error ?? 'koneksi terputus');
    if (code === CODE.loggedOut) {
      // Dikeluarkan dari ponsel: kredensial tak berlaku lagi, buang agar tautan berikutnya bersih.
      this.closed = true;
      await this.auth?.clear().catch(() => undefined);
      this.emit('disconnected', 'LOGOUT');
    } else if (code === CODE.badSession || code === CODE.multideviceMismatch) {
      this.closed = true;
      await this.auth?.clear().catch(() => undefined);
      this.emit('auth_failure', `Sesi WhatsApp tidak valid (${reason}); tautkan ulang dengan QR`);
    } else if (code === CODE.replaced) {
      this.closed = true; // sesi diambil perangkat lain; tidak berebut kembali
      this.emit('disconnected', 'REPLACED');
    } else if (code === CODE.restartRequired) {
      this.restart(0); // wajar setelah pemindaian QR
    } else if (++this.retries > (this.options.maxRetries ?? 8)) {
      this.closed = true;
      this.emit('disconnected', reason);
    } else {
      this.emit('loading_screen');
      const base = this.options.baseDelayMs ?? 1000;
      this.restart(Math.min(base * 2 ** (this.retries - 1), this.options.maxDelayMs ?? 30_000));
    }
  }

  private restart(delayMs: number) {
    this.sock?.end(undefined);
    this.timer = setTimeout(() => {
      if (!this.closed) this.start();
    }, delayMs);
  }

  private ready(): WaSocket {
    if (!this.sock || !this.open) throw new Error('Koneksi WhatsApp belum tersambung');
    return this.sock;
  }

  async getNumberId(phone: string) {
    const [hit] = (await this.ready().onWhatsApp(`${phone.replace(/\D/g, '')}@s.whatsapp.net`)) ?? [];
    return hit?.exists ? { _serialized: hit.jid } : null;
  }

  async sendMessage(chatId: string, text: string, attachment?: SendAttachment) {
    const sock = this.ready();
    if (!attachment) {
      await sock.sendMessage(chatId, { text });
      return;
    }
    // Caption media dibatasi WhatsApp; teks yang lebih panjang dikirim dulu sebagai pesan, lalu berkas tanpa caption.
    const inline = text.length <= WA_CAPTION_MAX;
    if (!inline && text) await sock.sendMessage(chatId, { text });
    const caption = inline && text ? { caption: text } : {};
    await sock.sendMessage(
      chatId,
      attachment.mime === 'application/pdf'
        ? { document: attachment.data, mimetype: attachment.mime, fileName: attachment.fileName, ...caption }
        : { image: attachment.data, ...caption },
    );
  }

  async logout() {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      await this.sock?.logout();
    } finally {
      await this.auth?.clear().catch(() => undefined);
    }
  }

  async destroy() {
    this.closed = true;
    this.open = false;
    clearTimeout(this.timer);
    this.sock?.end(undefined);
    await this.credsTail.catch(() => undefined); // tunggu kredensial terakhir tertulis sebelum worker berhenti
  }
}

/** Rakit klien Baileys sungguhan untuk satu sekolah (dimuat dinamis supaya tes tanpa klien tidak memuat Baileys). */
export async function createBaileysClient(
  db: Db,
  schoolId: string,
  secret: string,
  log?: Pick<Console, 'error'>,
): Promise<BaileysClient> {
  const baileys = await import('@whiskeysockets/baileys');
  const { useDbAuthState } = await import('./wa-auth-state');
  // Logger bisu: Baileys mencatat detail protokol yang tidak boleh masuk log (kredensial, nomor).
  const silent = {
    level: 'silent',
    child: () => silent,
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  return new BaileysClient({
    ...(log ? { log } : {}),
    loadAuth: () => useDbAuthState(db, schoolId, secret),
    createSocket: (auth) => {
      const { state } = auth as unknown as Awaited<ReturnType<typeof useDbAuthState>>;
      return baileys.default({
        auth: { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore(state.keys, silent) },
        logger: silent,
        browser: baileys.Browsers.appropriate('Edusync'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      }) as unknown as WaSocket;
    },
  });
}
