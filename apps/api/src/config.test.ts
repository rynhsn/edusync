import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const base = { ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' };

describe('APP_DOMAIN', () => {
  it('bawaan lokal adalah localhost:3000', () => {
    const rest = Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'APP_DOMAIN'));
    expect(loadEnv(rest).APP_DOMAIN).toBe('localhost:3000');
  });

  it('menerima domain dengan atau tanpa port, dan menyeragamkan huruf kecil', () => {
    expect(loadEnv({ ...base, APP_DOMAIN: 'Edusync.ID' }).APP_DOMAIN).toBe('edusync.id');
    expect(loadEnv({ ...base, APP_DOMAIN: 'sekolahku.co.id' }).APP_DOMAIN).toBe('sekolahku.co.id');
    expect(loadEnv({ ...base, APP_DOMAIN: 'localhost:3000' }).APP_DOMAIN).toBe('localhost:3000');
  });

  it('menolak skema, path, dan spasi', () => {
    for (const bad of ['https://edusync.id', 'edusync.id/platform', 'edu sync.id', '.edusync.id', '']) {
      expect(() => loadEnv({ ...base, APP_DOMAIN: bad }), bad).toThrow(/APP_DOMAIN/);
    }
  });
});

describe('GET /v1/config', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(loadEnv({ ...base, APP_DOMAIN: 'contoh.id' }));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('mengembalikan domain dasar tanpa perlu login', async () => {
    const res = await app.inject('/v1/config');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ baseDomain: 'contoh.id' });
  });
});
