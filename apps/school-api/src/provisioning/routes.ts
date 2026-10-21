import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  provisionedTenantSchema,
  provisioningPayloadSchema,
  safeEqualSecret,
} from '@edusync/contracts';
import { schoolDbPool } from '../db/pool.js';

const MAX_PROVISIONING_BODY_BYTES = 16_384;

export async function registerProvisioningRoutes(app: FastifyInstance): Promise<void> {
  app.post('/internal/provisioning/tenants', {
    bodyLimit: MAX_PROVISIONING_BODY_BYTES,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const expectedSecret = process.env.SCHOOL_PROVISIONING_SECRET;
    const authorization = request.headers.authorization;
    const suppliedSecret = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (!safeEqualSecret(suppliedSecret, expectedSecret)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }

    const parsed = provisioningPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_PROVISIONING_PAYLOAD', message: 'Invalid provisioning payload' } });
    }

    const payload = parsed.data;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
    const client = await schoolDbPool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [payload.platformTenantId]);

      const existing = await client.query<{
        school_tenant_id: string;
        organization_id: string | null;
        status: string;
        request_hash: string;
      }>(
        `SELECT st.id AS school_tenant_id, st.organization_id, st.status, spr.request_hash
         FROM school_provisioning_requests spr
         JOIN school_tenants st ON st.id = spr.school_tenant_id
         WHERE spr.platform_tenant_id = $1`,
        [payload.platformTenantId],
      );

      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.request_hash !== requestHash) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return reply.code(409).send({
            error: { code: 'PROVISIONING_CONFLICT', message: 'Tenant was already provisioned with different details' },
          });
        }
        if (!row.organization_id || row.status !== 'active') {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return reply.code(409).send({
            error: { code: 'PROVISIONING_INCOMPLETE', message: 'Existing tenant is not ready for provisioning retries' },
          });
        }

        await client.query('COMMIT');
        transactionOpen = false;
        return reply.code(200).send(provisionedTenantSchema.parse({
          platformTenantId: payload.platformTenantId,
          schoolTenantId: row.school_tenant_id,
          organizationId: row.organization_id,
          status: 'active',
          adminActivation: { status: 'pending' },
        }));
      }

      const organizationId = randomUUID();
      const schoolTenantId = randomUUID();
      const organizationSlug = `${payload.slug}-${payload.platformTenantId.slice(0, 8)}`;
      await client.query(
        `INSERT INTO organization (id, name, slug, "createdAt") VALUES ($1, $2, $3, now())`,
        [organizationId, payload.name, organizationSlug],
      );
      await client.query(
        `INSERT INTO school_tenants (id, platform_tenant_id, organization_id, name, slug, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [schoolTenantId, payload.platformTenantId, organizationId, payload.name, payload.slug],
      );
      await client.query(
        `INSERT INTO school_provisioning_requests (platform_tenant_id, school_tenant_id, request_hash)
         VALUES ($1, $2, $3)`,
        [payload.platformTenantId, schoolTenantId, requestHash],
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return reply.code(200).send(provisionedTenantSchema.parse({
        platformTenantId: payload.platformTenantId,
        schoolTenantId,
        organizationId,
        status: 'active',
        adminActivation: { status: 'pending' },
      }));
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          request.log.error({ err: rollbackError }, 'School provisioning rollback failed');
        }
      }
      request.log.error({ err: error, platformTenantId: payload.platformTenantId }, 'School tenant provisioning failed');
      return reply.code(500).send({ error: { code: 'PROVISIONING_FAILED', message: 'Tenant provisioning failed' } });
    } finally {
      client.release();
    }
  });
}
