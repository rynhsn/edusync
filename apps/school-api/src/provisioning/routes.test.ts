import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeDeps = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  sendActivation: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  schoolDbPool: { connect: routeDeps.connect, query: routeDeps.query },
}));
vi.mock('./mailer.js', () => ({ sendSchoolAdminActivation: routeDeps.sendActivation }));
vi.mock('better-auth/crypto', () => ({ hashPassword: routeDeps.hashPassword }));

import { registerProvisioningRoutes } from './routes.js';

const originalEnv = { ...process.env };
const secret = 's'.repeat(32);
const platformTenantId = '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d';
const schoolTenantId = '21b5a8a3-92cf-4e81-b3b7-168ec73a9f8e';
const organizationId = '31b5a8a3-92cf-4e81-b3b7-168ec73a9f8f';

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
  await registerProvisioningRoutes(app);
  return app;
}

beforeEach(() => {
  process.env.SCHOOL_PROVISIONING_SECRET = secret;
  routeDeps.sendActivation.mockResolvedValue(true);
  routeDeps.hashPassword.mockResolvedValue('hashed-admin-password');
  routeDeps.query.mockReset();
  routeDeps.connect.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('School provisioning and admin activation routes', () => {
  it('provisions a school tenant without returning any password or activation token in the response', async () => {
    const client = createClient((text) => {
      if (text.includes('FROM school_provisioning_requests')) return result();
      if (text.includes('SELECT id FROM "user"')) return result();
      if (text.includes('INSERT INTO school_tenant_admin_activation')) return result([{ id: 'act-1' }]);
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);
    routeDeps.query.mockResolvedValue(result());

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/provisioning/tenants',
        headers: { authorization: `Bearer ${secret}` },
        payload: {
          platformTenantId,
          name: 'Northfield High',
          slug: 'northfield-high',
          adminName: 'Rina Kusuma',
          adminEmail: 'rina@northfield.edu',
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        platformTenantId: string;
        schoolTenantId: string;
        organizationId: string;
        status: string;
        adminActivation: { status: string };
      };
      expect(body.platformTenantId).toBe(platformTenantId);
      expect(body.status).toBe('active');
      expect(body.adminActivation).toEqual({ status: 'pending' });
      expect(JSON.stringify(body)).not.toContain('token');
      expect(JSON.stringify(body)).not.toContain('password');
      expect(routeDeps.sendActivation).toHaveBeenCalledOnce();
      const sentArg = routeDeps.sendActivation.mock.calls[0]?.[0] as { token: string; to: string };
      expect(sentArg.to).toBe('rina@northfield.edu');
      expect(sentArg.token.length).toBeGreaterThanOrEqual(32);
      expect(JSON.stringify(body)).not.toContain(sentArg.token);
    } finally {
      await app.close();
    }
  });

  it('updates school tenant status, revokes sessions on suspension, and writes an audit log', async () => {
    const client = createClient((text) => {
      if (text.includes('UPDATE school_tenants')) {
        return result([{ id: schoolTenantId, organization_id: organizationId }]);
      }
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/internal/provisioning/tenants/${platformTenantId}/status`,
        headers: { authorization: `Bearer ${secret}` },
        payload: { status: 'suspended' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ updated: true });
      expect(client.calls.some(({ text }) => text.includes('DELETE FROM "session"'))).toBe(true);
      expect(client.calls.some(({ text }) => text.includes('INSERT INTO school_authz_audit_logs'))).toBe(true);
      expect(client.calls.at(-1)?.text).toBe('COMMIT');
    } finally {
      await app.close();
    }
  });

  it('looks up an unconsumed school admin activation token', async () => {
    routeDeps.query.mockResolvedValueOnce(result([{
      email: 'rina@northfield.edu',
      name: 'Rina Kusuma',
      school_name: 'Northfield High',
    }]));

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin-activations/lookup',
        payload: { token: 't'.repeat(43) },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        valid: true,
        email: 'rina@northfield.edu',
        name: 'Rina Kusuma',
        schoolName: 'Northfield High',
      });
    } finally {
      await app.close();
    }
  });

  it('accepts an admin activation token, sets credential password, and consumes the token without logging secrets', async () => {
    const token = 't'.repeat(43);
    const password = 'a-secure-password-123';
    const client = createClient((text) => {
      if (text.includes('SELECT email')) {
        return result([{ email: 'rina@northfield.edu' }]);
      }
      if (text.includes('FROM school_tenant_admin_activation a')) {
        return result([{
          id: 'act-1',
          tenant_id: schoolTenantId,
          email: 'rina@northfield.edu',
          name: 'Rina Kusuma',
          organization_id: organizationId,
          status: 'active',
        }]);
      }
      if (text.includes('SELECT id FROM "user"')) {
        return result();
      }
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin-activations/accept',
        payload: { token, password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ activated: true });

      const lockIndex = client.calls.findIndex(({ text }) => text.includes('pg_advisory_xact_lock(hashtext($1))'));
      const userIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO "user"'));
      const accountIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO account'));
      const memberIndex = client.calls.findIndex(({ text }) => text.includes('INSERT INTO member'));
      const consumeIndex = client.calls.findIndex(({ text }) => text.includes('SET consumed_at = $2'));
      const auditCall = client.calls.find(({ text }) => text.includes("'admin.activated'"));

      expect(lockIndex).toBeGreaterThan(-1);
      expect(userIndex).toBeGreaterThan(lockIndex);
      expect(accountIndex).toBeGreaterThan(userIndex);
      expect(memberIndex).toBeGreaterThan(accountIndex);
      expect(consumeIndex).toBeGreaterThan(memberIndex);
      expect(client.calls.at(-1)?.text).toBe('COMMIT');
      expect(JSON.stringify(auditCall?.values)).not.toContain(token);
      expect(JSON.stringify(auditCall?.values)).not.toContain(password);
      expect(JSON.stringify(auditCall?.values)).not.toContain('hashed-admin-password');
    } finally {
      await app.close();
    }
  });

  it('rejects activation acceptance when the school tenant is suspended', async () => {
    const client = createClient((text) => {
      if (text.includes('SELECT email')) {
        return result([{ email: 'rina@northfield.edu' }]);
      }
      if (text.includes('FROM school_tenant_admin_activation a')) {
        return result([{
          id: 'act-1',
          tenant_id: schoolTenantId,
          email: 'rina@northfield.edu',
          name: 'Rina Kusuma',
          organization_id: organizationId,
          status: 'suspended',
        }]);
      }
      return result();
    });
    routeDeps.connect.mockResolvedValue(client);

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin-activations/accept',
        payload: { token: 't'.repeat(43), password: 'a-secure-password-123' },
      });
      expect(response.statusCode).toBe(400);
      expect(client.calls.some(({ text }) => text.includes('INSERT INTO account'))).toBe(false);
      expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
    } finally {
      await app.close();
    }
  });
});
