import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeDeps = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  getSession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  platformDbPool: { connect: routeDeps.connect, query: routeDeps.query },
}));
vi.mock('../auth/config.js', () => ({ platformAuth: {} }));
vi.mock('../auth/routes.js', () => ({ getPlatformSession: routeDeps.getSession }));
vi.mock('better-auth/crypto', () => ({
  hashPassword: routeDeps.hashPassword,
  verifyPassword: routeDeps.verifyPassword,
}));

import { registerUserRoutes } from './routes.js';

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
  await registerUserRoutes(app);
  return app;
}

beforeEach(() => {
  routeDeps.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'platform_user' } });
  routeDeps.hashPassword.mockResolvedValue('hashed-secret-password');
  routeDeps.verifyPassword.mockResolvedValue(true);
  routeDeps.query.mockReset();
  routeDeps.connect.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('Platform user registration and account settings routes', () => {
  it('registers a new platform_user account with advisory lock and audit log', async () => {
    const client = createClient(() => result());
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Dian Pratama',
          email: 'Dian@Example.com',
          password: 'a-secure-password-123',
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json() as { registered: boolean; id: string };
      expect(body.registered).toBe(true);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);

      const lockIndex = client.calls.findIndex(({ text }) => text.includes('pg_advisory_xact_lock(hashtext($1))'));
      const insertUserIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO "user"'));
      const insertAccountIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO account'));
      const auditIndex = client.calls.findIndex(({ text }) => text.includes("'user.registered'"));

      expect(lockIndex).toBeGreaterThan(-1);
      expect(insertUserIndex).toBeGreaterThan(lockIndex);
      expect(insertAccountIndex).toBeGreaterThan(insertUserIndex);
      expect(auditIndex).toBeGreaterThan(insertAccountIndex);
      expect(client.calls[lockIndex]?.values).toEqual(['dian@example.com']);
      expect(client.calls.at(-1)?.text).toBe('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('returns an identical shape for an already-registered email without creating duplicate rows', async () => {
    const existingId = '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d';
    const client = createClient((text) => {
      if (text.includes('SELECT id FROM "user"')) return result([{ id: existingId }]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Dian Pratama',
          email: 'dian@example.com',
          password: 'a-secure-password-123',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ registered: true, id: existingId });
      expect(client.calls.some(({ text }) => text.includes('INSERT INTO "user"'))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('rejects self-registration when an active operator invitation exists for the email', async () => {
    const client = createClient((text) => {
      if (text.includes('FROM platform_operator_invitations')) return result([{ id: 'inv-1' }]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Pending Operator',
          email: 'operator@example.com',
          password: 'a-secure-password-123',
        },
      });
      expect(response.statusCode).toBe(409);
      expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
    } finally {
      await app.close();
    }
  });

  it('updates the signed-in account display name and records an audit entry', async () => {
    routeDeps.query
      .mockResolvedValueOnce(result([{
        id: 'user-1',
        name: 'Updated Name',
        email: 'user@example.com',
        role: 'platform_user',
      }]))
      .mockResolvedValueOnce(result());

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/account/profile',
        payload: { name: '  Updated Name  ' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ updated: true, name: 'Updated Name' });
      expect(routeDeps.query).toHaveBeenCalledTimes(2);
      expect(String(routeDeps.query.mock.calls[0]?.[0])).toContain('COALESCE(banned, false) = false');
      expect(String(routeDeps.query.mock.calls[1]?.[0])).toContain("'account.profile_updated'");
      expect(String(routeDeps.query.mock.calls[1]?.[0])).toContain("'user', NULL");
    } finally {
      await app.close();
    }
  });

  it('changes the signed-in account password after verifying the current password', async () => {
    const currentPassword = 'old-secure-password-123';
    const newPassword = 'new-secure-password-456';
    routeDeps.query
      .mockResolvedValueOnce(result([{ id: 'acc-1', password: 'old-password-hash' }]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result());

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/account/password',
        payload: { currentPassword, newPassword },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ updated: true });
      expect(routeDeps.verifyPassword).toHaveBeenCalledWith({
        hash: 'old-password-hash',
        password: currentPassword,
      });
      expect(routeDeps.hashPassword).toHaveBeenCalledWith(newPassword);
      const auditCall = routeDeps.query.mock.calls[2];
      expect(String(auditCall?.[0])).toContain("'account.password_changed'");
      expect(String(auditCall?.[0])).toContain("'user', NULL");
      expect(JSON.stringify(auditCall?.[1])).not.toContain(currentPassword);
      expect(JSON.stringify(auditCall?.[1])).not.toContain(newPassword);
      expect(JSON.stringify(auditCall?.[1])).not.toContain('hashed-secret-password');
    } finally {
      await app.close();
    }
  });

  it('rejects password change when the current password is wrong', async () => {
    routeDeps.query.mockResolvedValueOnce(result([{ id: 'acc-1', password: 'old-password-hash' }]));
    routeDeps.verifyPassword.mockResolvedValueOnce(false);

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/account/password',
        payload: {
          currentPassword: 'wrong-current-password',
          newPassword: 'new-secure-password-456',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(routeDeps.hashPassword).not.toHaveBeenCalled();
      expect(routeDeps.query).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
