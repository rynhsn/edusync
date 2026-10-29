import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  ApiError,
  acceptInvitation,
  authErrorMessage,
  changePlatformPassword,
  createTenant,
  getAuditLogs,
  getOperators,
  getTenants,
  inviteOperator,
  lookupInvitation,
  requestPasswordReset,
  retryTenantProvisioning,
  updateOperatorRole,
  updatePlatformProfile,
  updateTenantStatus,
  verifyPasswordResetOtp,
} from '@/lib/platform-api';

const fetchMock = vi.fn();

function respond(body: unknown, status = 200): Response {
  const ok = status >= 200 && status < 300;
  return { ok, status, json: async () => body } as Response;
}

function respondUnparsable(status: number): Response {
  return { ok: false, status, json: async () => { throw new SyntaxError('Unexpected token'); } } as unknown as Response;
}

function lastCall(): { url: unknown; init: RequestInit | undefined } {
  const call = fetchMock.mock.calls.at(-1) ?? [];
  return { url: call[0], init: call[1] as RequestInit | undefined };
}

async function expectApiFailure(promise: Promise<unknown>): Promise<ApiError> {
  const cause = await promise.then(() => null, (error: unknown) => error);
  expect(cause).toBeInstanceOf(ApiError);
  return cause as ApiError;
}

const tenant = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Northfield Academy',
  slug: 'northfield-academy',
  status: 'active',
  schoolTenantId: '00000000-0000-4000-8000-000000000002',
  provisioningError: null,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:05:00.000Z',
};

const operator = {
  id: 'op-1',
  name: 'Platform Admin',
  email: 'admin@example.com',
  role: 'platform_admin',
  emailVerified: true,
  disabled: false,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const invitation = {
  id: '00000000-0000-4000-8000-000000000003',
  email: 'taylor@example.com',
  name: 'Taylor Morgan',
  role: 'platform_read_only',
  status: 'pending',
  expiresAt: '2026-10-21T10:00:00.000Z',
  createdAt: '2026-10-19T10:00:00.000Z',
};

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('request error handling', () => {
  it('maps a network failure to an unreachable-API ApiError', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await expectApiFailure(getTenants());
    expect(error.status).toBe(0);
    expect(error.message).toBe('Cannot reach the Platform API. Check your connection and try again.');
    expect(error.code).toBeUndefined();
  });

  it('surfaces API error envelopes with message, code and status', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ error: { message: 'Slug already in use.', code: 'slug_taken' } }, 409));

    const error = await expectApiFailure(getTenants());
    expect(error.status).toBe(409);
    expect(error.code).toBe('slug_taken');
    expect(error.message).toBe('Slug already in use.');
  });

  it('falls back to the rate-limit message when a 429 has no error envelope', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respondUnparsable(429));

    const error = await expectApiFailure(verifyPasswordResetOtp({ email: 'user@example.com', otp: '123456' }));
    expect(error.status).toBe(429);
    expect(error.message).toBe('Too many attempts. Wait a while and try again.');
  });

  it('falls back to the generic message for other failures without an envelope', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ unexpected: true }, 500));

    const error = await expectApiFailure(getTenants());
    expect(error.status).toBe(500);
    expect(error.message).toBe('The request could not be completed.');
  });

  it('rejects a non-array workspace list with a 502 ApiError', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ items: [] }));

    const error = await expectApiFailure(getTenants());
    expect(error.status).toBe(502);
    expect(error.message).toBe('The Platform API returned an invalid workspace list.');
  });
});

describe('authErrorMessage', () => {
  it('replaces better-auth\'s raw network failure with the unreachable-API wording', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe('Cannot reach the Platform API. Check your connection and try again.');
  });

  it('keeps a genuine API message', () => {
    expect(authErrorMessage(new Error('Check your email and password.'))).toBe('Check your email and password.');
  });

  it('treats a blank or missing message as unreachable rather than showing nothing', () => {
    expect(authErrorMessage(new Error('   '))).toBe('Cannot reach the Platform API. Check your connection and try again.');
    expect(authErrorMessage(undefined)).toBe('Cannot reach the Platform API. Check your connection and try again.');
  });
});

describe('getTenants', () => {
  it('requests with cookie credentials and parses every workspace', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond([tenant]));

    await expect(getTenants()).resolves.toEqual([tenant]);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/tenants$/);
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string> | undefined)?.['content-type']).toBeUndefined();
  });

  it('rejects with ZodError when a workspace item violates the contract', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond([{ id: 'tenant-1', name: 'Broken' }]));

    await expect(getTenants()).rejects.toBeInstanceOf(ZodError);
  });
});

describe('createTenant', () => {
  it('posts the normalized payload and parses the created workspace', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(tenant));

    const result = await createTenant({
      name: ' Northfield Academy ',
      slug: 'Northfield-Academy',
      adminName: 'Ada Admin',
      adminEmail: 'Admin@Northfield.EDU',
    });
    expect(result).toEqual(tenant);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/tenants$/);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Northfield Academy',
      slug: 'northfield-academy',
      adminName: 'Ada Admin',
      adminEmail: 'admin@northfield.edu',
    });
  });
});

