import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BACKOFF_MS, Dispatcher, sendWindow } from './dispatcher';
import { FakeSender } from './sender';
import { createFixture } from './test-helpers';

const fx = createFixture('disp');
const NOW = new Date('2026-11-04T03:00:00Z'); // Rabu 10:00 Jakarta, di dalam jendela 06:00-20:00
const platformOn = async () => ({ enabled: true, provider: 'log' as const, maxQueuedPerSchool: 500 });

function make(
  sender: FakeSender,
  clock: { now: Date },
  extra: { random?: () => number; enabled?: boolean } = {},
) {
  return new Dispatcher(fx.db, sender, {
    getPlatform: async () => ({ ...(await platformOn()), enabled: extra.enabled ?? true }),
    now: () => clock.now,
    random: extra.random ?? (() => 0),
    schoolIds: fx.schoolIds.slice(base),
  });
}

let base = 0;
beforeAll(fx.init);
beforeEach(() => {
  base = fx.schoolIds.length;
});
afterAll(fx.cleanup);

describe('sendWindow', () => {
  it('di dalam jendela', () => {
    expect(sendWindow(NOW, '06:00', '20:00')).toEqual({ open: true });
  });
  it('sesudah jendela: awal jendela esok hari', () => {
    const r = sendWindow(new Date('2026-11-04T14:00:00Z'), '06:00', '20:00'); // 21:00 Jakarta
    expect(r).toEqual({ open: false, nextStart: new Date('2026-11-04T23:00:00Z') });
  });
  it('sebelum jendela: awal jendela hari yang sama', () => {
    const r = sendWindow(new Date('2026-11-04T20:00:00Z'), '06:00', '20:00'); // 03:00 Jakarta 5 Nov
    expect(r).toEqual({ open: false, nextStart: new Date('2026-11-04T23:00:00Z') });
  });
});

