import {
  acceptPlatformOperatorInviteSchema,
  createTenantSchema,
  invitePlatformOperatorSchema,
  platformInviteTokenRequestSchema,
  platformOperatorListSchema,
  platformOperatorSchema,
  platformTenantSchema,
  requestPasswordResetSchema,
  verifyPasswordResetOtpSchema,
  resetPasswordWithOtpSchema,
  passwordResetRequestedSchema,
  passwordResetSchema,
  updatePlatformOperatorRoleSchema,
  updatePlatformOperatorStatusSchema,
} from '@edusync/contracts';
import { z } from 'zod';

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0' });

export const platformOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'EduSync Platform API',
    version: '0.1.0',
    description: 'Control-plane API for platform operator sessions and school workspace provisioning. Tenant access is enforced by the Platform API.',
  },
  servers: [{ url: process.env.PLATFORM_API_URL ?? 'http://localhost:4001', description: 'Platform API' }],
  tags: [
    { name: 'Platform', description: 'Platform service health and tenant workspace management.' },
    { name: 'Authentication', description: 'Better Auth email and password session endpoints mounted at /api/auth. Only the explicitly listed operations are included here.' },
    { name: 'Operators', description: 'Platform control-plane operator accounts and email invitations.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Platform'], summary: 'Check Platform API health', operationId: 'getPlatformHealth',
        responses: { '200': { description: 'Platform API and database are healthy.', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', enum: ['platform-api'] } }, required: ['status', 'service'] } } } } },
      },
    },
    '/api/tenants': {
      get: {
        tags: ['Platform'], summary: 'List school workspaces', operationId: 'listTenants',
        description: 'Requires a valid Platform session with the tenant.read permission. Returns up to 100 workspaces, newest first.',
        security: [{ platformSession: [] }],
        responses: {
          '200': { description: 'Workspace list.', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PlatformTenant' } } } } },
          '401': { description: 'A Platform session is required.' },
          '403': { description: 'The account lacks tenant.read permission.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      post: {
        tags: ['Platform'], summary: 'Create a school workspace', operationId: 'createTenant',
        description: 'Requires a valid Platform session with tenant.create permission. Platform calls the School API privately to provision the tenant. School admin account activation remains pending; no password or reusable activation credential is sent through this API.',
        security: [{ platformSession: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTenantInput' } } } },
        responses: {
          '201': { description: 'Workspace created and provisioned.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PlatformTenant' } } } },
          '400': { description: 'Invalid workspace details.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '401': { description: 'A Platform session is required.' },
          '403': { description: 'The account lacks tenant.create permission.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '409': { description: 'Workspace could not be created or conflicts with existing data.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '502': { description: 'School API provisioning failed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '503': { description: 'Provisioning is unavailable.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/operators': {
      get: {
        tags: ['Operators'], summary: 'List Platform operators and invitations', operationId: 'listPlatformOperators',
        description: 'Requires a Platform session with operator.read permission. Returns up to 100 operators and invitations.',
        security: [{ platformSession: [] }],
        responses: {
          '200': { description: 'Operators and recent invitations.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PlatformOperatorList' } } } },
          '401': { description: 'A Platform session is required.' },
          '403': { description: 'The account lacks operator.read permission.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/operators/invitations': {
      post: {
        tags: ['Operators'], summary: 'Invite a Platform operator', operationId: 'invitePlatformOperator',
        description: 'Requires operator.manage. Sends a 48-hour, single-use invitation to the requested email. The invitee chooses their password; no password is sent by email. The response reports delivery failure so it can be retried.',
        security: [{ platformSession: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InvitePlatformOperatorInput' } } } },
        responses: {
          '201': { description: 'Invitation created; delivery may be sent or failed.' },
          '400': { description: 'Invalid invitation details.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '401': { description: 'A Platform session is required.' },
          '403': { description: 'The account lacks operator.manage permission.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '409': { description: 'An account or active invitation already exists for this email.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/operators/invitations/{invitationId}/resend': {
      post: {
        tags: ['Operators'], summary: 'Resend a Platform operator invitation', operationId: 'resendPlatformOperatorInvitation',
        description: 'Requires operator.manage. Replaces the invitation token and extends expiry by 48 hours; the old link stops working.',
        security: [{ platformSession: [] }],
        parameters: [{ name: 'invitationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Updated invitation and delivery result.' }, '401': { description: 'A Platform session is required.' }, '403': { description: 'The account lacks operator.manage permission.' }, '404': { description: 'Invitation not found or no longer active.' }, '409': { description: 'Another active invitation already exists for this email.' } },
      },
    },
    '/api/operators/invitations/{invitationId}/revoke': {
      post: {
        tags: ['Operators'], summary: 'Revoke a Platform operator invitation', operationId: 'revokePlatformOperatorInvitation',
        security: [{ platformSession: [] }],
        parameters: [{ name: 'invitationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Invitation revoked.' }, '401': { description: 'A Platform session is required.' }, '403': { description: 'The account lacks operator.manage permission.' }, '404': { description: 'Invitation not found or already consumed.' } },
      },
    },
    '/api/operators/{operatorId}/role': {
      post: {
        tags: ['Operators'], summary: 'Change an operator role', operationId: 'updatePlatformOperatorRole',
        description: 'Requires operator.manage. Changing a role invalidates the operator’s existing sessions. You cannot change your own role or remove the final active admin.',
        security: [{ platformSession: [] }],
        parameters: [{ name: 'operatorId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatePlatformOperatorRoleInput' } } } },
        responses: { '200': { description: 'Role updated.' }, '400': { description: 'Invalid role or self-change.' }, '401': { description: 'A Platform session is required.' }, '403': { description: 'The account lacks operator.manage permission.' }, '404': { description: 'Operator not found.' }, '409': { description: 'The change would remove the final active admin.' } },
      },
    },
    '/api/operators/{operatorId}/status': {
      post: {
        tags: ['Operators'], summary: 'Enable or disable an operator', operationId: 'updatePlatformOperatorStatus',
        description: 'Requires operator.manage. Disabling invalidates existing sessions. You cannot disable yourself or disable the final active admin.',
        security: [{ platformSession: [] }],
        parameters: [{ name: 'operatorId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatePlatformOperatorStatusInput' } } } },
        responses: { '200': { description: 'Operator status updated.' }, '400': { description: 'Invalid status or self-change.' }, '401': { description: 'A Platform session is required.' }, '403': { description: 'The account lacks operator.manage permission.' }, '404': { description: 'Operator not found.' }, '409': { description: 'The change would remove the final active admin.' } },
      },
    },
    '/api/operator-invitations/lookup': {
      post: {
        tags: ['Operators'], summary: 'Validate an operator invitation token', operationId: 'lookupPlatformOperatorInvitation',
        description: 'Public endpoint, rate-limited. Returns only validity, email, and invitee name; never returns the token or token digest.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PlatformInviteTokenRequest' } } } },
        responses: { '200': { description: 'Token validity result.' }, '429': { description: 'Rate limit exceeded.' } },
      },
    },
    '/api/operator-invitations/accept': {
      post: {
        tags: ['Operators'], summary: 'Accept an operator invitation', operationId: 'acceptPlatformOperatorInvitation',
        description: 'Public endpoint, rate-limited. Consumes a valid single-use invitation and creates the Platform operator account using the password chosen by the invitee (12–128 characters).',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptPlatformOperatorInviteInput' } } } },
        responses: { '200': { description: 'Invitation accepted.' }, '400': { description: 'Invalid, expired, revoked, or already-consumed invitation.' }, '429': { description: 'Rate limit exceeded.' } },
      },
    },
    '/api/auth/sign-in/email': {
      post: {
        tags: ['Authentication'], summary: 'Sign in with email and password', operationId: 'platformSignIn',
        description: 'Better Auth creates a Platform session and sets an HttpOnly session cookie. Public sign-up is not enabled by the Platform configuration.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 12, maxLength: 128 } } } } } },
        responses: { '200': { description: 'Signed in; session cookie is set.' }, '401': { description: 'Invalid credentials.' } },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Authentication'], summary: 'Request a password reset code', operationId: 'requestPasswordReset',
        description: 'Public, rate-limited endpoint. Sends a six-digit, single-use OTP to the account email address. The response is always { sent: true } for syntactically valid email addresses, whether or not an account exists, to avoid disclosing account existence. OTPs expire after 10 minutes; an existing active OTP is not replaced.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestPasswordResetInput' } } } },
        responses: {
          '200': { description: 'Request accepted. Does not indicate whether an account exists.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordResetRequested' } } } },
          '400': { description: 'Invalid email address.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate limit exceeded.' },
          '500': { description: 'Could not process the reset request.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/auth/verify-reset-otp': {
      post: {
        tags: ['Authentication'], summary: 'Verify a password reset code', operationId: 'verifyPasswordResetOtp',
        description: 'Public, rate-limited endpoint. Checks whether the six-digit OTP is valid, unused, unexpired, and below the maximum of five attempts. A wrong code consumes one attempt here exactly as it does at /api/auth/reset-password, so the two endpoints share a single five-attempt budget. A valid code is not consumed by this check; /api/auth/reset-password marks it used.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyPasswordResetOtpInput' } } } },
        responses: {
          '200': { description: 'OTP validity result.', content: { 'application/json': { schema: { type: 'object', required: ['valid'], properties: { valid: { type: 'boolean' } } } } } },
          '400': { description: 'Invalid email or OTP input.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate limit exceeded or maximum OTP attempts reached.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '500': { description: 'Password reset code could not be verified.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Authentication'], summary: 'Reset a password with a code', operationId: 'resetPasswordWithOtp',
        description: 'Public, rate-limited endpoint. Resets the password after validating the OTP, then invalidates all existing sessions for that user. The OTP expires after 10 minutes and allows at most five failed attempts.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordWithOtpInput' } } } },
        responses: {
          '200': { description: 'Password reset; all existing sessions are invalidated.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordReset' } } } },
          '400': { description: 'Invalid input or OTP.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate limit exceeded or maximum OTP attempts reached.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '500': { description: 'Password could not be reset.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/auth/sign-out': {
      post: { tags: ['Authentication'], summary: 'Sign out', operationId: 'platformSignOut', description: 'Ends the current Platform session.', security: [{ platformSession: [] }], responses: { '200': { description: 'Signed out; session cookie is cleared.' } } },
    },
    '/api/auth/get-session': {
      get: { tags: ['Authentication'], summary: 'Get the current session', operationId: 'getPlatformSession', security: [{ platformSession: [] }], responses: { '200': { description: 'Current session, or null if signed out.' } } },
    },
  },
  components: {
    securitySchemes: { platformSession: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'HttpOnly cookie set by Better Auth sign-in.' } },
    schemas: {
      CreateTenantInput: jsonSchema(createTenantSchema),
      PlatformTenant: jsonSchema(platformTenantSchema),
      PlatformOperatorList: jsonSchema(platformOperatorListSchema),
      PlatformOperator: jsonSchema(platformOperatorSchema),
      InvitePlatformOperatorInput: jsonSchema(invitePlatformOperatorSchema),
      AcceptPlatformOperatorInviteInput: jsonSchema(acceptPlatformOperatorInviteSchema),
      PlatformInviteTokenRequest: jsonSchema(platformInviteTokenRequestSchema),
      RequestPasswordResetInput: jsonSchema(requestPasswordResetSchema),
      VerifyPasswordResetOtpInput: jsonSchema(verifyPasswordResetOtpSchema),
      ResetPasswordWithOtpInput: jsonSchema(resetPasswordWithOtpSchema),
      PasswordResetRequested: jsonSchema(passwordResetRequestedSchema),
      PasswordReset: jsonSchema(passwordResetSchema),
      UpdatePlatformOperatorRoleInput: jsonSchema(updatePlatformOperatorRoleSchema),
      UpdatePlatformOperatorStatusInput: jsonSchema(updatePlatformOperatorStatusSchema),
      ApiError: jsonSchema(errorSchema),
    },
  },
};

export const platformOpenApiJson = JSON.stringify(platformOpenApi);
