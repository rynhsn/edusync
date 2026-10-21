import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  requestPasswordResetSchema,
  resetPasswordWithOtpSchema,
  verifyPasswordResetOtpSchema,
} from '@edusync/contracts';
import { hashPassword } from 'better-auth/crypto';
import { platformDbPool } from '../db/pool.js';
import { sendPasswordResetOtp } from '../operators/mailer.js';

const OTP_LIFETIME_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_RESET_ERROR = 'Invalid email or OTP. Password reset failed.';

// The OTP is stored as an unsalted SHA-256 digest, so the whole 10^6 space is walkable in
// about a second. A CSPRNG does not fix that on its own, but Math.random() is additionally
// predictable from observed outputs, which would let an attacker who has seen one code
// derive the next one instead of having to brute-force it.
function generateOtp(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0');
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function error(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

/**
 * Roll back without letting a second failure mask the first.
 *
 * When the connection itself is gone, `BEGIN` rejects and the ROLLBACK in the catch block rejects
 * too. Awaiting it unguarded would replace the handler's own error envelope with Fastify's generic
 * 500 body, so the client loses the code it needs to react to. The connection is being released
 * either way; the rollback is best-effort.
 */
async function safeRollback(client: { query: (text: string) => Promise<unknown> }): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Nothing useful to do: the original failure is the one worth reporting.
  }
}

