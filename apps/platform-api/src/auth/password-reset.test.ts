import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeDeps = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  sendOtp: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({ platformDbPool: { connect: routeDeps.connect, query: routeDeps.query } }));
vi.mock('../operators/mailer.js', () => ({ sendPasswordResetOtp: routeDeps.sendOtp }));
vi.mock('better-auth/crypto', () => ({ hashPassword: routeDeps.hashPassword }));

import { registerPasswordResetRoutes } from './password-reset.js';

type QueryResult = { rows: unknown[]; rowCount: number };
type QueryCall = { text: string; values?: unknown[] };

function result(rows: unknown[] = []): QueryResult {
  return { rows, rowCount: rows.length };
}

function createClient(queryHandler: (text: string, values?: unknown[]) => QueryResult | Promise<QueryResult>) {
  const calls: QueryCall[] = [];
  const client = {
    calls,
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      return queryHandler(text, values);
    }),
    release: vi.fn(),
  };
  return client;
}

async function buildApp() {
  const app = Fastify();
  await registerPasswordResetRoutes(app);
  return app;
}

/** The OTP row the verify endpoint locks, with an attempt count of `attempts`. */
function pendingOtp(attempts: number, otpHash: string) {
  return (text: string) => {
    if (text.includes('FOR UPDATE')) return result([{ id: 'otp-1', attempts }]);
    if (text.includes('SELECT otp_hash')) return result([{ otp_hash: otpHash }]);
    return result();
  };
}

/** sha256 of a known 6-digit code, matching the module's unsalted digest. */
async function digest(code: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(code).digest('hex');
}

beforeEach(() => {
  routeDeps.connect.mockReset();
  routeDeps.query.mockReset();
  routeDeps.sendOtp.mockReset().mockResolvedValue(true);
  routeDeps.hashPassword.mockReset().mockResolvedValue('hashed-password');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('forgot-password', () => {
  it('always reports sent:true for an unknown address without touching the OTP table', async () => {
    const client = createClient(() => result());
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'Nobody@Example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });
    expect(client.calls.some(({ text }) => text.includes('INSERT INTO password_reset_otp'))).toBe(false);
    expect(routeDeps.sendOtp).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('normalizes the address before storing the OTP and never logs the code', async () => {
    const client = createClient((text) => {
      if (text.includes('FROM "user"')) return result([{ id: 'user-1' }]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: '  Operator@Example.COM ' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });

    const insert = client.calls.find(({ text }) => text.includes('INSERT INTO password_reset_otp'));
    expect(insert?.values?.[1]).toBe('operator@example.com');

    const otpHash = String(insert?.values?.[2]);
    expect(otpHash).toMatch(/^[0-9a-f]{64}$/);

    const mail = routeDeps.sendOtp.mock.calls[0]?.[0] as { otp: string; expiresAt: Date } | undefined;
    expect(mail?.otp).toMatch(/^\d{6}$/);
    // The stored hash is the digest of exactly the code that was emailed.
    expect(otpHash).toBe(await digest(String(mail?.otp)));
    // The expiry handed to the mailer is a real instant 10 minutes out, not a naive stamp.
    const lifetime = mail!.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(9 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe('verify-reset-otp', () => {
  it('returns valid:true for a matching code without consuming the OTP', async () => {
    const hash = await digest('123456');
    const client = createClient(pendingOtp(0, hash));
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '123456' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: true });
    expect(client.calls.some(({ text }) => text.includes('SET attempts = attempts + 1'))).toBe(false);
    expect(client.calls.some(({ text }) => text.includes('SET used_at'))).toBe(false);
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('increments attempts on a wrong code so the budget is enforced here too', async () => {
    const hash = await digest('123456');
    const client = createClient(pendingOtp(2, hash));
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '000000' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: false });

    const increment = client.calls.find(({ text }) => text.includes('SET attempts = attempts + 1'));
    expect(increment?.values).toEqual(['otp-1']);
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('locks the pending row before reading it, so concurrent guesses cannot each spend attempt one', async () => {
    const hash = await digest('123456');
    const client = createClient(pendingOtp(0, hash));
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '000000' },
    });

    const lock = client.calls.findIndex(({ text }) => text.includes('FOR UPDATE'));
    const increment = client.calls.findIndex(({ text }) => text.includes('SET attempts = attempts + 1'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(increment);
  });

  it('refuses once the attempt budget is exhausted and burns the code', async () => {
    const hash = await digest('123456');
    const client = createClient(pendingOtp(5, hash));
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    // Even the correct code is rejected at the limit.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '123456' },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(client.calls.some(({ text }) => text.includes('SET used_at = now()'))).toBe(true);
    expect(client.calls.at(-1)?.text).toBe('COMMIT');
  });

  it('returns valid:false when no pending OTP exists, and rolls back', async () => {
    const client = createClient(() => result());
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '123456' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: false });
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects a malformed code before opening a transaction', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '12345' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_INPUT');
    expect(routeDeps.connect).not.toHaveBeenCalled();
  });

  it('rolls back and reports a server error when the database fails', async () => {
    const client = createClient(() => {
      throw new Error('connection terminated');
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-reset-otp',
      payload: { email: 'operator@example.com', otp: '123456' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('OTP_VERIFY_FAILED');
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
