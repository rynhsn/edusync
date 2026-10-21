import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { platformDbPool } from './pool.js';

async function seedPlatformAdmin(): Promise<void> {
  if (process.env.NODE_ENV !== 'development' || process.env.PLATFORM_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('Platform admin bootstrap requires NODE_ENV=development and PLATFORM_BOOTSTRAP_ENABLED=true');
  }

  const email = process.env.PLATFORM_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 12 || password.length > 128) {
    throw new Error('Set PLATFORM_BOOTSTRAP_EMAIL and a 12–128 character PLATFORM_BOOTSTRAP_PASSWORD');
  }

  const client = await platformDbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);
    const existing = await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
    if (existing.rowCount) {
      throw new Error('A Platform account already exists for PLATFORM_BOOTSTRAP_EMAIL; bootstrap will not promote or modify existing accounts');
    }

    const now = new Date();
    const userId = randomUUID();
    const accountId = randomUUID();
    const passwordHash = await hashPassword(password);
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'platform_admin', $4, $4)`,
      [userId, 'Platform Administrator', email, now],
    );
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
      [accountId, userId, userId, passwordHash, now],
    );
    await client.query('COMMIT');
    console.info('Development Platform admin account created. Sign in with the configured bootstrap email and password.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seedPlatformAdmin()
  .catch((error: unknown) => {
    console.error('Platform admin bootstrap failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformDbPool.end();
  });
