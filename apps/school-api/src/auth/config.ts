import { betterAuth } from 'better-auth';
import { createAccessControl, organization } from 'better-auth/plugins';
import { schoolDbPool } from '../db/pool.js';

const schoolStatements = {
  academic_year: ['read', 'manage'],
  class: ['read', 'manage'],
  student: ['read', 'create', 'update', 'delete'],
} as const;

const schoolAccess = createAccessControl(schoolStatements);
const schoolAdminRole = schoolAccess.newRole({
  academic_year: ['read', 'manage'],
  class: ['read', 'manage'],
  student: ['read', 'create', 'update', 'delete'],
});
const schoolStaffRole = schoolAccess.newRole({
  academic_year: ['read'],
  class: ['read'],
  student: ['read'],
});

const authSecret = process.env.SCHOOL_AUTH_SECRET;
const baseURL = process.env.SCHOOL_AUTH_URL ?? 'http://localhost:4002';
const trustedOrigins = (process.env.SCHOOL_TRUSTED_ORIGINS ?? 'http://localhost:5174,http://localhost:5175')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!authSecret || authSecret.length < 32) throw new Error('SCHOOL_AUTH_SECRET must be at least 32 characters');

export const schoolAuth = betterAuth({
  appName: 'EduSync School',
  baseURL,
  basePath: '/api/auth',
  secret: authSecret,
  trustedOrigins,
  database: schoolDbPool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  },
  // A school user belongs to exactly one school, so the active organization is a
  // property of the account rather than something the browser has to select. Setting
  // it here means every session carries it from the moment it is created, and
  // getSchoolPrincipal can resolve a tenant without the client calling set-active.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const userId = session.userId as string | undefined;
          if (!userId) return;
          const result = await schoolDbPool.query<{ organizationId: string }>(
            `SELECT m."organizationId" AS "organizationId"
             FROM member m
             JOIN school_tenants t ON t.organization_id = m."organizationId" AND t.status = 'active'
             WHERE m."userId" = $1
             ORDER BY m."createdAt"
             LIMIT 1`,
            [userId],
          );
          const organizationId = result.rows[0]?.organizationId;
          // No membership means no tenant: leave it unset so school routes answer 401
          // rather than guessing an organization the user does not belong to.
          if (!organizationId) return;
          return { data: { ...session, activeOrganizationId: organizationId } };
        },
      },
    },
  },
  plugins: [organization({
    allowUserToCreateOrganization: false,
    creatorRole: 'school_admin',
    membershipLimit: 500,
    ac: schoolAccess,
    roles: {
      school_admin: schoolAdminRole,
      school_staff: schoolStaffRole,
    },
    schema: {
      session: { fields: { activeOrganizationId: 'activeOrganizationId' } },
    },
  })],
});
