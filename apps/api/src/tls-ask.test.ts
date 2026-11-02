import { eq, foundation, school } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let base = '';

const ask = (domain: string, remoteAddress = '127.0.0.1') =>
  app.inject({ method: 'GET', url: `/internal/tls-ask?domain=${encodeURIComponent(domain)}`, remoteAddress });

beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', APP_DOMAIN: '10-1-2-3.sslip.io' });
  base = env.APP_DOMAIN;
  app = await buildApp(env);
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Lembaga TLS', slug: `tls-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `tls-${run}`, name: 'Sekolah TLS' })
    .returning();
  schoolId = s!.id;
});

afterAll(async () => {
  await app.platformDb.delete(school).where(eq(school.id, schoolId));
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  await app.close();
});

describe('pemeriksa sertifikat HTTPS per host', () => {
  it('mengizinkan alamat utama dan subdomain sekolah yang ada', async () => {
    expect((await ask(base)).statusCode).toBe(200);
    expect((await ask(`tls-${run}.${base}`)).statusCode).toBe(200);
  });

  it('menolak sekolah yang tidak ada, nama aneh, domain lain, dan host kosong', async () => {
    expect((await ask(`tidak-ada-${run}.${base}`)).statusCode).toBe(404);
    expect((await ask(`a.b.${base}`)).statusCode).toBe(404);
    expect((await ask(`-x.${base}`)).statusCode).toBe(404);
    expect((await ask('contoh.com')).statusCode).toBe(404);
    expect((await ask('')).statusCode).toBe(404);
  });

  it('hanya bisa dipanggil dari mesin yang sama', async () => {
    expect((await ask(base, '203.0.113.7')).statusCode).toBe(403);
  });
});