describe('getOperators', () => {
  it('parses the operator and invitation lists against the contract', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const payload = { operators: [operator], invitations: [invitation] };
    fetchMock.mockResolvedValue(respond(payload));

    await expect(getOperators()).resolves.toEqual(payload);
    const { url } = lastCall();
    expect(String(url)).toMatch(/\/api\/operators$/);
  });

  it('rejects when the payload is not a valid operator list', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ operators: [{ id: 'op-1' }], invitations: [] }));

    await expect(getOperators()).rejects.toBeInstanceOf(ZodError);
  });
});

describe('operator actions', () => {
  it('posts the invitation payload and parses the delivery result', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const payload = { invitation, delivery: 'failed' };
    fetchMock.mockResolvedValue(respond(payload));

    await expect(inviteOperator({ name: 'Taylor Morgan', email: 'taylor@example.com', role: 'platform_read_only' })).resolves.toEqual(payload);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/operators\/invitations$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Taylor Morgan', email: 'taylor@example.com', role: 'platform_read_only' });
  });

  it('posts the new role for a role change', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ updated: true }));

    await expect(updateOperatorRole('op-1', 'platform_admin')).resolves.toEqual({ updated: true });

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/operators\/op-1\/role$/);
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'platform_admin' });
  });
});

describe('password reset', () => {
  it('parses the delivery-honest forgot-password response', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ sent: false }));

    await expect(requestPasswordReset({ email: 'user@example.com' })).resolves.toEqual({ sent: false });
    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/auth\/forgot-password$/);
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'user@example.com' });
  });

  it('parses OTP verification results without casting', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ valid: true }));

    await expect(verifyPasswordResetOtp({ email: 'user@example.com', otp: '123456' })).resolves.toEqual({ valid: true });

    fetchMock.mockResolvedValue(respond({ valid: 'yes' }));
    await expect(verifyPasswordResetOtp({ email: 'user@example.com', otp: '123456' })).rejects.toBeInstanceOf(ZodError);
  });
});

describe('invitations', () => {
  it('rejects an under-length invitation token before any network call', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupInvitation({ token: 'too-short' })).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a successful invitation acceptance', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ accepted: true }));

    await expect(acceptInvitation({ token: 't'.repeat(40), password: 'a-strong-passphrase' })).resolves.toEqual({ accepted: true });

    const { url } = lastCall();
    expect(String(url)).toMatch(/\/api\/operator-invitations\/accept$/);
  });
});

describe('tenant lifecycle, audit logs, and account settings', () => {
  it('patches tenant status and parses the updated workspace', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ ...tenant, status: 'suspended' }));

    await expect(updateTenantStatus(tenant.id, 'suspended')).resolves.toEqual({ ...tenant, status: 'suspended' });
    const { url, init } = lastCall();
    expect(String(url)).toMatch(new RegExp(`/api/tenants/${tenant.id}/status$`));
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'suspended' });
  });

  it('retries tenant provisioning via POST', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(tenant));

    await expect(retryTenantProvisioning(tenant.id)).resolves.toEqual(tenant);
    const { url, init } = lastCall();
    expect(String(url)).toMatch(new RegExp(`/api/tenants/${tenant.id}/retry-provisioning$`));
    expect(init?.method).toBe('POST');
  });

  it('fetches platform audit logs', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const payload = {
      logs: [{
        id: '00000000-0000-4000-8000-000000000010',
        actorUserId: 'op-1',
        actorName: 'Platform Admin',
        actorEmail: 'admin@example.com',
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenant.id,
        details: { slug: 'northfield-academy' },
        createdAt: '2026-10-19T10:00:00.000Z',
      }],
    };
    fetchMock.mockResolvedValue(respond(payload));

    await expect(getAuditLogs()).resolves.toEqual(payload);
    expect(String(lastCall().url)).toMatch(/\/api\/audit-logs$/);
  });

  it('updates account profile and changes password', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const updatedProfile = { updated: true as const, name: 'New Name' };
    fetchMock.mockResolvedValue(respond(updatedProfile));

    await expect(updatePlatformProfile({ name: ' New Name ' })).resolves.toEqual(updatedProfile);
    expect(String(lastCall().url)).toMatch(/\/api\/account\/profile$/);
    expect(lastCall().init?.method).toBe('PATCH');

    fetchMock.mockResolvedValue(respond({ updated: true }));
    await expect(changePlatformPassword({ currentPassword: 'old-password-123', newPassword: 'new-password-456' })).resolves.toEqual({ updated: true });
    expect(String(lastCall().url)).toMatch(/\/api\/account\/password$/);
    expect(lastCall().init?.method).toBe('POST');
  });
});
