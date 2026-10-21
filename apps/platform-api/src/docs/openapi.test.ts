import { describe, expect, it } from 'vitest';
import { platformOpenApi, platformOpenApiJson } from './openapi.js';

describe('Platform OpenAPI document', () => {
  it('documents the live tenant and auth endpoints with session security', () => {
    expect(platformOpenApi.openapi).toBe('3.0.3');
    expect(platformOpenApi.paths['/api/tenants']).toHaveProperty('get');
    expect(platformOpenApi.paths['/api/tenants']).toHaveProperty('post');
    expect(platformOpenApi.paths['/api/tenants']?.get.security).toEqual([{ platformSession: [] }]);
    expect(platformOpenApi.paths['/api/tenants']?.post.requestBody).toBeDefined();
    expect(platformOpenApi.paths['/api/auth/sign-in/email']).toHaveProperty('post');
  });

  it('documents Platform operator management and public invitation routes accurately', () => {
    const paths = platformOpenApi.paths;
    expect(paths['/api/operators']?.get.security).toEqual([{ platformSession: [] }]);
    expect(paths['/api/operators/invitations']?.post.security).toEqual([{ platformSession: [] }]);
    expect(paths['/api/operators/invitations/{invitationId}/resend']?.post.responses).toHaveProperty('409');
    expect('security' in paths['/api/operator-invitations/lookup']!.post).toBe(false);
    expect('security' in paths['/api/operator-invitations/accept']!.post).toBe(false);
    expect(paths['/api/operator-invitations/accept']?.post.requestBody).toBeDefined();
    expect(platformOpenApi.components.schemas).toHaveProperty('PlatformOperatorList');
    expect(paths['/api/operators/invitations']?.post.description).toContain('delivery failure');
  });

  it('documents the public password reset OTP endpoints and their contracts', () => {
    const paths = platformOpenApi.paths;
    const requestReset = paths['/api/auth/forgot-password']?.post;
    const verifyOtp = paths['/api/auth/verify-reset-otp']?.post;
    const resetPassword = paths['/api/auth/reset-password']?.post;

    expect(requestReset?.operationId).toBe('requestPasswordReset');
    expect(requestReset?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestPasswordResetInput' } } },
    });
    expect(requestReset?.responses).toHaveProperty('200');
    expect(requestReset?.responses).toHaveProperty('429');
    expect(requestReset?.description).toContain('avoid disclosing account existence');
    expect('security' in (requestReset ?? {})).toBe(false);

    expect(verifyOtp?.operationId).toBe('verifyPasswordResetOtp');
    expect(verifyOtp?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyPasswordResetOtpInput' } } },
    });
    expect(verifyOtp?.responses).toHaveProperty('200');
    // Verification consumes attempts, so it can exhaust the shared budget and must
    // document the same 429 that reset-password returns.
    expect(verifyOtp?.responses).toHaveProperty('429');
    expect(verifyOtp?.responses).toHaveProperty('500');
    expect(verifyOtp?.description).toContain('single five-attempt budget');
    expect('security' in (verifyOtp ?? {})).toBe(false);

    expect(resetPassword?.operationId).toBe('resetPasswordWithOtp');
    expect(resetPassword?.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordWithOtpInput' } } },
    });
    expect(resetPassword?.responses).toHaveProperty('200');
    expect(resetPassword?.description).toContain('invalidates all existing sessions');
    expect('security' in (resetPassword ?? {})).toBe(false);

    expect(platformOpenApi.components.schemas).toHaveProperty('RequestPasswordResetInput');
    expect(platformOpenApi.components.schemas).toHaveProperty('VerifyPasswordResetOtpInput');
    expect(platformOpenApi.components.schemas).toHaveProperty('ResetPasswordWithOtpInput');
    expect(platformOpenApi.components.schemas).toHaveProperty('PasswordResetRequested');
    expect(platformOpenApi.components.schemas).toHaveProperty('PasswordReset');
  });

  it('exposes valid JSON without internal provisioning details or credentials', () => {
    const text = platformOpenApiJson;
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain('/internal/provisioning');
    expect(text).not.toContain('SCHOOL_PROVISIONING_SECRET');
    expect(text).not.toContain('password hash');
  });
});
