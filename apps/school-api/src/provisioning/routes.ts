import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  bootstrapSchoolAdminSchema,
  internalUpdateSchoolTenantStatusSchema,
  platformTenantIdSchema,
  provisionedTenantSchema,
  provisioningPayloadSchema,
  safeEqualSecret,
  schoolAdminActivationAcceptanceSchema,
  schoolAdminActivationLookupSchema,
  schoolAdminActivationTokenRequestSchema,
  schoolMutationResultSchema,
} from '@edusync/contracts';
import { hashPassword } from 'better-auth/crypto';
import { schoolDbPool } from '../db/pool.js';
import { sendSchoolAdminActivation } from './mailer.js';

const MAX_PROVISIONING_BODY_BYTES = 16_384;
const ACTIVATION_LIFETIME_HOURS = 48;
const GENERIC_ACTIVATION_ERROR = 'This activation link is invalid or has expired.';

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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
    let pendingMail: {
      activationId: string;
      tokenHash: string;
      rawToken: string;
      expiresAt: Date;
    } | null = null;

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

      let schoolTenantId: string;
      let organizationId: string;

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
        schoolTenantId = row.school_tenant_id;
        organizationId = row.organization_id;
      } else {
        organizationId = randomUUID();
        schoolTenantId = randomUUID();
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
      }

      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(btrim(email)) = $1 LIMIT 1`,
        [payload.adminEmail],
      );

      let activationStatus: 'pending' | 'already_exists';

      if (existingUser.rows[0]) {
        await client.query(
          `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
           VALUES ($1, $2, $3, 'school_admin', now())
           ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'school_admin'`,
          [randomUUID(), organizationId, existingUser.rows[0].id],
        );
        await client.query(
          `UPDATE school_tenant_admin_activation
           SET consumed_at = now()
           WHERE tenant_id = $1 AND email = $2 AND consumed_at IS NULL`,
          [schoolTenantId, payload.adminEmail],
        );
        activationStatus = 'already_exists';
      } else {
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = digestToken(rawToken);
        const expiresAt = new Date(Date.now() + ACTIVATION_LIFETIME_HOURS * 60 * 60 * 1000);
        const upserted = await client.query<{ id: string }>(
          `INSERT INTO school_tenant_admin_activation (tenant_id, email, name, token_hash, expires_at, consumed_at, delivery_failed, sent_at)
           VALUES ($1, $2, $3, $4, $5, NULL, false, NULL)
           ON CONFLICT (tenant_id, email)
           DO UPDATE SET name = EXCLUDED.name,
                         token_hash = EXCLUDED.token_hash,
                         expires_at = EXCLUDED.expires_at,
                         consumed_at = NULL,
                         delivery_failed = false,
                         sent_at = NULL
           RETURNING id`,
          [schoolTenantId, payload.adminEmail, payload.adminName, tokenHash, expiresAt],
        );
        pendingMail = {
          activationId: upserted.rows[0]!.id,
          tokenHash,
          rawToken,
          expiresAt,
        };
        activationStatus = 'pending';
      }

      await client.query('COMMIT');
      transactionOpen = false;

      if (pendingMail) {
        const sent = await sendSchoolAdminActivation({
          to: payload.adminEmail,
          name: payload.adminName,
          schoolName: payload.name,
          token: pendingMail.rawToken,
          expiresAt: pendingMail.expiresAt,
        });
        await schoolDbPool.query(
          `UPDATE school_tenant_admin_activation
           SET delivery_failed = $3, sent_at = CASE WHEN $3 THEN NULL ELSE now() END
           WHERE id = $1 AND token_hash = $2 AND consumed_at IS NULL`,
          [pendingMail.activationId, pendingMail.tokenHash, !sent],
        ).catch((mailUpdateError: unknown) => {
          request.log.warn({ err: mailUpdateError }, 'Failed to record school admin activation email delivery state');
        });
      }

      return reply.code(200).send(provisionedTenantSchema.parse({
        platformTenantId: payload.platformTenantId,
        schoolTenantId,
        organizationId,
        status: 'active',
        adminActivation: { status: activationStatus },
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

  app.patch<{ Params: { platformTenantId: string } }>('/internal/provisioning/tenants/:platformTenantId/status', {
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

    const tenantIdParsed = platformTenantIdSchema.safeParse(request.params.platformTenantId);
    const bodyParsed = internalUpdateSchoolTenantStatusSchema.safeParse(request.body);
    if (!tenantIdParsed.success || !bodyParsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_STATUS_PAYLOAD', message: 'Invalid tenant status payload' } });
    }

    const platformTenantId = tenantIdParsed.data;
    const nextStatus = bodyParsed.data.status;
    const client = await schoolDbPool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [platformTenantId]);

      const updated = await client.query<{ id: string; organization_id: string | null }>(
        `UPDATE school_tenants
         SET status = $2, updated_at = now()
         WHERE platform_tenant_id = $1
         RETURNING id, organization_id`,
        [platformTenantId, nextStatus],
      );

      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: { code: 'TENANT_NOT_FOUND', message: 'School tenant not found' } });
      }

      const schoolTenant = updated.rows[0]!;
      if (nextStatus === 'suspended' && schoolTenant.organization_id) {
        await client.query(
          `DELETE FROM "session"
           WHERE "activeOrganizationId" = $1
              OR "userId" IN (SELECT "userId" FROM member WHERE "organizationId" = $1)`,
          [schoolTenant.organization_id],
        );
      }

      await client.query(
        `INSERT INTO school_authz_audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, NULL, $2, 'tenant', $1)`,
        [schoolTenant.id, nextStatus === 'suspended' ? 'tenant.suspended' : 'tenant.reactivated'],
      );

      await client.query('COMMIT');
      return reply.send(schoolMutationResultSchema.parse({ updated: true }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error, platformTenantId }, 'Failed to update school tenant status');
      return reply.code(500).send({ error: { code: 'STATUS_UPDATE_FAILED', message: 'School tenant status update failed' } });
    } finally {
      client.release();
    }
  });

  app.post('/api/admin-activations/lookup', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = schoolAdminActivationTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.send(schoolAdminActivationLookupSchema.parse({ valid: false }));
    }

    const found = await schoolDbPool.query<{ email: string; name: string; school_name: string }>(
      `SELECT a.email, COALESCE(a.name, a.email) AS name, st.name AS school_name
       FROM school_tenant_admin_activation a
       JOIN school_tenants st ON st.id = a.tenant_id
       WHERE a.token_hash = $1
         AND a.consumed_at IS NULL
         AND a.expires_at > now()
         AND st.status = 'active'`,
      [digestToken(parsed.data.token)],
    );

    if (!found.rowCount) {
      return reply.send(schoolAdminActivationLookupSchema.parse({ valid: false }));
    }

    const row = found.rows[0]!;
    return reply.send(schoolAdminActivationLookupSchema.parse({
      valid: true,
      email: row.email,
      name: row.name,
      schoolName: row.school_name,
    }));
  });

  app.post('/api/admin-activations/accept', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = bootstrapSchoolAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'ACTIVATION_INVALID', message: GENERIC_ACTIVATION_ERROR } });
    }

    const tokenHash = digestToken(parsed.data.token);
    const client = await schoolDbPool.connect();

    try {
      await client.query('BEGIN');
      const candidate = await client.query<{ email: string }>(
        `SELECT email
         FROM school_tenant_admin_activation
         WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
        [tokenHash],
      );
      const candidateEmail = candidate.rows[0]?.email;
      if (!candidateEmail) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: { code: 'ACTIVATION_INVALID', message: GENERIC_ACTIVATION_ERROR } });
      }

      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [candidateEmail]);

      const found = await client.query<{
        id: string;
        tenant_id: string;
        email: string;
        name: string;
        organization_id: string | null;
        status: string;
      }>(
        `SELECT a.id, a.tenant_id, a.email, COALESCE(a.name, a.email) AS name, st.organization_id, st.status
         FROM school_tenant_admin_activation a
         JOIN school_tenants st ON st.id = a.tenant_id
         WHERE a.token_hash = $1
           AND a.consumed_at IS NULL
           AND a.expires_at > now()
         FOR UPDATE OF a`,
        [tokenHash],
      );

      const activation = found.rows[0];
      if (!activation || activation.status !== 'active' || !activation.organization_id) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: { code: 'ACTIVATION_INVALID', message: GENERIC_ACTIVATION_ERROR } });
      }

      const now = new Date();
      const passwordHash = await hashPassword(parsed.data.password);
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(btrim(email)) = $1 FOR UPDATE`,
        [activation.email],
      );

      let userId: string;
      if (existingUser.rows[0]) {
        userId = existingUser.rows[0].id;
        await client.query(
          `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $3, $4, $5, $5)
           ON CONFLICT ("providerId", "accountId") DO NOTHING`,
          [randomUUID(), userId, userId, passwordHash, now],
        );
      } else {
        userId = randomUUID();
        await client.query(
          `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, true, $4, $4)`,
          [userId, activation.name, activation.email, now],
        );
        await client.query(
          `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
          [randomUUID(), userId, userId, passwordHash, now],
        );
      }

      await client.query(
        `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
         VALUES ($1, $2, $3, 'school_admin', $4)
         ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'school_admin'`,
        [randomUUID(), activation.organization_id, userId, now],
      );

      await client.query(
        `UPDATE school_tenant_admin_activation SET consumed_at = $2 WHERE id = $1`,
        [activation.id, now],
      );

      await client.query(
        `INSERT INTO school_authz_audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'admin.activated', 'tenant', $1)`,
        [activation.tenant_id, userId],
      );

      await client.query('COMMIT');
      return reply.send(schoolAdminActivationAcceptanceSchema.parse({ activated: true }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Failed to accept school admin activation');
      return reply.code(400).send({ error: { code: 'ACTIVATION_INVALID', message: GENERIC_ACTIVATION_ERROR } });
    } finally {
      client.release();
    }
  });
}
