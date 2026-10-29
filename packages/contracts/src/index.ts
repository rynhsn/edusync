import { z } from 'zod';

export const tenantStatusSchema = z.enum(['provisioning', 'active', 'suspended', 'provisioning_failed']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

const tenantNameSchema = z.string().trim().min(2).max(160);
const tenantSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const adminNameSchema = z.string().trim().min(2).max(100);

// z.email() validates the raw input, so a .trim()/.toLowerCase() chained *after* it never runs
// before the format check: a padded address like '  Operator@Example.COM ' was rejected rather
// than normalized, and the normalization was silently dead code. Normalize first, then validate
// the normalized value. The emitted JSON Schema is unchanged.
const normalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const createTenantSchema = z.object({
  name: tenantNameSchema,
  slug: tenantSlugSchema,
  adminName: adminNameSchema,
  adminEmail: normalizedEmailSchema,
}).strict();
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const platformTenantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: tenantStatusSchema,
  schoolTenantId: z.uuid().nullable(),
  provisioningError: z.string().nullable(),
  ownerUserId: z.string().nullable().optional(),
  adminName: z.string().nullable().optional(),
  adminEmail: z.email().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PlatformTenant = z.infer<typeof platformTenantSchema>;

export const platformTenantIdSchema = z.uuid();

export const updateTenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
}).strict();
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;

export const internalUpdateSchoolTenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
}).strict();
export type InternalUpdateSchoolTenantStatusInput = z.infer<typeof internalUpdateSchoolTenantStatusSchema>;

// Ownership of a school by a platform account. `tenants.created_by` only records who
// performed the creation (an operator may create a school on behalf of someone else),
// so a dedicated relation records who actually manages the school.
export const tenantOwnerRoleSchema = z.enum(['platform_owner', 'platform_user']);
export type TenantOwnerRole = z.infer<typeof tenantOwnerRoleSchema>;

export const tenantOwnershipSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  userId: z.string().min(1),
  role: tenantOwnerRoleSchema,
  createdAt: z.iso.datetime(),
});
export type TenantOwnership = z.infer<typeof tenantOwnershipSchema>;

export const provisioningPayloadSchema = z.object({
  platformTenantId: z.uuid(),
  name: tenantNameSchema,
  slug: tenantSlugSchema,
  adminName: adminNameSchema,
  adminEmail: normalizedEmailSchema,
}).strict();
export type ProvisioningPayload = z.infer<typeof provisioningPayloadSchema>;

export const provisionedTenantSchema = z.object({
  platformTenantId: z.uuid(),
  schoolTenantId: z.uuid(),
  organizationId: z.string().min(1),
  status: tenantStatusSchema,
  adminActivation: z.object({ status: z.enum(['pending', 'already_exists']) }),
});
export type ProvisionedTenant = z.infer<typeof provisionedTenantSchema>;

export const platformLoginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(128),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export const schoolLoginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(128),
});
export type SchoolLoginInput = z.infer<typeof schoolLoginSchema>;

export const bootstrapSchoolAdminSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
}).strict();
export type BootstrapSchoolAdminInput = z.infer<typeof bootstrapSchoolAdminSchema>;

export const schoolAdminActivationTokenRequestSchema = z.object({
  token: z.string().min(32).max(256),
}).strict();
export type SchoolAdminActivationTokenRequest = z.infer<typeof schoolAdminActivationTokenRequestSchema>;

export const schoolAdminActivationLookupSchema = z.object({
  valid: z.boolean(),
  email: z.email().optional(),
  name: z.string().optional(),
  schoolName: z.string().optional(),
});
export type SchoolAdminActivationLookup = z.infer<typeof schoolAdminActivationLookupSchema>;

export const schoolAdminActivationAcceptanceSchema = z.object({
  activated: z.literal(true),
});
export type SchoolAdminActivationAcceptance = z.infer<typeof schoolAdminActivationAcceptanceSchema>;

export const schoolAuthContextSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  tenantId: z.uuid(),
  role: z.string().min(1),
});
export type SchoolAuthContext = z.infer<typeof schoolAuthContextSchema>;

export const platformPermissionSchema = z.enum([
  'tenant.read', 'tenant.create', 'tenant.manage_access',
  'operator.read', 'operator.manage',
  'subscription.read', 'subscription.manage',
]);
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;

export const platformOperatorRoleSchema = z.enum(['platform_admin', 'platform_read_only']);
export type PlatformOperatorRole = z.infer<typeof platformOperatorRoleSchema>;

// platform_user gets a dedicated schema rather than reusing the operator schema: the
// operator invite/role flow must keep strict permission boundaries (no manage, no operator rows),
// and `platform_user` is an account-manager model distinct from operators.
export const platformUserRoleSchema = z.enum(['platform_admin', 'platform_read_only', 'platform_user']);
export type PlatformUserRole = z.infer<typeof platformUserRoleSchema>;

