import { betterAuth } from 'better-auth';
import { admin, createAccessControl } from 'better-auth/plugins';
import { platformDbPool } from '../db/pool.js';

const platformStatements = {
  tenant: ['read', 'create', 'manage-access'],
  operator: ['read', 'manage'],
  subscription: ['read', 'manage'],
} as const;

const platformAccess = createAccessControl(platformStatements);
const platformAdminRole = platformAccess.newRole({
  tenant: ['read', 'create', 'manage-access'],
  operator: ['read', 'manage'],
  subscription: ['read', 'manage'],
});
const platformReadOnlyRole = platformAccess.newRole({
  tenant: ['read'],
  operator: ['read'],
  subscription: ['read'],
});
// Customer account that creates and manages its own schools: operators see their rows,
// admins may manage all of them, and customers only see the ones they own.
const platformUserRole = platformAccess.newRole({
  tenant: ['read', 'create'],
  subscription: ['read', 'manage'],
});

const authSecret = process.env.PLATFORM_AUTH_SECRET;
const baseURL = process.env.PLATFORM_AUTH_URL ?? 'http://localhost:4001';
const trustedOrigins = (process.env.PLATFORM_TRUSTED_ORIGINS ?? 'http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!authSecret || authSecret.length < 32) throw new Error('PLATFORM_AUTH_SECRET must be at least 32 characters');

export const platformAuth = betterAuth({
  appName: 'EduSync Platform',
  baseURL,
  basePath: '/api/auth',
  secret: authSecret,
  trustedOrigins,
  database: platformDbPool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    // Operators are invite-only, so public self-registration cannot mint a read-only
    // operator account. Account managers self-register through their own route.
    disableSignUp: true,
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
  plugins: [admin({
    ac: platformAccess,
    roles: {
      platform_admin: platformAdminRole,
      platform_read_only: platformReadOnlyRole,
      platform_user: platformUserRole,
    },
    defaultRole: 'platform_read_only',
    adminRoles: ['platform_admin'],
  })],
});