describe('Dispatcher', () => {
  it('mengirim lalu menandai sent dengan sent_at', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid, { toPhone: '6281200000001', body: 'Halo' });
    const sender = new FakeSender();
    expect(await make(sender, { now: NOW }).tick()).toBe(1);
    expect(sender.calls).toEqual([{ schoolId: sid, phone: '6281200000001', text: 'Halo' }]);
    const after = await fx.getMessage(m.id);
    expect(after.status).toBe('sent');
    expect(after.attempts).toBe(1);
    expect(after.sentAt).toBeInstanceOf(Date);
  });

  it('pesan yang belum waktunya (not_before) tidak dikirim', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid, { notBefore: new Date(NOW.getTime() + 60_000) });
    const sender = new FakeSender();
    await make(sender, { now: NOW }).tick();
    expect(sender.calls).toHaveLength(0);
    expect((await fx.getMessage(m.id)).status).toBe('queued');
  });

  it('klaim atomik: dua dispatcher paralel tidak mengirim ganda', async () => {
    const sid = await fx.newSchool();
    await fx.addMessage(sid, { body: 'A' });
    await fx.addMessage(sid, { body: 'B' });
    const sender = new FakeSender();
    sender.delayMs = 150;
    const a = make(sender, { now: NOW });
    const b = make(sender, { now: NOW });
    await Promise.all([a.tick(), b.tick()]);
    const texts = sender.calls.map((c) => c.text).sort();
    expect(texts).toEqual(['A', 'B']); // masing-masing tepat sekali
    const rows = await fx.messagesOf(sid);
    expect(rows.every((r) => r.status === 'sent' && r.attempts === 1)).toBe(true);

    // Satu pesan, dua dispatcher: hanya satu pengiriman.
    const sid2 = await fx.newSchool();
    await fx.addMessage(sid2, { body: 'Tunggal' });
    const sender2 = new FakeSender();
    sender2.delayMs = 150;
    await Promise.all([make(sender2, { now: NOW }).tick(), make(sender2, { now: NOW }).tick()]);
    expect(sender2.calls).toHaveLength(1);
  });

  it('gagal retryable: backoff 1m, 5m, 30m, 2j lalu failed pada percobaan ke-5', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid);
    const sender = new FakeSender();
    sender.fallback = { ok: false, retryable: true, error: 'timeout' };
    const clock = { now: NOW };
    const d = make(sender, clock);

    for (let attempt = 1; attempt <= 4; attempt++) {
      await d.tick();
      const row = await fx.getMessage(m.id);
      expect(row.status).toBe('queued');
      expect(row.attempts).toBe(attempt);
      expect(row.detail).toBe('timeout');
      const wait = BACKOFF_MS[attempt - 1] as number;
      expect(row.notBefore.getTime()).toBe(clock.now.getTime() + wait);
      // Sebelum waktunya tidak dikirim lagi.
      const before = sender.calls.length;
      clock.now = new Date(clock.now.getTime() + wait - 1000);
      await d.tick();
      expect(sender.calls.length).toBe(before);
      clock.now = new Date(clock.now.getTime() + 1000);
    }
    await d.tick(); // percobaan ke-5
    const last = await fx.getMessage(m.id);
    expect(last.status).toBe('failed');
    expect(last.attempts).toBe(5);
    expect(last.detail).toBe('timeout');
    expect(sender.calls).toHaveLength(5);
  });

  it('nomor tak terdaftar WhatsApp: failed tanpa retry', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid);
    const sender = new FakeSender().program({ ok: false, retryable: false, error: 'not_on_whatsapp' });
    await make(sender, { now: NOW }).tick();
    const row = await fx.getMessage(m.id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(1);
    expect(row.detail).toBe('not_on_whatsapp');
  });

  it('klien melapor not_ready: kembali antre tanpa menambah percobaan', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid);
    const sender = new FakeSender().program({ ok: false, retryable: true, error: 'not_ready' });
    await make(sender, { now: NOW }).tick();
    const row = await fx.getMessage(m.id);
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(0);
  });

  it('akun tidak ready menahan pesan tanpa menambah percobaan; yang lebih tua dari 24 jam kedaluwarsa', async () => {
    const sid = await fx.newSchool({ account: { status: 'connecting' } });
    const fresh = await fx.addMessage(sid, { createdAt: new Date(NOW.getTime() - 3_600_000) });
    const old = await fx.addMessage(sid, { createdAt: new Date(NOW.getTime() - 25 * 3_600_000) });
    const sender = new FakeSender();
    await make(sender, { now: NOW }).tick();
    expect(sender.calls).toHaveLength(0);
    const f = await fx.getMessage(fresh.id);
    expect(f.status).toBe('queued');
    expect(f.attempts).toBe(0);
    const o = await fx.getMessage(old.id);
    expect(o.status).toBe('skipped');
    expect(o.detail).toBe('expired');
  });

  it('sekolah tanpa akun WhatsApp diperlakukan sebagai tidak ready', async () => {
    const sid = await fx.newSchool({ account: null });
    const m = await fx.addMessage(sid, { createdAt: new Date(NOW.getTime() - 3_600_000) });
    const sender = new FakeSender();
    await make(sender, { now: NOW }).tick();
    expect(sender.calls).toHaveLength(0);
    expect((await fx.getMessage(m.id)).status).toBe('queued');
  });

  it('di luar jendela waktu: ditahan sampai awal jendela berikutnya', async () => {
    const sid = await fx.newSchool({ setting: { windowStart: '06:00', windowEnd: '20:00' } });
    const m = await fx.addMessage(sid);
    const sender = new FakeSender();
    const night = new Date('2026-11-04T14:00:00Z'); // 21:00 Jakarta
    await make(sender, { now: night }).tick();
    expect(sender.calls).toHaveLength(0);
    const row = await fx.getMessage(m.id);
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(0);
    expect(row.notBefore).toEqual(new Date('2026-11-04T23:00:00Z'));
    // Begitu jendela terbuka, terkirim.
    await make(sender, { now: new Date('2026-11-04T23:00:00Z') }).tick();
    expect((await fx.getMessage(m.id)).status).toBe('sent');
  });

  it('pengaturan sekolah mati atau tanpa baris: skipped disabled', async () => {
    const off = await fx.newSchool({ setting: { enabled: false } });
    const none = await fx.newSchool({ setting: null });
    const a = await fx.addMessage(off);
    const b = await fx.addMessage(none);
    const sender = new FakeSender();
    await make(sender, { now: NOW }).tick();
    expect(sender.calls).toHaveLength(0);
    for (const m of [a, b]) {
      const row = await fx.getMessage(m.id);
      expect(row.status).toBe('skipped');
      expect(row.detail).toBe('disabled');
    }
  });

  it('saklar global mati: pesan dibiarkan queued', async () => {
    const sid = await fx.newSchool();
    const m = await fx.addMessage(sid);
    const sender = new FakeSender();
    expect(await make(sender, { now: NOW }, { enabled: false }).tick()).toBe(0);
    expect(sender.calls).toHaveLength(0);
    const row = await fx.getMessage(m.id);
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(0);
  });

  it('jeda acak per sekolah antara delayMin dan delayMax', async () => {
    const sid = await fx.newSchool({ setting: { delayMinSeconds: 10, delayMaxSeconds: 20 } });
    await fx.addMessage(sid, { body: 'satu' });
    await fx.addMessage(sid, { body: 'dua' });
    const sender = new FakeSender();
    const clock = { now: NOW };
    const d = make(sender, clock, { random: () => 0.5 }); // jeda 15 detik
    await d.tick();
    expect(sender.calls.map((c) => c.text)).toEqual(['satu']);
    clock.now = new Date(NOW.getTime() + 14_000);
    await d.tick();
    expect(sender.calls).toHaveLength(1);
    clock.now = new Date(NOW.getTime() + 15_000);
    await d.tick();
    expect(sender.calls.map((c) => c.text)).toEqual(['satu', 'dua']);
  });

  it('sekolah dibagi adil: tiap sekolah mendapat satu pesan per putaran', async () => {
    const a = await fx.newSchool();
    const b = await fx.newSchool();
    await fx.addMessage(a, { body: 'a1' });
    await fx.addMessage(a, { body: 'a2' });
    await fx.addMessage(b, { body: 'b1' });
    const sender = new FakeSender();
    expect(await make(sender, { now: NOW }).tick()).toBe(2);
    expect(sender.calls.map((c) => c.text).sort()).toEqual(['a1', 'b1']);
  });
});
