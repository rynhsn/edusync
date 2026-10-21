import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  acceptPlatformOperatorInviteSchema,
  invitePlatformOperatorSchema,
  platformInviteTokenRequestSchema,
  platformOperatorListSchema,
  platformOperatorSchema,
  updatePlatformOperatorRoleSchema,
  updatePlatformOperatorStatusSchema,
  platformInviteIdSchema,
  platformOperatorIdSchema,
} from '@edusync/contracts';
import { hashPassword } from 'better-auth/crypto';
import { platformAuth } from '../auth/config.js';
import { getPlatformSession } from '../auth/routes.js';
import { hasPlatformPermission } from '../auth/permissions.js';
import { platformDbPool } from '../db/pool.js';
import { sendOperatorInvitation } from './mailer.js';

const INVITE_LIFETIME_HOURS = 48;
const GENERIC_INVITE_ERROR = 'This invitation is invalid or has expired.';
const operatorRoles = ['platform_admin', 'platform_read_only'];

type InvitationRow = {
  id: string; email: string; name: string; role: string; token_hash: string;
  expires_at: Date; created_at: Date; accepted_at: Date | null; revoked_at: Date | null;
  delivery_failed: boolean; sent_at: Date | null; active: boolean;
};

function invitationStatus(row: InvitationRow): 'pending' | 'expired' | 'accepted' | 'revoked' | 'delivery_failed' {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at.getTime() <= Date.now()) return 'expired';
  return row.delivery_failed ? 'delivery_failed' : 'pending';
}

