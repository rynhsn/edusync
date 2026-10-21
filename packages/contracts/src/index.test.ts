import { describe, expect, it } from 'vitest';
import {
  createTenantSchema,
  platformPermissionSchema,
  provisioningPayloadSchema,
  invitePlatformOperatorSchema,
  acceptPlatformOperatorInviteSchema,
  platformOperatorInviteSchema,
  safeEqualSecret,
  schoolPermissionSchema,
} from './index.js';

describe('tenant provisioning contract', () => {
  const validPayload = {
    platformTenantId: '55db7a5d-57c1-4a8f-b057-4c0420ea2974',
    name: 'Sekolah Cendekia',
    slug: 'sekolah-cendekia',
    adminName: 'Admin Sekolah',
    adminEmail: 'admin@example.test',
  };

  it('accepts identity-only provisioning metadata', () => {
    expect(provisioningPayloadSchema.parse(validPayload)).toEqual(validPayload);
  });

  it.each(['password', 'passwordHash', 'adminPassword', 'adminPasswordHash'])(
    'rejects a credential field named %s',
    (credentialField) => {
      expect(provisioningPayloadSchema.safeParse({
        ...validPayload,
        [credentialField]: 'must-not-cross-the-service-boundary',
      }).success).toBe(false);
    },
  );

  it('does not accept an initial password on tenant creation', () => {
    expect(createTenantSchema.safeParse({
      name: 'Sekolah Cendekia',
      slug: 'sekolah-cendekia',
      adminName: 'Admin Sekolah',
      adminEmail: 'admin@example.test',
      adminPassword: 'initial-password',
    }).success).toBe(false);
  });
});

describe('Platform operator invitation contracts', () => {
  const invitation = {
    id: '76a5a8a3-92cf-4e81-b3b7-168ec73a9f8d',
    email: 'operator@example.com',
    name: 'Platform Operator',
    role: 'platform_admin' as const,
    status: 'delivery_failed' as const,
    expiresAt: '2026-10-19T10:00:00.000Z',
    createdAt: '2026-10-17T10:00:00.000Z',
  };

  it('normalizes invitation identity and accepts both operator roles', () => {
    expect(invitePlatformOperatorSchema.parse({
      name: '  Platform Operator ', email: 'OPERATOR@example.com', role: 'platform_read_only',
    })).toEqual({ name: 'Platform Operator', email: 'operator@example.com', role: 'platform_read_only' });
  });

  it('rejects invitation payload fields beyond name, email, and role', () => {
    expect(invitePlatformOperatorSchema.safeParse({
      name: 'Platform Operator', email: 'operator@example.test', role: 'platform_admin', password: 'never-send-passwords',
    }).success).toBe(false);
  });

  it('requires a strong invitee-chosen password and a token', () => {
    expect(acceptPlatformOperatorInviteSchema.safeParse({ token: 'x'.repeat(43), password: 'a-secure-password-123' }).success).toBe(true);
    expect(acceptPlatformOperatorInviteSchema.safeParse({ token: 'x'.repeat(43), password: 'short' }).success).toBe(false);
    expect(acceptPlatformOperatorInviteSchema.safeParse({ token: 'short', password: 'a-secure-password-123' }).success).toBe(false);
  });

  it('validates invitation lifecycle states and timestamps', () => {
    expect(platformOperatorInviteSchema.parse(invitation)).toEqual(invitation);
    expect(platformOperatorInviteSchema.safeParse({ ...invitation, status: 'pendingly' }).success).toBe(false);
    expect(platformOperatorInviteSchema.safeParse({ ...invitation, id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('permission contracts', () => {
  it('accepts only declared permission keys', () => {
    expect(platformPermissionSchema.parse('tenant.manage_access')).toBe('tenant.manage_access');
    expect(schoolPermissionSchema.parse('student.create')).toBe('student.create');
    expect(platformPermissionSchema.safeParse('school.manage').success).toBe(false);
    expect(schoolPermissionSchema.safeParse('tenant.create').success).toBe(false);
  });
});

describe('safeEqualSecret', () => {
  it('compares equal secrets and rejects different or missing values', () => {
    expect(safeEqualSecret('secret-value', 'secret-value')).toBe(true);
    expect(safeEqualSecret('secret-value', 'secret-valuF')).toBe(false);
    expect(safeEqualSecret(undefined, 'secret-value')).toBe(false);
    expect(safeEqualSecret('', '')).toBe(false);
  });

  it('compares UTF-8 values correctly', () => {
    expect(safeEqualSecret('päss🔐', 'päss🔐')).toBe(true);
    expect(safeEqualSecret('päss🔐', 'päss🔒')).toBe(false);
  });
});

