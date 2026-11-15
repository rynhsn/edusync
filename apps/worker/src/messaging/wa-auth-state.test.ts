import { eq, sql, waAuthState } from '@edusync/db';
import { initAuthCreds } from '@whiskeysockets/baileys';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixture } from './test-helpers';
import { useDbAuthState } from './wa-auth-state';

const fx = createFixture('waauth');
const SECRET = 'rahasia-uji-minimal-32-karakter-aaaa';

beforeAll(fx.init);
afterAll(fx.cleanup);

const rows = (id: string) => fx.db.select().from(waAuthState).where(eq(waAuthState.schoolId, id));

describe('useDbAuthState', () => {
  it('kredensial dan kunci bertahan antar-muat, terenkripsi di basis data, terpisah per sekolah', async () => {
    const a = await fx.newSchool({ account: null });
    const b = await fx.newSchool({ account: null });
    const first = await useDbAuthState(fx.db, a, SECRET);
    const originalNoise = Buffer.from(first.state.creds.noiseKey.public).toString('hex');
    await first.saveCreds();
    await first.state.keys.set({
      'pre-key': { '7': { public: Buffer.from('pub-key-bytes'), private: Buffer.from('priv-key-bytes') } },
      session: { 'x.0': Buffer.from('sesi-rahasia') },
    });

    const stored = await rows(a);
    expect(stored.map((r) => r.key).sort()).toEqual(['creds', 'pre-key:7', 'session:x.0']);
    for (const r of stored) {
      expect(r.value.startsWith('v1.')).toBe(true);
      expect(r.value).not.toContain('sesi-rahasia');
    }

    const second = await useDbAuthState(fx.db, a, SECRET);
    expect(Buffer.from(second.state.creds.noiseKey.public).toString('hex')).toBe(originalNoise);
    const got = await second.state.keys.get('pre-key', ['7', '8']);
    expect(Buffer.from(got['7']?.private ?? []).toString()).toBe('priv-key-bytes');
    expect(got['8']).toBeUndefined();
    expect(
      Buffer.from((await second.state.keys.get('session', ['x.0']))['x.0'] as Uint8Array).toString(),
    ).toBe('sesi-rahasia');

    // Sekolah lain tidak melihat apa pun; sekolah lain mendapat kredensial baru.
    const other = await useDbAuthState(fx.db, b, SECRET);
    expect(Buffer.from(other.state.creds.noiseKey.public).toString('hex')).not.toBe(originalNoise);
    expect(await other.state.keys.get('session', ['x.0'])).toEqual({});

    // null menghapus kunci.
    await second.state.keys.set({ session: { 'x.0': null } });
    expect(await second.state.keys.get('session', ['x.0'])).toEqual({});
  });

  it('rahasia berbeda: sesi tak terbaca dibuang dan dimulai baru', async () => {
    const id = await fx.newSchool({ account: null });
    const s = await useDbAuthState(fx.db, id, SECRET);
    await s.saveCreds();
    await s.state.keys.set({ session: { y: Buffer.from('z') } });
    const fresh = await useDbAuthState(fx.db, id, 'rahasia-lain-minimal-32-karakter-bbbbb');
    expect(fresh.state.creds.registered).toBe(initAuthCreds().registered);
    expect(await rows(id)).toEqual([]);
  });

  it('clear menghapus semua baris sekolah; peran aplikasi tidak punya akses tabel', async () => {
    const id = await fx.newSchool({ account: null });
    const s = await useDbAuthState(fx.db, id, SECRET);
    await s.saveCreds();
    await s.clear();
    expect(await rows(id)).toEqual([]);
    const res = await fx.db.execute<{ ok: boolean }>(
      sql`select has_table_privilege('edusync_app', 'wa_auth_state', 'SELECT') as ok`,
    );
    expect(res.rows[0]?.ok).toBe(false);
  });
});
