import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeDeps = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  sendInvitation: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  platformDbPool: { connect: routeDeps.connect, query: routeDeps.query },
}));
vi.mock('../auth/config.js', () => ({ platformAuth: {} }));
vi.mock('../auth/routes.js', () => ({ getPlatformSession: routeDeps.getSession }));
vi.mock('../auth/permissions.js', () => ({ hasPlatformPermission: routeDeps.hasPermission }));
vi.mock('./mailer.js', () => ({ sendOperatorInvitation: routeDeps.sendInvitation }));
vi.mock('better-auth/crypto', () => ({ hashPassword: routeDeps.hashPassword }));

import { registerOperatorRoutes } from './routes.js';

const invitationId = '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d';
const email = 'invitee@example.com';
const invitation = {
  id: invitationId,
  email,
  name: 'Invitee',
  role: 'platform_read_only',
  token_hash: 'a'.repeat(64),
  expires_at: new Date('2026-10-19T10:00:00.000Z'),
  created_at: new Date('2026-10-17T10:00:00.000Z'),
  accepted_at: null,
  revoked_at: null,
  delivery_failed: false,
  sent_at: null,
  active: true,
};

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
  await registerOperatorRoutes(app);
  return app;
}

beforeEach(() => {
  routeDeps.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'platform_admin' } });
  routeDeps.hasPermission.mockResolvedValue(true);
  routeDeps.sendInvitation.mockResolvedValue(true);
  routeDeps.hashPassword.mockResolvedValue('test-password-hash');
  routeDeps.query.mockReset();
  routeDeps.connect.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('Platform operator invitation lifecycle routes', () => {
  it('requires operator.manage before revoking an invitation', async () => {
    routeDeps.hasPermission.mockResolvedValue(false);
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'POST', url: `/api/operators/invitations/${invitationId}/revoke` });
      expect(response.statusCode).toBe(403);
      expect(routeDeps.connect).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('takes the normalized-email lifecycle lock before revoking and auditing', async () => {
    const client = createClient((text) => {
      if (text.includes('SELECT email FROM platform_operator_invitations')) return result([{ email }]);
      if (text.includes('UPDATE platform_operator_invitations SET revoked_at')) return result([{ email }]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'POST', url: `/api/operators/invitations/${invitationId}/revoke` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ updated: true });
      const lockIndex = client.calls.findIndex(({ text }) => text.includes('pg_advisory_xact_lock(hashtext($1))'));
      const revokeIndex = client.calls.findIndex(({ text }) => text.includes('UPDATE platform_operator_invitations SET revoked_at'));
      const auditIndex = client.calls.findIndex(({ text }) => text.includes("'operator.invite_revoked'"));
      expect(lockIndex).toBeGreaterThan(-1);
      expect(revokeIndex).toBeGreaterThan(lockIndex);
      expect(auditIndex).toBeGreaterThan(revokeIndex);
      expect(client.calls[lockIndex]?.values).toEqual([email]);
      expect(client.calls.at(-1)?.text).toBe('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('serializes invitation acceptance before creating credentials and consuming the token', async () => {
    const client = createClient((text) => {
      if (text.includes('SELECT email FROM platform_operator_invitations')) return result([{ email }]);
      if (text.includes('SELECT id, email, name, role, token_hash')) return result([invitation]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    const token = 'x'.repeat(43);
    const password = 'a-secure-password-123';
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/operator-invitations/accept',
        payload: { token, password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ accepted: true });
      const lockIndex = client.calls.findIndex(({ text }) => text.includes('pg_advisory_xact_lock(hashtext($1))'));
      const userIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO "user"'));
      const accountIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO account'));
      const consumeIndex = client.calls.findIndex(({ text }) => text.includes('SET accepted_at = now()'));
      expect(lockIndex).toBeGreaterThan(-1);
      expect(userIndex).toBeGreaterThan(lockIndex);
      expect(accountIndex).toBeGreaterThan(userIndex);
      expect(consumeIndex).toBeGreaterThan(accountIndex);
      expect(client.calls[lockIndex]?.values).toEqual([email]);
      expect(client.calls.at(-1)?.text).toBe('COMMIT');
      const auditCall = client.calls.find(({ text }) => text.includes("'operator.invite_accepted'"));
      expect(JSON.stringify(auditCall?.values)).not.toContain(token);
      expect(JSON.stringify(auditCall?.values)).not.toContain(password);
      expect(JSON.stringify(auditCall?.values)).not.toContain('a'.repeat(64));
    } finally {
      await app.close();
    }
  });

  it('does not create credentials when acceptance is attempted with an unknown token', async () => {
    const client = createClient(() => result());
    routeDeps.connect.mockResolvedValue(client);
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/operator-invitations/accept',
        payload: { token: 'x'.repeat(43), password: 'a-secure-password-123' },
      });
      expect(response.statusCode).toBe(400);
      expect(client.calls.some(({ text }) => text.includes('INSERT INTO "user"'))).toBe(false);
      expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
    } finally {
      await app.close();
    }
  });

  it('returns platform audit logs for operators with operator.read', async () => {
    routeDeps.query.mockResolvedValue(result([{
      id: '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d',
      actorUserId: 'admin-1',
      actorName: 'Platform Admin',
      actorEmail: 'admin@example.com',
      action: 'tenant.suspended',
      entityType: 'tenant',
      entityId: 'tenant-1',
      details: { slug: 'northfield' },
      createdAt: new Date('2026-10-19T12:00:00.000Z'),
    }]));
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/audit-logs' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        logs: [{
          id: '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d',
          actorUserId: 'admin-1',
          actorName: 'Platform Admin',
          actorEmail: 'admin@example.com',
          action: 'tenant.suspended',
          entityType: 'tenant',
          entityId: 'tenant-1',
          details: { slug: 'northfield' },
          createdAt: '2026-10-19T12:00:00.000Z',
        }],
      });
    } finally {
      await app.close();
    }
  });
});