export const invitePlatformOperatorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: normalizedEmailSchema,
  role: platformOperatorRoleSchema,
}).strict();
export type InvitePlatformOperatorInput = z.infer<typeof invitePlatformOperatorSchema>;

export const acceptPlatformOperatorInviteSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
}).strict();
export type AcceptPlatformOperatorInviteInput = z.infer<typeof acceptPlatformOperatorInviteSchema>;

export const platformOperatorSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: platformOperatorRoleSchema,
  emailVerified: z.boolean(),
  disabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PlatformOperator = z.infer<typeof platformOperatorSchema>;

export const platformOperatorInviteSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: platformOperatorRoleSchema,
  status: z.enum(['pending', 'expired', 'accepted', 'revoked', 'delivery_failed']),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type PlatformOperatorInvite = z.infer<typeof platformOperatorInviteSchema>;

export const updatePlatformOperatorRoleSchema = z.object({ role: platformOperatorRoleSchema }).strict();
export type UpdatePlatformOperatorRoleInput = z.infer<typeof updatePlatformOperatorRoleSchema>;
export const updatePlatformOperatorStatusSchema = z.object({ disabled: z.boolean() }).strict();
export type UpdatePlatformOperatorStatusInput = z.infer<typeof updatePlatformOperatorStatusSchema>;
export const platformOperatorListSchema = z.object({ operators: z.array(platformOperatorSchema), invitations: z.array(platformOperatorInviteSchema) });
export type PlatformOperatorList = z.infer<typeof platformOperatorListSchema>;
export const operatorInviteCreatedSchema = z.object({ invitation: platformOperatorInviteSchema, delivery: z.enum(['sent', 'failed']) });
export type OperatorInviteCreated = z.infer<typeof operatorInviteCreatedSchema>;
export const operatorInviteAcceptanceSchema = z.object({ accepted: z.literal(true) });
export type OperatorInviteAcceptance = z.infer<typeof operatorInviteAcceptanceSchema>;
export const operatorActionResultSchema = z.object({ updated: z.literal(true) });
export type OperatorActionResult = z.infer<typeof operatorActionResultSchema>;
export const platformInviteTokenSchema = z.object({ valid: z.boolean(), email: z.email().optional(), name: z.string().optional() });
export type PlatformInviteToken = z.infer<typeof platformInviteTokenSchema>;
export const platformInviteTokenRequestSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export type PlatformInviteTokenRequest = z.infer<typeof platformInviteTokenRequestSchema>;
export const platformOperatorIdSchema = z.string().min(1).max(128);
export const platformInviteIdSchema = z.uuid();

// Public self-registration for a platform account manager. The account is always created
// with the `platform_user` role: operators remain invite-only.
export const registerPlatformUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: normalizedEmailSchema,
  password: z.string().min(12).max(128),
}).strict();
export type RegisterPlatformUserInput = z.infer<typeof registerPlatformUserSchema>;

export const platformUserRegisteredSchema = z.object({ registered: z.literal(true), id: z.string().min(1) });
export type PlatformUserRegistered = z.infer<typeof platformUserRegisteredSchema>;

export const updatePlatformProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
}).strict();
export type UpdatePlatformProfileInput = z.infer<typeof updatePlatformProfileSchema>;

export const changePlatformPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).strict();
export type ChangePlatformPasswordInput = z.infer<typeof changePlatformPasswordSchema>;

export const platformProfileUpdatedSchema = z.object({
  updated: z.literal(true),
  name: z.string(),
});
export type PlatformProfileUpdated = z.infer<typeof platformProfileUpdatedSchema>;

export const platformPasswordChangedSchema = z.object({
  updated: z.literal(true),
});
export type PlatformPasswordChanged = z.infer<typeof platformPasswordChangedSchema>;

