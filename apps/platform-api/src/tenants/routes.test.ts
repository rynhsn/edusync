import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeDeps = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  platformDbPool: { connect: routeDeps.connect, query: routeDeps.query },
}));
vi.mock('../auth/config.js', () => ({ platformAuth: {} }));
vi.mock('../auth/routes.js', () => ({ getPlatformSession: routeDeps.getSession }));
vi.mock('../auth/permissions.js', () => ({ hasPlatformPermission: routeDeps.hasPermission }));

import { registerTenantRoutes } from './routes.js';

const originalEnv = { ...process.env };
const tenantId = '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d';
const schoolTenantId = '21b5a8a3-92cf-4e81-b3b7-168ec73a9f8e';
const organizationId = '31b5a8a3-92cf-4e81-b3b7-168ec73a9f8f';

const sampleRow = {
  id: tenantId,
  name: 'Northfield High',
  slug: 'northfield-high',
  status: 'active',
  school_tenant_id: schoolTenantId,
  provisioning_error: null,
  owner_user_id: 'user-1',
  admin_name: 'Rina Kusuma',
  admin_email: 'rina@northfield.edu',
  created_at: new Date('2026-10-19T10:00:00.000Z'),
  updated_at: new Date('2026-10-19T10:05:00.000Z'),
};

function result(rows: unknown[] = []) {
  return { rows, rowCount: rows.length };
}

async function buildApp() {
  const app = Fastify();
  await registerTenantRoutes(app);
  return app;
}

beforeEach(() => {
  process.env.SCHOOL_API_URL = 'http://localhost:4002';
  process.env.SCHOOL_PROVISIONING_SECRET = 'p'.repeat(32);
  routeDeps.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'platform_admin' } });
  routeDeps.hasPermission.mockResolvedValue(true);
  routeDeps.query.mockReset();
  routeDeps.connect.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Platform tenant lifecycle and provisioning routes', () => {
  it('scopes GET /api/tenants to owner_user_id for platform_user accounts', async () => {
    routeDeps.getSession.mockResolvedValue({ user: { id: 'customer-1', role: 'platform_user' } });
    routeDeps.query.mockResolvedValue(result([]));
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/tenants' });
      expect(response.statusCode).toBe(200);
      expect(String(routeDeps.query.mock.calls[0]?.[0])).toContain('WHERE owner_user_id = $1');
      expect(routeDeps.query.mock.calls[0]?.[1]).toEqual(['customer-1']);
    } finally {
      await app.close();
    }
  });

  it('synchronizes tenant suspension to School API and records an audit entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      updated: true,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    routeDeps.query
      .mockResolvedValueOnce(result([sampleRow]))
      .mockResolvedValueOnce(result([{ ...sampleRow, status: 'suspended' }]))
      .mockResolvedValueOnce(result());

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${tenantId}/status`,
        payload: { status: 'suspended' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: tenantId,
        status: 'suspended',
        adminEmail: 'rina@northfield.edu',
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        `http://localhost:4002/internal/provisioning/tenants/${tenantId}/status`,
      );
      expect(String(routeDeps.query.mock.calls[2]?.[0])).toContain('INSERT INTO platform_audit_logs');
      expect(routeDeps.query.mock.calls[2]?.[1]?.[1]).toBe('tenant.suspended');
    } finally {
      await app.close();
    }
  });

  it('forbids platform_user accounts from suspending or reactivating tenants', async () => {
    routeDeps.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'platform_user' } });
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${tenantId}/status`,
        payload: { status: 'suspended' },
      });
      expect(response.statusCode).toBe(403);
      expect(routeDeps.query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('allows the owning platform_user to retry failed provisioning and clears provisioningError', async () => {
    routeDeps.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'platform_user' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      platformTenantId: tenantId,
      schoolTenantId,
      organizationId,
      status: 'active',
      adminActivation: { status: 'pending' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const failedRow = {
      ...sampleRow,
      status: 'provisioning_failed',
      school_tenant_id: null,
      provisioning_error: 'School provisioning returned HTTP 502',
    };
    routeDeps.query
      .mockResolvedValueOnce(result([failedRow]))
      .mockResolvedValueOnce(result([sampleRow]))
      .mockResolvedValueOnce(result());

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenantId}/retry-provisioning`,
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: tenantId,
        status: 'active',
        schoolTenantId,
        provisioningError: null,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(routeDeps.query.mock.calls[2]?.[0])).toContain("'tenant.provisioning_retried'");
    } finally {
      await app.close();
    }
  });

  it('blocks a platform_user from retrying provisioning on a tenant owned by someone else', async () => {
    routeDeps.getSession.mockResolvedValue({ user: { id: 'other-user', role: 'platform_user' } });
    routeDeps.query.mockResolvedValueOnce(result([{ ...sampleRow, status: 'provisioning_failed' }]));

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenantId}/retry-provisioning`,
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
