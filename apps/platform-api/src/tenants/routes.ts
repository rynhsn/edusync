import type { FastifyInstance } from 'fastify';
import {
  createTenantSchema,
  platformTenantSchema,
  provisionedTenantSchema,
  provisioningPayloadSchema,
} from '@edusync/contracts';
import { platformAuth } from '../auth/config.js';
import { getPlatformSession } from '../auth/routes.js';
import { hasPlatformPermission } from '../auth/permissions.js';
import { platformDbPool } from '../db/pool.js';

const isPlatformUserRole = (role: string | null | undefined): boolean => role === 'platform_user';

const SCHOOL_PROVISIONING_TIMEOUT_MS = 10_000;

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
        `INSERT INTO tenants (name, slug, status, created_by, owner_user_id)
         VALUES ($1, $2, 'provisioning', $3, $3)
         RETURNING id`,
        [name, slug, session.user.id],
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

    const updated = await platformDbPool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      school_tenant_id: string | null;
      provisioning_error: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE tenants
       SET school_tenant_id = $2, status = 'active', provisioning_error = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('provisioning', 'provisioning_failed')
       RETURNING id, name, slug, status, school_tenant_id, provisioning_error, created_at, updated_at`,
      [tenantId, provisioned],
    );
    const tenant = updated.rows[0];
    if (!tenant) {
      return reply.code(500).send({ error: { code: 'TENANT_STATE_UPDATE_FAILED', message: 'Tenant state could not be updated' } });
    }

    const result = platformTenantSchema.parse({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      schoolTenantId: tenant.school_tenant_id,
      provisioningError: tenant.provisioning_error,
      createdAt: tenant.created_at.toISOString(),
      updatedAt: tenant.updated_at.toISOString(),
    });
    return reply.code(201).send(result);
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
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tenants ${scopedToOwner ? 'WHERE owner_user_id = $1' : ''}
       ORDER BY created_at DESC LIMIT 100`,
      scopedToOwner ? [actor.user.id] : [],
    );
    return reply.send(result.rows);
  });
}

async function markProvisioningFailed(tenantId: string, reason: string): Promise<void> {
  await platformDbPool.query(
    `UPDATE tenants SET status = 'provisioning_failed', provisioning_error = $2, updated_at = now() WHERE id = $1`,
    [tenantId, reason],
  );
}
