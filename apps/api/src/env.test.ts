import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgres://x',
  DATABASE_PLATFORM_URL: 'postgres://x',
  AUTH_SECRET: 'x'.repeat(32),
  MESSAGING_PROVIDER: 'log',
};

describe('MESSAGING_PROVIDER', () => {
  it('berlaku di pengembangan dan uji', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'development' }).MESSAGING_PROVIDER).toBe('log');
    expect(loadEnv({ ...base, NODE_ENV: 'test' }).MESSAGING_PROVIDER).toBe('log');
  });

  it('diabaikan di produksi: penyedia ditentukan pengaturan platform', () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'midtrans',
      MIDTRANS_SERVER_KEY: 'k',
    });
    expect(env.MESSAGING_PROVIDER).toBeUndefined();
  });
});