export async function registerPasswordResetRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = requestPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, 'INVALID_EMAIL', 'Enter a valid email address');

    const { email } = parsed.data;
    const client = await platformDbPool.connect();

    try {
      await client.query('BEGIN');

      // Check if user exists
      const user = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(btrim(email)) = $1`,
        [email.toLowerCase()]
      );

      if (!user.rowCount) {
        // Don't reveal if email exists (security best practice)
        await client.query('COMMIT');
        return reply.send({ sent: true });
      }

      // Clean up expired OTPs for this email
      await client.query(
        `DELETE FROM password_reset_otp WHERE email = $1 AND (used_at IS NOT NULL OR expires_at <= now())`,
        [email.toLowerCase()]
      );

      // Check for existing pending OTP (rate limiting)
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM password_reset_otp WHERE email = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
        [email.toLowerCase()]
      );

      if (existing.rowCount) {
        await client.query('COMMIT');
        // Don't reveal if OTP already exists
        return reply.send({ sent: true });
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_LIFETIME_MINUTES * 60 * 1000);
      const otpHash = digestToken(otp);
      const id = randomUUID();

      await client.query(
        `INSERT INTO password_reset_otp (id, email, otp_hash, expires_at) VALUES ($1, $2, $3, $4)`,
        [id, email.toLowerCase(), otpHash, expiresAt]
      );

      await client.query('COMMIT');

      // Send OTP email asynchronously (don't block the response)
      sendPasswordResetOtp({ to: email, otp, expiresAt }).catch((err) => {
        request.log.error({ err }, 'Failed to send password reset OTP');
      });

      return reply.send({ sent: true });
    } catch (cause) {
      await safeRollback(client);
      request.log.error({ err: cause }, 'Failed to create password reset OTP');
      return error(reply, 500, 'OTP_CREATE_FAILED', 'Password reset request could not be processed');
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/reset-password', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = resetPasswordWithOtpSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, 'INVALID_INPUT', GENERIC_RESET_ERROR);

    const { email, otp, password } = parsed.data;
    const otpHash = digestToken(otp);
    const client = await platformDbPool.connect();

    try {
      await client.query('BEGIN');

      // Find the OTP record
      const otpRecord = await client.query<{ id: string; attempts: number; used_at: Date | null }>(
        `SELECT id, attempts, used_at FROM password_reset_otp
         WHERE email = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [email.toLowerCase()]
      );

      if (!otpRecord.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 400, 'INVALID_OTP', GENERIC_RESET_ERROR);
      }

      const record = otpRecord.rows[0]!;

      // Check attempt limit
      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        await client.query(
          `UPDATE password_reset_otp SET used_at = now() WHERE id = $1`,
          [record.id]
        );
        await client.query('COMMIT');
        return error(reply, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Request a new code.');
      }

      // Verify OTP using timing-safe comparison
      const storedHash = await client.query<{ otp_hash: string }>(
        `SELECT otp_hash FROM password_reset_otp WHERE id = $1`,
        [record.id]
      );

      if (!storedHash.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 400, 'INVALID_OTP', GENERIC_RESET_ERROR);
      }

      // Timing-safe comparison
      const providedHash = otpHash;
      const expectedHash = storedHash.rows[0]!.otp_hash;
      const providedBytes = new TextEncoder().encode(providedHash);
      const expectedBytes = new TextEncoder().encode(expectedHash);

      let difference = providedBytes.length !== expectedBytes.length ? 1 : 0;
      for (let index = 0; index < Math.min(providedBytes.length, expectedBytes.length); index += 1) {
        difference |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
      }

      if (difference !== 0) {
        // Increment attempts
        await client.query(
          `UPDATE password_reset_otp SET attempts = attempts + 1 WHERE id = $1`,
          [record.id]
        );
        await client.query('COMMIT');
        return error(reply, 400, 'INVALID_OTP', GENERIC_RESET_ERROR);
      }

      // Mark OTP as used
      await client.query(
        `UPDATE password_reset_otp SET used_at = now() WHERE id = $1`,
        [record.id]
      );

      // Get user and update password
      const user = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(btrim(email)) = $1`,
        [email.toLowerCase()]
      );

      if (!user.rowCount) {
        await client.query('ROLLBACK');
        return error(reply, 400, 'INVALID_OTP', GENERIC_RESET_ERROR);
      }

      const userId = user.rows[0]!.id;
      const passwordHash = await hashPassword(password);

      // Update or create account
      const account = await client.query<{ id: string }>(
        `SELECT id FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
        [userId]
      );

      if (account.rowCount) {
        await client.query(
          `UPDATE account SET password = $2, "updatedAt" = now() WHERE id = $1`,
          [account.rows[0]!.id, passwordHash]
        );
      } else {
        const accountId = randomUUID();
        await client.query(
          `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $3, $4, now(), now())`,
          [accountId, userId, userId, passwordHash]
        );
      }

      // Invalidate all sessions for this user (force re-login)
      await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);

      await client.query('COMMIT');
      return reply.send({ reset: true });
    } catch (cause) {
      await safeRollback(client);
      request.log.error({ err: cause }, 'Failed to reset password');
      return error(reply, 500, 'RESET_FAILED', 'Password could not be reset');
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/verify-reset-otp', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = verifyPasswordResetOtpSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, 'INVALID_INPUT', GENERIC_RESET_ERROR);

    const { email, otp } = parsed.data;
    const otpHash = digestToken(otp);
    const client = await platformDbPool.connect();

    try {
      await client.query('BEGIN');

      // Lock the pending OTP so a wrong guess here consumes one of the same five attempts
      // that reset-password enforces. Without this, verification was an unmetered oracle:
      // an attacker could walk the 10^6 space through this endpoint and only ever pay for
      // the single guess they then spent on reset-password.
      const otpRecord = await client.query<{ id: string; attempts: number }>(
        `SELECT id, attempts FROM password_reset_otp
         WHERE email = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [email.toLowerCase()]
      );

      if (!otpRecord.rowCount) {
        await client.query('ROLLBACK');
        return reply.send({ valid: false });
      }

      const record = otpRecord.rows[0]!;

      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        await client.query(
          `UPDATE password_reset_otp SET used_at = now() WHERE id = $1`,
          [record.id]
        );
        await client.query('COMMIT');
        return error(reply, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Request a new code.');
      }

      const storedHash = await client.query<{ otp_hash: string }>(
        `SELECT otp_hash FROM password_reset_otp WHERE id = $1`,
        [record.id]
      );

      if (!storedHash.rowCount) {
        await client.query('ROLLBACK');
        return reply.send({ valid: false });
      }

      // Timing-safe comparison, identical to reset-password.
      const expectedBytes = new TextEncoder().encode(storedHash.rows[0]!.otp_hash);
      const providedBytes = new TextEncoder().encode(otpHash);

      let difference = providedBytes.length !== expectedBytes.length ? 1 : 0;
      for (let index = 0; index < Math.min(providedBytes.length, expectedBytes.length); index += 1) {
        difference |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
      }

      if (difference !== 0) {
        await client.query(
          `UPDATE password_reset_otp SET attempts = attempts + 1 WHERE id = $1`,
          [record.id]
        );
        await client.query('COMMIT');
        return reply.send({ valid: false });
      }

      // A successful verification deliberately leaves the OTP unconsumed: reset-password
      // marks it used when it actually changes the password.
      await client.query('COMMIT');
      return reply.send({ valid: true });
    } catch (cause) {
      await safeRollback(client);
      request.log.error({ err: cause }, 'Failed to verify password reset OTP');
      return error(reply, 500, 'OTP_VERIFY_FAILED', 'Password reset code could not be verified');
    } finally {
      client.release();
    }
  });
}
