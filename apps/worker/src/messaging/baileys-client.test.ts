import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { type AuthHandle, BaileysClient, type WaSocket } from './baileys-client';

class FakeSocket implements WaSocket {
  ev = new EventEmitter();
  user = { id: '628111222333:12@s.whatsapp.net' };
  ended = false;
  loggedOut = false;
  sent: { jid: string; text: string }[] = [];
  registered = new Set(['6281234567890@s.whatsapp.net']);
  onWhatsApp = async (jid: string) => [{ jid, exists: this.registered.has(jid) }];
  sendMessage = async (jid: string, c: { text: string }) => {
    this.sent.push({ jid, text: c.text });
  };
  logout = async () => {
    this.loggedOut = true;
  };
  end = () => {
    this.ended = true;
  };
  update(u: object) {
    this.ev.emit('connection.update', u);
  }
}

const boom = (statusCode: number) =>
  Object.assign(new Error(`kode ${statusCode}`), { output: { statusCode } });
const WA = '6281234567890@s.whatsapp.net';

function setup(options: { maxRetries?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const auth = {
    state: {},
    saveCreds: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  } satisfies AuthHandle;
  const client = new BaileysClient({
    loadAuth: async () => auth,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    baseDelayMs: 1,
    maxDelayMs: 2,
    ...options,
  });
  const events: string[] = [];
  for (const e of ['qr', 'loading_screen', 'ready', 'disconnected', 'auth_failure']) {
    client.on(e, (...a: unknown[]) => events.push([e, ...a].join(':')));
  }
  return { client, sockets, auth, events };
}

describe('BaileysClient (soket tiruan)', () => {
  it('QR lalu open: qr, ready, nomor tanpa suffix perangkat; kirim dan cek nomor', async () => {
    const { client, sockets, events } = setup();
    await client.initialize();
    sockets[0]?.update({ qr: 'KODE-QR' });
    sockets[0]?.update({ connection: 'open' });
    expect(events).toEqual(['qr:KODE-QR', 'ready']);
    expect(client.info.wid?.user).toBe('628111222333');
    expect(await client.getNumberId('+62 812-3456-7890')).toEqual({ _serialized: WA });
    expect(await client.getNumberId('6289999999999')).toBeNull();
    await client.sendMessage(WA, 'Halo');
    expect(sockets[0]?.sent).toEqual([{ jid: WA, text: 'Halo' }]);
  });

  it('kirim sebelum tersambung ditolak (dianggap retryable oleh manajer)', async () => {
    const { client } = setup();
    await client.initialize();
    await expect(client.sendMessage(WA, 'a')).rejects.toThrow('belum tersambung');
  });

  it('creds.update disimpan berurutan', async () => {
    const { client, sockets, auth } = setup();
    await client.initialize();
    sockets[0]?.ev.emit('creds.update', {});
    sockets[0]?.ev.emit('creds.update', {});
    await client.destroy();
    expect(auth.saveCreds).toHaveBeenCalledTimes(2);
  });

  it('restartRequired dan putus sementara menyambung ulang tanpa melapor disconnected', async () => {
    const { client, sockets, events } = setup();
    await client.initialize();
    sockets[0]?.update({ connection: 'close', lastDisconnect: { error: boom(515) } });
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    sockets[1]?.update({ connection: 'open' });
    sockets[1]?.update({ connection: 'close', lastDisconnect: { error: boom(428) } });
    await vi.waitFor(() => expect(sockets.length).toBe(3));
    expect(events).toEqual(['ready', 'loading_screen']);
    expect(sockets[0]?.ended).toBe(true);
    // Peristiwa dari soket lama diabaikan.
    sockets[0]?.update({ connection: 'open' });
    expect(events).toEqual(['ready', 'loading_screen']);
  });

  it('menyerah setelah batas percobaan: disconnected', async () => {
    const { client, sockets, events } = setup({ maxRetries: 1 });
    await client.initialize();
    sockets[0]?.update({ connection: 'close', lastDisconnect: { error: boom(408) } });
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    sockets[1]?.update({ connection: 'close', lastDisconnect: { error: boom(408) } });
    await vi.waitFor(() => expect(events.at(-1)).toBe('disconnected:kode 408'));
    expect(sockets.length).toBe(2);
  });

  it('logged out dari ponsel: kredensial dihapus dan disconnected dilaporkan tanpa sambung ulang', async () => {
    const { client, sockets, auth, events } = setup();
    await client.initialize();
    sockets[0]?.update({ connection: 'open' });
    sockets[0]?.update({ connection: 'close', lastDisconnect: { error: boom(401) } });
    await vi.waitFor(() => expect(events.at(-1)).toBe('disconnected:LOGOUT'));
    expect(auth.clear).toHaveBeenCalled();
    expect(sockets.length).toBe(1);
  });

  it('sesi diganti perangkat lain dan sesi rusak tidak disambung ulang', async () => {
    const a = setup();
    await a.client.initialize();
    a.sockets[0]?.update({ connection: 'close', lastDisconnect: { error: boom(440) } });
    await vi.waitFor(() => expect(a.events).toEqual(['disconnected:REPLACED']));
    expect(a.auth.clear).not.toHaveBeenCalled();

    const b = setup();
    await b.client.initialize();
    b.sockets[0]?.update({ connection: 'close', lastDisconnect: { error: boom(500) } });
    await vi.waitFor(() => expect(b.events[0]).toMatch(/^auth_failure:/));
    expect(b.auth.clear).toHaveBeenCalled();
  });

  it('logout() memanggil soket dan membuang kredensial; destroy() tidak membuangnya', async () => {
    const a = setup();
    await a.client.initialize();
    await a.client.logout();
    expect(a.sockets[0]?.loggedOut).toBe(true);
    expect(a.auth.clear).toHaveBeenCalled();

    const b = setup();
    await b.client.initialize();
    await b.client.destroy();
    expect(b.sockets[0]?.ended).toBe(true);
    expect(b.auth.clear).not.toHaveBeenCalled();
  });
});
