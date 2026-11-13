import { EventEmitter } from 'node:events';
import { eq, waAccount } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountSync, type PlatformMessagingSettings } from './account-sync';
import { createFixture } from './test-helpers';
import { type WaClient, WhatsAppManager } from './whatsapp';

const fx = createFixture('sync');
const on: PlatformMessagingSettings = { enabled: true, provider: 'log', maxQueuedPerSchool: 500 };

const account = async (id: string) => {
  const [a] = await fx.db.select().from(waAccount).where(eq(waAccount.schoolId, id));
  return a as typeof waAccount.$inferSelect;
};

/** Pendengar klien menulis tanpa ditunggu: tunggu sampai wa_account memenuhi kondisi, bukan jeda tetap. */
const waitAccount = (id: string, expected: Partial<typeof waAccount.$inferSelect>) =>
  vi.waitFor(async () => expect(await account(id)).toMatchObject(expected), {
    timeout: 10_000,
    interval: 25,
  });

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

describe('AccountSync tanpa kunci env: mengikuti penyedia di konsol platform', () => {
  it('provider log: akun siap (0000); beralih ke whatsapp menyambungkan klien; kembali ke log melepasnya', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    let created = 0;
    const manager = new WhatsAppManager(fx.db, {
      factory: async () => {
        created++;
        return new FakeClient();
      },
    });
    let provider: 'log' | 'whatsapp' = 'log';
    const sync = new AccountSync(fx.db, {
      mode: undefined,
      manager,
      getPlatform: async () => ({ ...on, provider }),
      schoolIds: [sid],
    });
    await sync.tick();
    expect(await account(sid)).toMatchObject({ status: 'ready', phone: '0000' });
    expect(created).toBe(0);

    provider = 'whatsapp';
    await sync.tick();
    expect(created).toBe(1);
    expect(manager.has(sid)).toBe(true);

    provider = 'log';
    await sync.tick();
    expect(manager.has(sid)).toBe(false);
    expect((await account(sid)).status).toBe('ready');
  });

  it('env mengunci: pilihan platform diabaikan', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const sync = new AccountSync(fx.db, {
      mode: 'log',
      getPlatform: async () => ({ ...on, provider: 'whatsapp' }),
      schoolIds: [sid],
    });
    await sync.tick();
    expect(await account(sid)).toMatchObject({ status: 'ready', phone: '0000' });
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

    client.emit('qr', 'KODE-QR');
    await waitAccount(sid, { status: 'qr', qr: 'KODE-QR' });

    client.emit('authenticated');
    await waitAccount(sid, { status: 'connecting', qr: null });

    client.emit('ready');
    await waitAccount(sid, { status: 'ready', phone: '628111222333', qr: null });
    expect(manager.isReady(sid)).toBe(true);

    client.emit('disconnected', 'LOGOUT');
    await waitAccount(sid, { status: 'disconnected' });
    expect(manager.isReady(sid)).toBe(false);
  });

  it('penulisan status berurutan: ready yang lambat tidak menimpa disconnected', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    await manager.connect(sid);
    // Meniru DB lambat: UPDATE berstatus 'ready' selesai belakangan dari UPDATE sesudahnya.
    const real = fx.db;
    const slow = {
      update: (table: typeof waAccount) => ({
        set: (values: Partial<typeof waAccount.$inferInsert>) => ({
          where: async (cond: Parameters<ReturnType<ReturnType<typeof real.update>['set']>['where']>[0]) => {
            if (values.status === 'ready') await new Promise((r) => setTimeout(r, 150));
            return real.update(table).set(values).where(cond);
          },
        }),
      }),
    };
    (manager as unknown as { db: unknown }).db = slow;
    client.emit('ready');
    client.emit('disconnected', 'LOGOUT');
    await waitAccount(sid, { status: 'disconnected' });
    await new Promise((r) => setTimeout(r, 400)); // beri kesempatan UPDATE lambat menimpa bila urutan salah
    expect((await account(sid)).status).toBe('disconnected');
  });

  it('batas klien: sambungan di atas batas ditolak dengan failed, tanpa membuat klien', async () => {
    const a = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const b = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    let created = 0;
    const manager = new WhatsAppManager(fx.db, {
      maxClients: 1,
      factory: async () => {
        created++;
        return new FakeClient();
      },
    });
    await manager.connect(a);
    await manager.connect(b);
    expect(created).toBe(1);
    expect((await account(a)).status).toBe('connecting');
    const second = await account(b);
    expect(second.status).toBe('failed');
    expect(second.lastError).toContain('Batas 1 klien');
    expect(manager.has(b)).toBe(false);
  });

  it('auth_failure ditulis sebagai failed dengan lastError', async () => {
    const sid = await fx.newSchool({ account: { desiredState: 'on', status: 'disconnected' } });
    const client = new FakeClient();
    const manager = new WhatsAppManager(fx.db, { factory: async () => client });
    await manager.connect(sid);
    client.emit('auth_failure', 'sesi rusak');
    await waitAccount(sid, { status: 'failed', lastError: 'sesi rusak' });
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
    await waitAccount(sid, { status: 'ready' });

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
