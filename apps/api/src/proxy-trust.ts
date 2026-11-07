import type { Env } from './env';

/**
 * Nilai `trustProxy` Fastify: string daftar alamat tepercaya, atau false bila header x-forwarded-for tidak dipercaya.
 * IP klien = alamat pertama (dari sisi penyambung) yang BUKAN proxy tepercaya, sehingga entri palsu yang disisipkan
 * klien di sebelah kiri tidak berpengaruh.
 */
export const trustProxyFor = (env: Pick<Env, 'TRUST_PROXY'>): string | false => {
  const v = env.TRUST_PROXY.trim();
  return v === '' || v.toLowerCase() === 'off' ? false : v;
};
