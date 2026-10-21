import {
  acceptPlatformOperatorInviteSchema,
  createTenantSchema,
  invitePlatformOperatorSchema,
  operatorInviteAcceptanceSchema,
  operatorInviteCreatedSchema,
  operatorActionResultSchema,
  passwordResetOtpVerifiedSchema,
  passwordResetRequestedSchema,
  passwordResetSchema,
  platformInviteTokenRequestSchema,
  platformInviteTokenSchema,
  platformOperatorListSchema,
  platformTenantSchema,
  requestPasswordResetSchema,
  resetPasswordWithOtpSchema,
  verifyPasswordResetOtpSchema,
  type AcceptPlatformOperatorInviteInput,
  type CreateTenantInput,
  type InvitePlatformOperatorInput,
  type PlatformInviteTokenRequest,
  type PlatformOperatorList,
  type PlatformTenant,
  type RequestPasswordResetInput,
  type ResetPasswordWithOtpInput,
  type VerifyPasswordResetOtpInput,
} from '@edusync/contracts';
import { createAuthClient } from 'better-auth/react';

const baseURL = (import.meta.env.VITE_PLATFORM_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4001';

export const authClient = createAuthClient({
  baseURL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const unreachableMessage = 'Cannot reach the Platform API. Check your connection and try again.';

// better-auth reports a dropped connection as a raw "Failed to fetch". Swap that, and an
// empty message, for the wording the rest of the app uses.
export function authErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.trim() : '';
  if (!message || /failed to fetch|networkerror|load failed/i.test(message)) return unreachableMessage;
  return message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, `${baseURL}/`), {
      ...init,
      credentials: 'include',
      // Declare a JSON body only when one is actually sent. Fastify answers a bodyless
      // request that announces application/json with 400 FST_ERR_CTP_EMPTY_JSON_BODY
      // before the route runs, so a future DELETE or bodyless PATCH would fail here.
      headers: init?.body === undefined
        ? init?.headers
        : { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(unreachableMessage, 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error?: { message?: string; code?: string } | string }).error
      : undefined;
    const message = typeof envelope === 'object' && envelope !== null ? envelope.message : undefined;
    const code = typeof envelope === 'object' && envelope !== null ? envelope.code : undefined;
    throw new ApiError(message || (response.status === 429 ? 'Too many attempts. Wait a while and try again.' : 'The request could not be completed.'), response.status, code);
  }
  return body as T;
}

const post = (path: string, data: unknown) => request<unknown>(path, { method: 'POST', body: JSON.stringify(data) });

export async function getTenants(): Promise<PlatformTenant[]> {
  const result = await request<unknown>('/api/tenants');
  if (!Array.isArray(result)) throw new ApiError('The Platform API returned an invalid workspace list.', 502);
  return result.map((tenant) => platformTenantSchema.parse(tenant));
}

export async function createTenant(input: CreateTenantInput): Promise<PlatformTenant> {
  return platformTenantSchema.parse(await post('/api/tenants', createTenantSchema.parse(input)));
}

export async function getOperators(): Promise<PlatformOperatorList> {
  return platformOperatorListSchema.parse(await request<unknown>('/api/operators'));
}

export async function inviteOperator(input: InvitePlatformOperatorInput) {
  return operatorInviteCreatedSchema.parse(await post('/api/operators/invitations', invitePlatformOperatorSchema.parse(input)));
}

export async function resendInvitation(id: string) {
  const result = await post(`/api/operators/invitations/${encodeURIComponent(id)}/resend`, {});
  return operatorInviteCreatedSchema.parse(result);
}

export async function revokeInvitation(id: string) {
  return operatorActionResultSchema.parse(await post(`/api/operators/invitations/${encodeURIComponent(id)}/revoke`, {}));
}

export async function updateOperatorRole(id: string, role: 'platform_admin' | 'platform_read_only') {
  return operatorActionResultSchema.parse(await post(`/api/operators/${encodeURIComponent(id)}/role`, { role }));
}

export async function updateOperatorStatus(id: string, disabled: boolean) {
  return operatorActionResultSchema.parse(await post(`/api/operators/${encodeURIComponent(id)}/status`, { disabled }));
}

export async function requestPasswordReset(input: RequestPasswordResetInput) {
  return passwordResetRequestedSchema.parse(await post('/api/auth/forgot-password', requestPasswordResetSchema.parse(input)));
}

export async function verifyPasswordResetOtp(input: VerifyPasswordResetOtpInput) {
  return passwordResetOtpVerifiedSchema.parse(await post('/api/auth/verify-reset-otp', verifyPasswordResetOtpSchema.parse(input)));
}

export async function resetPassword(input: ResetPasswordWithOtpInput) {
  return passwordResetSchema.parse(await post('/api/auth/reset-password', resetPasswordWithOtpSchema.parse(input)));
}

export async function lookupInvitation(input: PlatformInviteTokenRequest) {
  return platformInviteTokenSchema.parse(await post('/api/operator-invitations/lookup', platformInviteTokenRequestSchema.parse(input)));
}

export async function acceptInvitation(input: AcceptPlatformOperatorInviteInput) {
  return operatorInviteAcceptanceSchema.parse(await post('/api/operator-invitations/accept', acceptPlatformOperatorInviteSchema.parse(input)));
}
