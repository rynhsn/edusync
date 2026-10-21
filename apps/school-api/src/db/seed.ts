import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { schoolDbPool } from './pool.js';

// A real school tenant is created by the Platform API's provisioning call, which
// deliberately creates no user and no membership (admin activation is not
// implemented). That leaves a fresh development database with no way to sign in, so
// this dev-only bootstrap stands up one school plus its first accounts directly.
// It never touches an account that already exists.
const DEV_PLATFORM_TENANT_ID = '00000000-0000-4000-8000-000000000001';

interface BootstrapAccount {
  email: string;
  password: string;
  name: string;
  role: 'school_admin' | 'school_staff';
}

function requireCredential(
  label: string,
  name: string,
  role: BootstrapAccount['role'],
  email?: string,
  password?: string,
): BootstrapAccount {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password || password.length < 12 || password.length > 128) {
    throw new Error(`Set ${label}_EMAIL and a 12–128 character ${label}_PASSWORD`);
  }
  return { email: normalizedEmail, password, name, role };
}

async function seedSchool(): Promise<void> {
  if (process.env.NODE_ENV !== 'development' || process.env.SCHOOL_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('School bootstrap requires NODE_ENV=development and SCHOOL_BOOTSTRAP_ENABLED=true');
  }

  const admin = requireCredential(
    'SCHOOL_BOOTSTRAP',
    'Kepala Sekolah',
    'school_admin',
    process.env.SCHOOL_BOOTSTRAP_EMAIL,
    process.env.SCHOOL_BOOTSTRAP_PASSWORD,
  );

  // Optional second account so the school_staff read-only role can be exercised.
  const staffEmail = process.env.SCHOOL_BOOTSTRAP_STAFF_EMAIL?.trim().toLowerCase();
  const staffPassword = process.env.SCHOOL_BOOTSTRAP_STAFF_PASSWORD;
  const staff = staffEmail || staffPassword
    ? requireCredential('SCHOOL_BOOTSTRAP_STAFF', 'Staf Tata Usaha', 'school_staff', staffEmail, staffPassword)
    : undefined;

  const schoolName = process.env.SCHOOL_BOOTSTRAP_SCHOOL_NAME?.trim() || 'SMA EduSync Demo';
  const schoolSlug = process.env.SCHOOL_BOOTSTRAP_SCHOOL_SLUG?.trim() || 'sma-edusync-demo';
  const platformTenantId = process.env.SCHOOL_BOOTSTRAP_PLATFORM_TENANT_ID?.trim() || DEV_PLATFORM_TENANT_ID;

  const client = await schoolDbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`school-bootstrap:${schoolSlug}`]);

    for (const account of [admin, staff].filter((candidate): candidate is BootstrapAccount => Boolean(candidate))) {
      const existing = await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [account.email]);
      if (existing.rowCount) {
        throw new Error(`A School account already exists for ${account.email}; bootstrap will not promote or modify existing accounts`);
      }
    }

    const existingTenant = await client.query<{ id: string }>(
      'SELECT id FROM school_tenants WHERE slug = $1 OR platform_tenant_id = $2',
      [schoolSlug, platformTenantId],
    );
    if (existingTenant.rowCount) {
      throw new Error(`A School tenant already exists for slug ${schoolSlug}; remove it before re-running the bootstrap`);
    }

    const now = new Date();
    const organizationId = randomUUID();
    const schoolTenantId = randomUUID();
    await client.query(
      `INSERT INTO organization (id, name, slug, "createdAt") VALUES ($1, $2, $3, $4)`,
      [organizationId, schoolName, `${schoolSlug}-${platformTenantId.slice(0, 8)}`, now],
    );
    await client.query(
      `INSERT INTO school_tenants (id, platform_tenant_id, organization_id, name, slug, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [schoolTenantId, platformTenantId, organizationId, schoolName, schoolSlug],
    );

    for (const account of [admin, staff].filter((candidate): candidate is BootstrapAccount => Boolean(candidate))) {
      const userId = randomUUID();
      const passwordHash = await hashPassword(account.password);
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, $4)`,
        [userId, account.name, account.email, now],
      );
      await client.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
        [randomUUID(), userId, userId, passwordHash, now],
      );
      await client.query(
        `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), organizationId, userId, account.role, now],
      );
    }

    await client.query('COMMIT');
    console.info(`Development School bootstrap created "${schoolName}" with ${staff ? 'admin and staff' : 'an admin'} account.`);
    console.info('Sign in with the configured SCHOOL_BOOTSTRAP_EMAIL and password.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seedSchool()
  .catch((error: unknown) => {
    console.error('School bootstrap failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await schoolDbPool.end();
  });