function inviteDto(row: InvitationRow) {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role as 'platform_admin' | 'platform_read_only',
    status: invitationStatus(row), expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString(),
  };
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function error(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export async function registerOperatorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/operators', async (request, reply) => {
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!(await hasPlatformPermission(request, 'operator.read'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const [users, invitations] = await Promise.all([
      platformDbPool.query<{ id: string; name: string; email: string; role: string; emailVerified: boolean; banned: boolean; createdAt: Date; updatedAt: Date }>(
        `SELECT id, name, email, role, "emailVerified", COALESCE(banned, false) AS banned, "createdAt", "updatedAt"
         FROM "user" WHERE role = ANY($1::text[]) ORDER BY "createdAt" DESC LIMIT 100`, [operatorRoles]),
      platformDbPool.query<InvitationRow>(
        `SELECT id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active
         FROM platform_operator_invitations WHERE created_at > now() - interval '90 days'
         ORDER BY created_at DESC LIMIT 100`),
    ]);
    return reply.send(platformOperatorListSchema.parse({
      operators: users.rows.map((user) => platformOperatorSchema.parse({
        id: user.id, name: user.name, email: user.email, role: user.role,
        emailVerified: user.emailVerified, disabled: user.banned,
        createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
      })),
      invitations: invitations.rows.map(inviteDto),
    }));
  });

  app.post('/api/operators/invitations', async (request, reply) => {
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!(await hasPlatformPermission(request, 'operator.manage'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const parsed = invitePlatformOperatorSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, 'INVALID_OPERATOR', 'Enter a valid name, email, and role');
    const { name, email, role } = parsed.data;
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_HOURS * 60 * 60 * 1000);
    const client = await platformDbPool.connect();
    let invitation: InvitationRow;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);
      // Expired invitations no longer reserve this normalized address.
      await client.query(
        `UPDATE platform_operator_invitations SET active = false, revoked_at = now()
         WHERE email = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()`, [email]);
      await client.query(
        `UPDATE platform_operator_invitations SET revoked_at = now()
         WHERE email = $1 AND active = false AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()`, [email]);
      const existing = await client.query('SELECT 1 FROM "user" WHERE lower(btrim(email)) = $1', [email]);
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 409, 'DUPLICATE_OPERATOR', 'An account already exists for this email');
      }
      const pending = await client.query(
        `SELECT 1 FROM platform_operator_invitations WHERE email = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() LIMIT 1`, [email]);
      if (pending.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 409, 'DUPLICATE_OPERATOR', 'An active invitation already exists for this email');
      }
      const inserted = await client.query<InvitationRow>(
        `INSERT INTO platform_operator_invitations (email, name, role, token_hash, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active`,
        [email, name, role, digestToken(rawToken), actor.user.id, expiresAt]);
      invitation = inserted.rows[0]!;
      await client.query(
        `INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'operator.invited', 'operator_invitation', $2, $3::jsonb)`,
        [actor.user.id, invitation.id, JSON.stringify({ email, role })]);
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to create Platform operator invitation');
      return error(reply, 500, 'INVITATION_CREATE_FAILED', 'Invitation could not be created');
    } finally {
      client.release();
    }
    const sent = await sendOperatorInvitation({ to: email, name, role, url: rawToken, expiresAt });
    const deliveryState = await platformDbPool.query(
      `UPDATE platform_operator_invitations SET delivery_failed = $3, sent_at = CASE WHEN $3 THEN NULL ELSE now() END
       WHERE id = $1 AND token_hash = $2 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL
       RETURNING id`, [invitation.id, invitation.token_hash, !sent]);
    if (deliveryState.rowCount) {
      return reply.code(201).send({ invitation: { ...inviteDto({ ...invitation, delivery_failed: !sent, sent_at: sent ? new Date() : null }), status: sent ? 'pending' : 'delivery_failed' }, delivery: sent ? 'sent' : 'failed' });
    }
    const latest = await platformDbPool.query<InvitationRow>(
      `SELECT id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active
       FROM platform_operator_invitations WHERE id = $1`, [invitation.id]);
    return reply.code(201).send({ invitation: latest.rows[0] ? inviteDto(latest.rows[0]) : inviteDto(invitation), delivery: sent ? 'sent' : 'failed' });
  });

  app.post<{ Params: { invitationId: string } }>('/api/operators/invitations/:invitationId/resend', async (request, reply) => {
    if (!(await hasPlatformPermission(request, 'operator.manage'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const invitationId = request.params.invitationId;
    if (!platformInviteIdSchema.safeParse(invitationId).success) return error(reply, 400, 'INVALID_INVITATION', GENERIC_INVITE_ERROR);
    const rawToken = randomBytes(32).toString('base64url');
    const client = await platformDbPool.connect();
    let row: InvitationRow | undefined;
    try {
      await client.query('BEGIN');
      // Read the address first, then serialize all invitation lifecycle changes by normalized email.
      const address = await client.query<{ email: string }>(
        'SELECT email FROM platform_operator_invitations WHERE id = $1', [invitationId]);
      if (!address.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 404, 'INVITATION_NOT_FOUND', GENERIC_INVITE_ERROR);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [address.rows[0]!.email]);
      const locked = await client.query<InvitationRow>(
        `SELECT id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active
         FROM platform_operator_invitations WHERE id = $1 FOR UPDATE`, [invitationId]);
      row = locked.rows[0];
      if (!row || row.accepted_at || row.revoked_at) {
        await client.query('ROLLBACK');
        return error(reply, 404, 'INVITATION_NOT_FOUND', GENERIC_INVITE_ERROR);
      }
      const anotherPending = await client.query(
        `SELECT 1 FROM platform_operator_invitations
         WHERE email = $1 AND id <> $2 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         LIMIT 1`, [row.email, invitationId]);
      if (anotherPending.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 409, 'DUPLICATE_INVITATION', 'Another active invitation already exists for this email');
      }
      if (row.expires_at.getTime() <= Date.now()) {
        await client.query(
          `UPDATE platform_operator_invitations SET active = false, revoked_at = now() WHERE id = $1`, [invitationId]);
        const inserted = await client.query<InvitationRow>(
          `INSERT INTO platform_operator_invitations (email, name, role, token_hash, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, now() + ($6::int * interval '1 hour'))
           RETURNING id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active`,
          [row.email, row.name, row.role, digestToken(rawToken), actor.user.id, INVITE_LIFETIME_HOURS]);
        row = inserted.rows[0]!;
        await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'operator.invite_resent', 'operator_invitation', $2, $3::jsonb)`, [actor.user.id, row.id, JSON.stringify({ email: row.email, replacedInvitationId: invitationId })]);
      } else {
        row.expires_at = new Date(Date.now() + INVITE_LIFETIME_HOURS * 60 * 60 * 1000);
        row.token_hash = digestToken(rawToken);
        const update = await client.query<InvitationRow>(
          `UPDATE platform_operator_invitations SET token_hash = $2, expires_at = $3, delivery_failed = false, sent_at = NULL, active = true
           WHERE id = $1 RETURNING id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active`,
          [invitationId, row.token_hash, row.expires_at]);
        row = update.rows[0]!;
        await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'operator.invite_resent', 'operator_invitation', $2, $3::jsonb)`, [actor.user.id, invitationId, JSON.stringify({ email: row.email })]);
      }
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to rotate operator invitation');
      return error(reply, 500, 'INVITATION_UPDATE_FAILED', 'Invitation could not be resent');
    } finally {
      client.release();
    }
    const delivery = await sendOperatorInvitation({ to: row.email, name: row.name, role: row.role as 'platform_admin' | 'platform_read_only', url: rawToken, expiresAt: row.expires_at });
    const deliveryState = await platformDbPool.query(
      `UPDATE platform_operator_invitations SET delivery_failed = $3, sent_at = CASE WHEN $3 THEN NULL ELSE now() END
       WHERE id = $1 AND token_hash = $2 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL
       RETURNING id`, [row.id, row.token_hash, !delivery]);
    if (row.id !== invitationId) {
      await platformDbPool.query(
        `UPDATE platform_operator_invitations SET active = false, revoked_at = now()
         WHERE id = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL`, [invitationId]);
    }
    const current = deliveryState.rowCount ? { ...row, delivery_failed: !delivery, sent_at: delivery ? new Date() : null } : row;
    const status = deliveryState.rowCount ? (delivery ? 'pending' : 'delivery_failed') : invitationStatus(row);
    return reply.send({ invitation: { ...inviteDto(current), status }, delivery: delivery ? 'sent' : 'failed' });
  });

  app.post<{ Params: { invitationId: string } }>('/api/operators/invitations/:invitationId/revoke', async (request, reply) => {
    if (!(await hasPlatformPermission(request, 'operator.manage'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const id = request.params.invitationId;
    if (!platformInviteIdSchema.safeParse(id).success) return error(reply, 400, 'INVALID_INVITATION', GENERIC_INVITE_ERROR);
    const client = await platformDbPool.connect();
    try {
      await client.query('BEGIN');
      const address = await client.query<{ email: string }>(
        'SELECT email FROM platform_operator_invitations WHERE id = $1', [id]);
      if (!address.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 404, 'INVITATION_NOT_FOUND', GENERIC_INVITE_ERROR);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [address.rows[0]!.email]);
      const result = await client.query<{ email: string }>(
        `UPDATE platform_operator_invitations SET revoked_at = now(), active = false
         WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email`, [id]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 404, 'INVITATION_NOT_FOUND', GENERIC_INVITE_ERROR);
      }
      await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'operator.invite_revoked', 'operator_invitation', $2, $3::jsonb)`, [actor.user.id, id, JSON.stringify({ email: result.rows[0]!.email })]);
      await client.query('COMMIT');
      return reply.send({ updated: true });
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to revoke operator invitation');
      return error(reply, 500, 'INVITATION_UPDATE_FAILED', 'Invitation could not be revoked');
    } finally { client.release(); }
  });

  app.post<{ Params: { operatorId: string } }>('/api/operators/:operatorId/role', async (request, reply) => {
    if (!(await hasPlatformPermission(request, 'operator.manage'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const body = updatePlatformOperatorRoleSchema.safeParse(request.body);
    if (!body.success) return error(reply, 400, 'INVALID_OPERATOR', 'Choose a valid role');
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const id = request.params.operatorId;
    if (!platformOperatorIdSchema.safeParse(id).success) return error(reply, 400, 'INVALID_OPERATOR', 'Operator not found');
    const client = await platformDbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [73190421]);
      const target = await client.query<{ email: string; role: string }>(`SELECT email, role FROM "user" WHERE id = $1 AND role = ANY($2::text[]) FOR UPDATE`, [id, operatorRoles]);
      if (!target.rowCount) { await client.query('ROLLBACK'); return error(reply, 404, 'OPERATOR_NOT_FOUND', 'Operator not found'); }
      const before = target.rows[0]!;
      if (id === actor.user.id && before.role !== body.data.role) { await client.query('ROLLBACK'); return error(reply, 400, 'SELF_CHANGE', 'You cannot change your own role'); }
      if (before.role === 'platform_admin' && body.data.role !== 'platform_admin') {
        const admins = await client.query(`SELECT id FROM "user" WHERE role = 'platform_admin' AND COALESCE(banned, false) = false`);
        if ((admins.rowCount ?? 0) <= 1) { await client.query('ROLLBACK'); return error(reply, 409, 'LAST_ADMIN', 'At least one active platform admin must remain'); }
      }
      await client.query(`UPDATE "user" SET role = $2, "updatedAt" = now() WHERE id = $1`, [id, body.data.role]);
      await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [id]);
      await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'operator.role_updated', 'operator', NULL, $2::jsonb)`, [actor.user.id, JSON.stringify({ operatorId: id, email: before.email, role: body.data.role })]);
      await client.query('COMMIT');
      return reply.send({ updated: true });
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to update Platform operator role');
      return error(reply, 500, 'OPERATOR_UPDATE_FAILED', 'Operator role could not be updated');
    } finally { client.release(); }
  });

  app.post<{ Params: { operatorId: string } }>('/api/operators/:operatorId/status', async (request, reply) => {
    if (!(await hasPlatformPermission(request, 'operator.manage'))) return error(reply, 403, 'FORBIDDEN', 'Insufficient permission');
    const body = updatePlatformOperatorStatusSchema.safeParse(request.body);
    if (!body.success) return error(reply, 400, 'INVALID_OPERATOR', 'Choose a valid operator status');
    const actor = await getPlatformSession(platformAuth, request);
    if (!actor) return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const id = request.params.operatorId;
    if (id === actor.user.id && body.data.disabled) return error(reply, 400, 'SELF_CHANGE', 'You cannot disable your own account');
    const client = await platformDbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [73190421]);
      const target = await client.query<{ email: string; role: string }>(`SELECT email, role FROM "user" WHERE id = $1 AND role = ANY($2::text[]) FOR UPDATE`, [id, operatorRoles]);
      if (!target.rowCount) { await client.query('ROLLBACK'); return error(reply, 404, 'OPERATOR_NOT_FOUND', 'Operator not found'); }
      const operator = target.rows[0]!;
      if (body.data.disabled && operator.role === 'platform_admin') {
        const admins = await client.query(`SELECT id FROM "user" WHERE role = 'platform_admin' AND COALESCE(banned, false) = false`);
        if ((admins.rowCount ?? 0) <= 1) { await client.query('ROLLBACK'); return error(reply, 409, 'LAST_ADMIN', 'At least one active platform admin must remain'); }
      }
      await client.query(`UPDATE "user" SET banned = $2, "banReason" = CASE WHEN $2 THEN 'Disabled by Platform administrator' ELSE NULL END, "banExpires" = NULL, "updatedAt" = now() WHERE id = $1`, [id, body.data.disabled]);
      if (body.data.disabled) await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [id]);
      const action = body.data.disabled ? 'operator.disabled' : 'operator.enabled';
      await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, $2, 'operator', NULL, $3::jsonb)`, [actor.user.id, action, JSON.stringify({ operatorId: id, email: operator.email })]);
      await client.query('COMMIT');
      return reply.send({ updated: true });
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to update Platform operator status');
      return error(reply, 500, 'OPERATOR_UPDATE_FAILED', 'Operator status could not be updated');
    } finally { client.release(); }
  });

  app.post('/api/operator-invitations/lookup', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = platformInviteTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.send({ valid: false });
    const found = await platformDbPool.query<{ email: string; name: string }>(
      `SELECT email, name FROM platform_operator_invitations WHERE token_hash = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, [digestToken(parsed.data.token)]);
    return reply.send(found.rowCount ? { valid: true, email: found.rows[0]!.email, name: found.rows[0]!.name } : { valid: false });
  });

  app.post('/api/operator-invitations/accept', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = acceptPlatformOperatorInviteSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR);
    const tokenHash = digestToken(parsed.data.token);
    const client = await platformDbPool.connect();
    try {
      await client.query('BEGIN');
      const candidate = await client.query<{ email: string }>(
        `SELECT email FROM platform_operator_invitations WHERE token_hash = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, [tokenHash]);
      const candidateEmail = candidate.rows[0]?.email;
      if (!candidateEmail) { await client.query('ROLLBACK'); return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR); }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [candidateEmail]);
      const found = await client.query<InvitationRow>(
        `SELECT id, email, name, role, token_hash, expires_at, created_at, accepted_at, revoked_at, delivery_failed, sent_at, active
         FROM platform_operator_invitations WHERE token_hash = $1 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [tokenHash]);
      const invitation = found.rows[0];
      if (!invitation) { await client.query('ROLLBACK'); return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR); }
      const duplicate = await client.query(`SELECT 1 FROM "user" WHERE lower(btrim(email)) = $1`, [invitation.email]);
      const anotherPending = await client.query(
        `SELECT 1 FROM platform_operator_invitations WHERE email = $1 AND id <> $2 AND active = true AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
        [invitation.email, invitation.id]);
      if (anotherPending.rowCount) { await client.query('ROLLBACK'); return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR); }
      if (duplicate.rowCount) { await client.query('ROLLBACK'); return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR); }
      const userId = randomUUID();
      const accountId = randomUUID();
      const now = new Date();
      const passwordHash = await hashPassword(parsed.data.password);
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, $5, $5)`,
        [userId, invitation.name, invitation.email, invitation.role, now]);
      await client.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
        [accountId, userId, userId, passwordHash, now]);
      await client.query(`UPDATE platform_operator_invitations SET accepted_at = now() WHERE id = $1`, [invitation.id]);
      await client.query(`INSERT INTO platform_audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (NULL, 'operator.invite_accepted', 'operator', NULL, $1::jsonb)`, [JSON.stringify({ email: invitation.email, role: invitation.role })]);
      await client.query('COMMIT');
      return reply.send({ accepted: true });
    } catch (cause) {
      await client.query('ROLLBACK');
      request.log.error({ err: cause }, 'Failed to accept Platform operator invitation');
      return error(reply, 400, 'INVITATION_INVALID', GENERIC_INVITE_ERROR);
    } finally { client.release(); }
  });
}