export const platformAuditLogSchema = z.object({
  id: z.uuid(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type PlatformAuditLog = z.infer<typeof platformAuditLogSchema>;

export const platformAuditLogListSchema = z.object({
  logs: z.array(platformAuditLogSchema),
});
export type PlatformAuditLogList = z.infer<typeof platformAuditLogListSchema>;

export const requestPasswordResetSchema = z.object({
  email: normalizedEmailSchema,
}).strict();
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const verifyPasswordResetOtpSchema = z.object({
  email: normalizedEmailSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
}).strict();
export type VerifyPasswordResetOtpInput = z.infer<typeof verifyPasswordResetOtpSchema>;

export const resetPasswordWithOtpSchema = z.object({
  email: normalizedEmailSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  password: z.string().min(12).max(128),
}).strict();
export type ResetPasswordWithOtpInput = z.infer<typeof resetPasswordWithOtpSchema>;

export const passwordResetRequestedSchema = z.object({ sent: z.boolean() });
export type PasswordResetRequested = z.infer<typeof passwordResetRequestedSchema>;

export const passwordResetSchema = z.object({ reset: z.boolean() });
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export const passwordResetOtpVerifiedSchema = z.object({ valid: z.boolean() });
export type PasswordResetOtpVerified = z.infer<typeof passwordResetOtpVerifiedSchema>;

export const schoolPermissionSchema = z.enum([
  'academic_year.read', 'academic_year.manage',
  'class.read', 'class.manage',
  'student.read', 'student.create', 'student.update', 'student.delete',
]);
export type SchoolPermission = z.infer<typeof schoolPermissionSchema>;

export function safeEqualSecret(actual: string | undefined, expected: string | undefined): boolean {
  if (actual === undefined || expected === undefined || actual.length === 0 || expected.length === 0) return false;
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index]! ^ expectedBytes[index]!;
  }
  return difference === 0;
}

export const academicYearInputSchema = z.object({
  name: z.string().trim().min(4).max(20),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isActive: z.boolean().default(false),
}).refine((value) => value.startsOn < value.endsOn, {
  message: 'Tanggal mulai harus sebelum tanggal selesai',
  path: ['endsOn'],
});
export type AcademicYearInput = z.infer<typeof academicYearInputSchema>;

export const classInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  gradeLevel: z.number().int().min(1).max(12),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
});
export type ClassInput = z.infer<typeof classInputSchema>;

export const studentInputSchema = z.object({
  nis: z.string().trim().min(1).max(20),
  nisn: z.string().trim().max(10).nullable().optional(),
  fullName: z.string().trim().min(2).max(100),
  gender: z.enum(['L', 'P']).nullable().optional(),
  classId: z.uuid(),
  academicYearId: z.uuid(),
  status: z.enum(['AKTIF', 'LULUS', 'MUTASI', 'KELUAR']).default('AKTIF'),
});
export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentUpdateSchema = z.object({
  nis: z.string().trim().min(1).max(20).optional(),
  nisn: z.string().trim().max(10).nullable().optional(),
  fullName: z.string().trim().min(2).max(100).optional(),
  gender: z.enum(['L', 'P']).nullable().optional(),
  classId: z.uuid().optional(),
  academicYearId: z.uuid().optional(),
  status: z.enum(['AKTIF', 'LULUS', 'MUTASI', 'KELUAR']).optional(),
}).refine(
  (value) => (value.classId === undefined) === (value.academicYearId === undefined),
  { message: 'Kelas dan tahun ajaran harus diisi bersamaan', path: ['classId'] },
);
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;

export const academicYearUpdateSchema = z.object({
  name: z.string().trim().min(4).max(20).optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  isActive: z.boolean().optional(),
});
export type AcademicYearUpdateInput = z.infer<typeof academicYearUpdateSchema>;

export const classUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  gradeLevel: z.number().int().min(1).max(12).optional(),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
});
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;

export const studentStatusSchema = z.enum(['AKTIF', 'LULUS', 'MUTASI', 'KELUAR']);
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const academicYearSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AcademicYear = z.infer<typeof academicYearSchema>;

export const schoolClassSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  gradeLevel: z.number().int(),
  capacity: z.number().int().nullable(),
  studentCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SchoolClass = z.infer<typeof schoolClassSchema>;

export const studentSchema = z.object({
  id: z.uuid(),
  nis: z.string(),
  nisn: z.string().nullable(),
  fullName: z.string(),
  gender: z.enum(['L', 'P']).nullable(),
  status: studentStatusSchema,
  classId: z.uuid().nullable(),
  className: z.string().nullable(),
  academicYearId: z.uuid().nullable(),
  academicYearName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Student = z.infer<typeof studentSchema>;

export const schoolOverviewSchema = z.object({
  students: z.object({ total: z.number().int(), active: z.number().int() }),
  classes: z.object({ total: z.number().int(), seats: z.number().int() }),
  academicYears: z.object({ total: z.number().int(), activeName: z.string().nullable() }),
  recentStudents: z.array(studentSchema),
});
export type SchoolOverview = z.infer<typeof schoolOverviewSchema>;

export const schoolMutationResultSchema = z.object({ updated: z.literal(true) });
export type SchoolMutationResult = z.infer<typeof schoolMutationResultSchema>;
export const schoolDeletionResultSchema = z.object({ deleted: z.literal(true) });
export type SchoolDeletionResult = z.infer<typeof schoolDeletionResultSchema>;

export const schoolIdParamSchema = z.uuid();

export interface ApiErrorBody {
  error: { code: string; message: string };
}
