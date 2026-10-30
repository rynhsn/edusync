import { EventEmitter } from 'node:events';
import { eq, waAccount } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountSync, type PlatformMessagingSettings } from './account-sync';
import { createFixture } from './test-helpers';
import { type WaClient, WhatsAppManager } from './whatsapp';

const fx = createFixture('sync');
const on: PlatformMessagingSettings = { enabled: true, provider: 'log', maxQueuedPerSchool: 500 };

const account = async (id: string) => {
  const [a] = await fx.db.select().from(waAccount).where(eq(waAccount.schoolId, id));
  return a as typeof waAccount.$inferSelect;
};

beforeAll(fx.init);
afterAll(fx.cleanup);

describe('AccountSync mode log', () => {
  it('on menjadi ready (nomor 0000), off menjadi disconnected', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const sync = new AccountSync(fx.db, { mode: 'log', getPlatform: async () => on, schoolIds: [sid] });
    await sync.tick();
    const ready = await account(sid);
    expect(ready.status).toBe('ready');
    expect(ready.phone).toBe('0000');

    await fx.db.update(waAccount).set({ desiredState: 'off' }).where(eq(waAccount.schoolId, sid));
    await sync.tick();
    expect((await account(sid)).status).toBe('disconnected');
  });

  it('saklar global mati: tidak disambungkan dan ditulis disconnected', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'ready' } });
    const sync = new AccountSync(fx.db, {
      mode: 'log',
      getPlatform: async () => ({ ...on, enabled: false }),
      schoolIds: [sid],
    });
    await sync.tick();
    expect((await account(sid)).status).toBe('disconnected');
  });
});

/** Klien WhatsApp tiruan: peristiwa dipancarkan tes. */
class FakeClient extends EventEmitter implements WaClient {
  info = { wid: { user: '628111222333' } };
  registered = new Set(['6281234567890']);
  sent: { chat: string; text: string }[] = [];
  loggedOut = false;
  destroyed = false;
  initialize = async () => undefined;
  getNumberId = async (phone: string) =>
    this.registered.has(phone) ? { _serialized: `${phone}@c.us` } : null;
  sendMessage = async (chat: string, text: string) => {
    this.sent.push({ chat, text });
  };
  logout = async () => {
    this.loggedOut = true;
  };
  destroy = async () => {
    this.destroyed = true;
  };
}

describe('WhatsAppManager (klien tiruan)', () => {
  it('peristiwa klien ditulis ke wa_account', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    await manager.connect(sid);
    expect((await account(sid)).status).toBe('connecting');
    const settle = () => new Promise((r) => setTimeout(r, 100));

    client.emit('qr', 'KODE-QR');
    await settle();
    expect(await account(sid)).toMatchObject({ status: 'qr', qr: 'KODE-QR' });

    client.emit('authenticated');
    await settle();
    expect(await account(sid)).toMatchObject({ status: 'connecting', qr: null });

    client.emit('ready');
    await settle();
    expect(await account(sid)).toMatchObject({ status: 'ready', phone: '628111222333', qr: null });
    expect(manager.isReady(sid)).toBe(true);

    client.emit('disconnected', 'LOGOUT');
    await settle();
    expect((await account(sid)).status).toBe('disconnected');
    expect(manager.isReady(sid)).toBe(false);
  });

  it('auth_failure ditulis sebagai failed dengan lastError', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    await manager.connect(sid);
    client.emit('auth_failure', 'sesi rusak');
    await new Promise((r) => setTimeout(r, 100));
    expect(await account(sid)).toMatchObject({ status: 'failed', lastError: 'sesi rusak' });
  });

  it('send: not_ready, not_on_whatsapp, lalu berhasil', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    expect(await manager.send(sid, '6281234567890', 'x')).toEqual({
      ok: false,
      retryable: true,
      error: 'not_ready',
    });
    await manager.connect(sid);
    expect((await manager.send(sid, '6281234567890', 'x')).ok).toBe(false); // belum ready
    client.emit('ready');
    expect(await manager.send(sid, '6289999999999', 'x')).toEqual({
      ok: false,
      retryable: false,
      error: 'not_on_whatsapp',
    });
    expect(await manager.send(sid, '6281234567890', 'Halo')).toEqual({ ok: true });
    expect(client.sent).toEqual([{ chat: '6281234567890@c.us', text: 'Halo' }]);
  });

  it('galat kirim dari klien dianggap retryable', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    client.sendMessage = async () => {
      throw new Error('Protocol error');
    };
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    await manager.connect(sid);
    client.emit('ready');
    expect(await manager.send(sid, '6281234567890', 'x')).toEqual({
      ok: false,
      retryable: true,
      error: 'Protocol error',
    });
  });

  it('tanpa WA_CHROME_PATH: failed dengan pesan yang jelas', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const manager = new WhatsAppManager(fx.db, {});
    await manager.connect(sid);
    expect(await account(sid)).toMatchObject({ status: 'failed', lastError: 'WA_CHROME_PATH belum diatur' });
  });
});

describe('AccountSync mode whatsapp', () => {
  it('on menyambung, off logout + destroy, dan saklar global mati melepas tanpa logout', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    let platform = on;
    const sync = new AccountSync(fx.db, {
      mode: 'whatsapp',
      manager,
      getPlatform: async () => platform,
      schoolIds: [sid],
    });
    await sync.tick();
    expect(manager.has(sid)).toBe(true);
    expect((await account(sid)).status).toBe('connecting');
    client.emit('ready');
    await new Promise((r) => setTimeout(r, 100));
    expect((await account(sid)).status).toBe('ready');

    await fx.db.update(waAccount).set({ desiredState: 'off' }).where(eq(waAccount.schoolId, sid));
    await sync.tick();
    expect(client.loggedOut).toBe(true);
    expect(client.destroyed).toBe(true);
    expect(manager.has(sid)).toBe(false);
    expect(await account(sid)).toMatchObject({ status: 'disconnected', qr: null });

    // Saklar global mati: klien baru dilepas tanpa logout.
    const client2 = new FakeClient();
    const manager2 = new WhatsAppManager(fx.db, { factory: async () => client2 });
    await fx.db.update(waAccount).set({ desiredState: 'on' }).where(eq(waAccount.schoolId, sid));
    const sync2 = new AccountSync(fx.db, {
      mode: 'whatsapp',
      manager: manager2,
      getPlatform: async () => platform,
      schoolIds: [sid],
    });
    await sync2.tick();
    expect(manager2.has(sid)).toBe(true);
    platform = { ...on, enabled: false };
    await sync2.tick();
    expect(client2.destroyed).toBe(true);
    expect(client2.loggedOut).toBe(false);
    expect((await account(sid)).status).toBe('disconnected');
  });
});
