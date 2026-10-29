import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('API', () => {
  it('/health menjawab ok', async () => {
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('/ready memeriksa database', async () => {
    const res = await app.inject('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('OpenAPI dibuat otomatis dari skema route', async () => {
    const spec = (await app.inject('/openapi.json')).json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/health', '/ready']));
    expect(spec.paths['/health'].get.summary).toBe('Cek proses hidup');
  });

  it('konfigurasi salah ditolak saat start', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
  });
});
