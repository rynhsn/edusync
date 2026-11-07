import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { trustProxyFor } from './proxy-trust';

const DEFAULT = 'loopback,linklocal,uniquelocal';

async function ipSeenBy(trust: string, headers: Record<string, string>, remote = '127.0.0.1') {
  const app = Fastify({ trustProxy: trustProxyFor({ TRUST_PROXY: trust }) });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  const res = await app.inject({ url: '/ip', headers, remoteAddress: remote });
  await app.close();
  return res.json().ip as string;
}

describe('trustProxy', () => {
  it('bawaan env adalah alamat lokal/privat; off atau kosong mematikan', () => {
    const base = {
      DATABASE_URL: 'postgres://x',
      DATABASE_PLATFORM_URL: 'postgres://x',
      AUTH_SECRET: 'x'.repeat(32),
    };
    expect(loadEnv(base as NodeJS.ProcessEnv).TRUST_PROXY).toBe(DEFAULT);
    expect(trustProxyFor({ TRUST_PROXY: 'off' })).toBe(false);
    expect(trustProxyFor({ TRUST_PROXY: '' })).toBe(false);
    expect(trustProxyFor({ TRUST_PROXY: DEFAULT })).toBe(DEFAULT);
  });

  it('Next lokal di depan API: IP klien = isi x-forwarded-for dari Caddy, bukan IP Next', async () => {
    expect(await ipSeenBy(DEFAULT, { 'x-forwarded-for': '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('Next di jaringan docker (privat) juga dipercaya', async () => {
    expect(await ipSeenBy(DEFAULT, { 'x-forwarded-for': '203.0.113.7' }, '172.18.0.5')).toBe('203.0.113.7');
  });

  it('entri palsu yang disisipkan klien di kiri diabaikan', async () => {
    expect(await ipSeenBy(DEFAULT, { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })).toBe('203.0.113.7');
  });

  it('penyambung publik tidak dipercaya: header palsunya diabaikan', async () => {
    expect(await ipSeenBy(DEFAULT, { 'x-forwarded-for': '1.1.1.1' }, '198.51.100.9')).toBe('198.51.100.9');
  });

  it('dimatikan: header diabaikan dan IP penyambung yang dipakai', async () => {
    expect(await ipSeenBy('off', { 'x-forwarded-for': '203.0.113.7' })).toBe('127.0.0.1');
  });
});
