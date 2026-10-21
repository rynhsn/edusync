import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  registerPlatformUserSchema,
  platformUserRegisteredSchema,
} from '@edusync/contracts';
import { hashPassword } from 'better-auth/crypto';
import { platformDbPool } from '../db/pool.js';

// Public self-registration for a platform account manager. Operators remain invite-only,
// so this endpoint always creates a `platform_user` account. The response never reveals
// whether the address already had an account: an existing account answers with the same
// `{ registered: true, id }` body as a fresh one (password resets intentionally do the same).
const REGISTRATION_RATE_LIMIT = { max: 5, timeWindow: '1 hour' };
const GENERIC_REGISTER_ERROR = 'Registration could not be processed. Please try again.';

function error(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

async function safeRollback(client: { query: (text: string) => Promise<unknown> }): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Nothing useful to do: the original failure is the one worth reporting.
  }
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', { config: { rateLimit: REGISTRATION_RATE_LIMIT } }, async (request, reply) => {
    const parsed = registerPlatformUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(reply, 400, 'INVALID_INPUT', GENERIC_REGISTER_ERROR);
    }

    const { name, email, password } = parsed.data;
    const client = await platformDbPool.connect();
    let userId: string;
    try {
      await client.query('BEGIN');
      // Serialize concurrent registrations for the same normalized email so two
      // simultaneous requests can't both pass the existing-account check.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(btrim(email)) = $1`, [email],
      );
      if (existing.rowCount) {
        // Don't reveal the address is known. A successful reset response only proves
        // the action completed; it doesn't say who the recipient was.
        await client.query('COMMIT');
        return reply.send(platformUserRegisteredSchema.parse({ registered: true, id: existing.rows[0]!.id }));
      }

      // An active invitation for this email would let an operator bypass the public flow,
      // so reject it the same way a duplicate account would.
      const invited = await client.query<{ id: string }>(
        `SELECT id FROM platform_operator_invitations WHERE email = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
        [email],
      );
      if (invited.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 409, 'INVITATION_EXISTS', 'An invitation already exists for this email');
      }

      userId = randomUUID();
      const accountId = userId;
      const now = new Date();
      const passwordHash = await hashPassword(password);

      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, false, 'platform_user', $4, $4)`,
        [userId, name, email, now],
      );
      await client.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
        [accountId, userId, userId, passwordHash, now],
      );

      await client.query(
        `INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES (NULL, 'user.registered', 'user', $1, $2::jsonb)`,
        [userId, JSON.stringify({ name, email })],
      );
      await client.query('COMMIT');
    } catch (cause) {
      await safeRollback(client);
      request.log.error({ err: cause }, 'Failed to register Platform user');
      return error(reply, 500, 'REGISTRATION_FAILED', GENERIC_REGISTER_ERROR);
    } finally {
      client.release();
    }

    return reply.code(201).send(platformUserRegisteredSchema.parse({ registered: true, id: userId }));
  });
}
