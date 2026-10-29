import type { FastifyInstance } from 'fastify';
import {
  createTenantSchema,
  internalUpdateSchoolTenantStatusSchema,
  platformTenantIdSchema,
  platformTenantSchema,
  provisionedTenantSchema,
  provisioningPayloadSchema,
  updateTenantStatusSchema,
  type PlatformTenant,
} from '@edusync/contracts';
import { platformAuth } from '../auth/config.js';
import { getPlatformSession } from '../auth/routes.js';
import { hasPlatformPermission } from '../auth/permissions.js';
import { platformDbPool } from '../db/pool.js';

const isPlatformUserRole = (role: string | null | undefined): boolean => role === 'platform_user';

const SCHOOL_PROVISIONING_TIMEOUT_MS = 10_000;

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  school_tenant_id: string | null;
  provisioning_error: string | null;
  owner_user_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  created_at: Date;
  updated_at: Date;
}

function serializeTenant(row: TenantRow): PlatformTenant {
  return platformTenantSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    schoolTenantId: row.school_tenant_id,
    provisioningError: row.provisioning_error,
    ownerUserId: row.owner_user_id,
    adminName: row.admin_name,
    adminEmail: row.admin_email,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  });
}

export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tenants', async (request, reply) => {
    if (!(await hasPlatformPermission(request, 'tenant.create'))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }

    const parsed = createTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_TENANT', message: 'Invalid tenant details' } });
    }

    const { name, slug, adminName, adminEmail } = parsed.data;
    const session = await getPlatformSession(platformAuth, request);
    if (!session) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    // `tenant.create` is held by admins, read-only operators, and customers. Only admins
    // and customers may actually create a school: a read-only operator can inspect the
    // catalogue but not provision new tenants.
    if (session.user.role !== 'platform_admin' && !isPlatformUserRole(session.user.role)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }

    const client = await platformDbPool.connect();
    let tenantId: string;
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tenants (name, slug, status, created_by, owner_user_id, admin_name, admin_email)
         VALUES ($1, $2, 'provisioning', $3, $3, $4, $5)
         RETURNING id`,
        [name, slug, session.user.id, adminName, adminEmail],
      );
      tenantId = inserted.rows[0]!.id;
      // The creator owns the school they just provisioned; an operator creating on behalf
      // of someone else still owns it as the operator.
      await client.query(
        `INSERT INTO tenant_owners (tenant_id, user_id, role) VALUES ($1, $2, 'platform_owner')
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [tenantId, session.user.id],
      );
      await client.query(
        `INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'tenant.provisioning_started', 'tenant', $2, $3::jsonb)`,
        [session.user.id, tenantId, JSON.stringify({ slug })],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'Failed to create Platform tenant');
      return reply.code(409).send({ error: { code: 'TENANT_CREATE_FAILED', message: 'Tenant could not be created' } });
    } finally {
      client.release();
    }

    const payload = provisioningPayloadSchema.parse({
      platformTenantId: tenantId,
      name,
      slug,
      adminName,
      adminEmail,
    });
    const secret = process.env.SCHOOL_PROVISIONING_SECRET;
    const schoolApiUrl = process.env.SCHOOL_API_URL;
    if (!secret || secret.length < 32 || !schoolApiUrl) {
      await markProvisioningFailed(tenantId, 'School provisioning is not configured');
      return reply.code(503).send({ error: { code: 'PROVISIONING_UNAVAILABLE', message: 'Tenant provisioning is unavailable' } });
    }

    let provisioned: string;
    try {
      const response = await fetch(new URL('/internal/provisioning/tenants', schoolApiUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SCHOOL_PROVISIONING_TIMEOUT_MS),
      });
      if (!response.ok) {
        await markProvisioningFailed(tenantId, `School provisioning returned HTTP ${response.status}`);
        return reply.code(response.status === 409 ? 409 : 502).send({
          error: { code: 'SCHOOL_PROVISIONING_FAILED', message: 'School tenant provisioning failed' },
        });
      }
      const body: unknown = await response.json();
      const validated = provisionedTenantSchema.parse(body);
      if (validated.platformTenantId !== tenantId) {
        throw new Error('School provisioning response tenant ID mismatch');
      }
      provisioned = validated.schoolTenantId;
    } catch (error) {
      request.log.error({ err: error, tenantId }, 'School API provisioning request failed');
      await markProvisioningFailed(tenantId, 'School provisioning request failed');
      return reply.code(502).send({ error: { code: 'SCHOOL_PROVISIONING_FAILED', message: 'School tenant provisioning failed' } });
    }

    const updated = await platformDbPool.query<TenantRow>(
      `UPDATE tenants
       SET school_tenant_id = $2, status = 'active', provisioning_error = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('provisioning', 'provisioning_failed')
       RETURNING id, name, slug, status, school_tenant_id, provisioning_error, owner_user_id, admin_name, admin_email, created_at, updated_at`,
      [tenantId, provisioned],
    );
    const tenant = updated.rows[0];
    if (!tenant) {
      return reply.code(500).send({ error: { code: 'TENANT_STATE_UPDATE_FAILED', message: 'Tenant state could not be updated' } });
    }

    return reply.code(201).send(serializeTenant(tenant));
  });

  app.get('/api/tenants', async (request, reply) => {
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    if (!(await hasPlatformPermission(request, 'tenant.read'))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }
    // A customer only sees the schools they own; operators and admins see everything.
    const scopedToOwner = isPlatformUserRole(actor.user.role);
    const result = await platformDbPool.query(
      `SELECT id, name, slug, status, school_tenant_id AS "schoolTenantId",
              provisioning_error AS "provisioningError", owner_user_id AS "ownerUserId",
              admin_name AS "adminName", admin_email AS "adminEmail",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tenants ${scopedToOwner ? 'WHERE owner_user_id = $1' : ''}
       ORDER BY created_at DESC LIMIT 100`,
      scopedToOwner ? [actor.user.id] : [],
    );
    return reply.send(result.rows);
  });

  app.patch('/api/tenants/:tenantId/status', async (request, reply) => {
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    if (!(await hasPlatformPermission(request, 'tenant.manage_access')) || actor.user.role !== 'platform_admin') {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }

    const params = request.params as { tenantId?: string };
    const parsedId = platformTenantIdSchema.safeParse(params.tenantId);
    const parsedBody = updateTenantStatusSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Invalid tenant status update' } });
    }

    const tenantId = parsedId.data;
    const { status } = parsedBody.data;

    const existing = await platformDbPool.query<TenantRow>(
      `SELECT id, name, slug, status, school_tenant_id, provisioning_error, owner_user_id, admin_name, admin_email, created_at, updated_at
       FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const current = existing.rows[0];
    if (!current) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
    }
    if (current.status !== 'active' && current.status !== 'suspended') {
      return reply.code(409).send({ error: { code: 'INVALID_TENANT_STATE', message: 'Only active or suspended tenants can change status' } });
    }

    if (current.school_tenant_id) {
      const secret = process.env.SCHOOL_PROVISIONING_SECRET;
      const schoolApiUrl = process.env.SCHOOL_API_URL;
      if (!secret || secret.length < 32 || !schoolApiUrl) {
        return reply.code(503).send({ error: { code: 'PROVISIONING_UNAVAILABLE', message: 'School status synchronization is unavailable' } });
      }
      try {
        const response = await fetch(new URL(`/internal/provisioning/tenants/${encodeURIComponent(tenantId)}/status`, schoolApiUrl), {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${secret}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(internalUpdateSchoolTenantStatusSchema.parse({ status })),
          signal: AbortSignal.timeout(SCHOOL_PROVISIONING_TIMEOUT_MS),
        });
        if (!response.ok) {
          return reply.code(502).send({ error: { code: 'SCHOOL_STATUS_SYNC_FAILED', message: 'School tenant status update failed' } });
        }
      } catch (error) {
        request.log.error({ err: error, tenantId }, 'School API status update failed');
        return reply.code(502).send({ error: { code: 'SCHOOL_STATUS_SYNC_FAILED', message: 'School tenant status update failed' } });
      }
    }

    const updated = await platformDbPool.query<TenantRow>(
      `UPDATE tenants
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, status, school_tenant_id, provisioning_error, owner_user_id, admin_name, admin_email, created_at, updated_at`,
      [tenantId, status],
    );
    const row = updated.rows[0];
    if (!row) {
      return reply.code(500).send({ error: { code: 'TENANT_STATE_UPDATE_FAILED', message: 'Tenant state could not be updated' } });
    }

    const auditAction = status === 'suspended' ? 'tenant.suspended' : 'tenant.reactivated';
    await platformDbPool.query(
      `INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'tenant', $3, $4::jsonb)`,
      [actor.user.id, auditAction, tenantId, JSON.stringify({ slug: row.slug, status })],
    );

    return reply.send(serializeTenant(row));
  });

  app.post('/api/tenants/:tenantId/retry-provisioning', async (request, reply) => {
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    if (!(await hasPlatformPermission(request, 'tenant.create'))) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }
    if (actor.user.role !== 'platform_admin' && !isPlatformUserRole(actor.user.role)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }

    const params = request.params as { tenantId?: string };
    const parsedId = platformTenantIdSchema.safeParse(params.tenantId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Invalid tenant ID' } });
    }

    const tenantId = parsedId.data;
    const existing = await platformDbPool.query<TenantRow>(
      `SELECT id, name, slug, status, school_tenant_id, provisioning_error, owner_user_id, admin_name, admin_email, created_at, updated_at
       FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const current = existing.rows[0];
    if (!current) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
    }
    if (isPlatformUserRole(actor.user.role) && current.owner_user_id !== actor.user.id) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }
    if (current.status !== 'provisioning_failed') {
      return reply.code(409).send({ error: { code: 'INVALID_TENANT_STATE', message: 'Only tenants with failed provisioning can be retried' } });
    }
    if (!current.admin_name || !current.admin_email) {
      return reply.code(409).send({ error: { code: 'MISSING_ADMIN_CONTACT', message: 'Tenant is missing initial school admin contact details' } });
    }

    const secret = process.env.SCHOOL_PROVISIONING_SECRET;
    const schoolApiUrl = process.env.SCHOOL_API_URL;
    if (!secret || secret.length < 32 || !schoolApiUrl) {
      await markProvisioningFailed(tenantId, 'School provisioning is not configured');
      return reply.code(503).send({ error: { code: 'PROVISIONING_UNAVAILABLE', message: 'Tenant provisioning is unavailable' } });
    }

    const payload = provisioningPayloadSchema.parse({
      platformTenantId: tenantId,
      name: current.name,
      slug: current.slug,
      adminName: current.admin_name,
      adminEmail: current.admin_email,
    });

    let provisioned: string;
    try {
      const response = await fetch(new URL('/internal/provisioning/tenants', schoolApiUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SCHOOL_PROVISIONING_TIMEOUT_MS),
      });
      if (!response.ok) {
        await markProvisioningFailed(tenantId, `School provisioning returned HTTP ${response.status}`);
        return reply.code(response.status === 409 ? 409 : 502).send({
          error: { code: 'SCHOOL_PROVISIONING_FAILED', message: 'School tenant provisioning failed' },
        });
      }
      const body: unknown = await response.json();
      const validated = provisionedTenantSchema.parse(body);
      if (validated.platformTenantId !== tenantId) {
        throw new Error('School provisioning response tenant ID mismatch');
      }
      provisioned = validated.schoolTenantId;
    } catch (error) {
      request.log.error({ err: error, tenantId }, 'School API retry provisioning request failed');
      await markProvisioningFailed(tenantId, 'School provisioning request failed');
      return reply.code(502).send({ error: { code: 'SCHOOL_PROVISIONING_FAILED', message: 'School tenant provisioning failed' } });
    }

    const updated = await platformDbPool.query<TenantRow>(
      `UPDATE tenants
       SET school_tenant_id = $2, status = 'active', provisioning_error = NULL, updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, status, school_tenant_id, provisioning_error, owner_user_id, admin_name, admin_email, created_at, updated_at`,
      [tenantId, provisioned],
    );
    const row = updated.rows[0];
    if (!row) {
      return reply.code(500).send({ error: { code: 'TENANT_STATE_UPDATE_FAILED', message: 'Tenant state could not be updated' } });
    }

    await platformDbPool.query(
      `INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'tenant.provisioning_retried', 'tenant', $2, $3::jsonb)`,
      [actor.user.id, tenantId, JSON.stringify({ slug: row.slug })],
    );

    return reply.send(serializeTenant(row));
  });
}

async function markProvisioningFailed(tenantId: string, reason: string): Promise<void> {
  await platformDbPool.query(
    `UPDATE tenants SET status = 'provisioning_failed', provisioning_error = $2, updated_at = now() WHERE id = $1`,
    [tenantId, reason],
  );
}
