import {
  academicYearInputSchema,
  academicYearSchema,
  academicYearUpdateSchema,
  classInputSchema,
  classUpdateSchema,
  provisionedTenantSchema,
  provisioningPayloadSchema,
  schoolAuthContextSchema,
  schoolClassSchema,
  schoolDeletionResultSchema,
  schoolMutationResultSchema,
  schoolOverviewSchema,
  studentInputSchema,
  studentSchema,
  studentUpdateSchema,
} from '@edusync/contracts';
import { z } from 'zod';

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const authedResponses = {
  '401': { description: 'No active School session.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '403': { description: 'The signed-in role is not allowed to perform this action.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '429': { description: 'Too many requests.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
};

const listResponses = (ref: string) => ({
  '200': { description: 'Matching records for the caller\'s school.', content: { 'application/json': { schema: { type: 'array', items: { $ref: ref } } } } },
  ...authedResponses,
});

const mutationResponses = (ref: string, created: boolean) => ({
  [created ? '201' : '200']: { description: created ? 'Record created.' : 'Record updated.', content: { 'application/json': { schema: { $ref: ref } } } },
  '400': { description: 'Invalid payload or a reference that does not belong to this school.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '404': { description: 'Record not found in this school.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '409': { description: 'A unique value (name, NIS or NISN) is already taken.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  ...authedResponses,
});

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0' });

export const schoolOpenApi = {
  openapi: '3.0.3',
  info: {
    title: 'EduSync School API',
    version: '0.1.0',
    description: 'School service API. Operational endpoints read and write only the school that owns the caller\'s session. The documented provisioning operation is private and used only by the Platform API. School admin activation is not implemented yet.',
  },
  servers: [{ url: process.env.SCHOOL_API_URL ?? 'http://localhost:4002', description: 'School API' }],
  tags: [
    { name: 'School', description: 'School service health.' },
    { name: 'Authentication', description: 'Better Auth session endpoints. Public sign-up is disabled.' },
    { name: 'Academic years', description: 'Academic year records for the signed-in school. Managing requires the school_admin role.' },
    { name: 'Classes', description: 'Class records for the signed-in school. Managing requires the school_admin role.' },
    { name: 'Students', description: 'Student records and their class enrollment for the signed-in school.' },
    { name: 'Overview', description: 'Aggregated counts for the school dashboard.' },
    { name: 'Internal · server-to-server', description: 'Private integration for authenticated Platform API calls. Never call this operation from browser code.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['School'], summary: 'Check School API health', operationId: 'getSchoolHealth',
        responses: { '200': { description: 'School API and database are healthy.', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', enum: ['school-api'] } }, required: ['status', 'service'] } } } } },
      },
    },
    '/api/school/me': {
      get: {
        tags: ['School'], summary: 'Get the caller\'s school identity and role', operationId: 'getSchoolAuthContext',
        description: 'Returns the signed-in member\'s user, organization and tenant identifiers plus the role that decides which school actions the browser offers. The role is stored on the organization membership, so it is not part of the session payload.',
        security: [{ schoolSession: [] }],
        responses: {
          '200': { description: 'Identity and role of the signed-in member.', content: { 'application/json': { schema: { $ref: '#/components/schemas/SchoolAuthContext' } } } },
          '401': { description: 'No active School session, or the account is not a member of an active school.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Too many requests.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/school/overview': {
      get: {
        tags: ['Overview'], summary: 'Get the school dashboard summary', operationId: 'getSchoolOverview',
        description: 'Returns student, class and academic year counts for the caller\'s school plus the five most recently added students.',
        security: [{ schoolSession: [] }],
        responses: {
          '200': { description: 'Dashboard summary.', content: { 'application/json': { schema: { $ref: '#/components/schemas/SchoolOverview' } } } },
          ...authedResponses,
        },
      },
    },
    '/api/academic-years': {
      get: {
        tags: ['Academic years'], summary: 'List academic years', operationId: 'listAcademicYears',
        security: [{ schoolSession: [] }], responses: listResponses('#/components/schemas/AcademicYear'),
      },
      post: {
        tags: ['Academic years'], summary: 'Create an academic year', operationId: 'createAcademicYear',
        description: 'Creates an academic year for the caller\'s school. Setting isActive marks it as the single active year, clearing any other.',
        security: [{ schoolSession: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademicYearInput' } } } },
        responses: mutationResponses('#/components/schemas/AcademicYear', true),
      },
    },
    '/api/academic-years/{id}': {
      patch: {
        tags: ['Academic years'], summary: 'Update an academic year', operationId: 'updateAcademicYear',
        description: 'Updates any subset of an academic year. Setting isActive true makes it the single active year for the school.',
        security: [{ schoolSession: [] }], parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademicYearUpdate' } } } },
        responses: mutationResponses('#/components/schemas/MutationResult', false),
      },
    },
    '/api/classes': {
      get: {
        tags: ['Classes'], summary: 'List classes', operationId: 'listSchoolClasses',
        description: 'Lists classes with the number of currently enrolled students.',
        security: [{ schoolSession: [] }], responses: listResponses('#/components/schemas/SchoolClass'),
      },
      post: {
        tags: ['Classes'], summary: 'Create a class', operationId: 'createSchoolClass',
        security: [{ schoolSession: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClassInput' } } } },
        responses: mutationResponses('#/components/schemas/SchoolClass', true),
      },
    },
    '/api/classes/{id}': {
      patch: {
        tags: ['Classes'], summary: 'Update a class', operationId: 'updateSchoolClass',
        description: 'Updates any subset of a class. Send capacity as null to remove the capacity limit.',
        security: [{ schoolSession: [] }], parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClassUpdate' } } } },
        responses: mutationResponses('#/components/schemas/MutationResult', false),
      },
    },
    '/api/students': {
      get: {
        tags: ['Students'], summary: 'List students', operationId: 'listStudents',
        description: 'Lists active (not deleted) students with their current class and academic year enrollment.',
        security: [{ schoolSession: [] }], responses: listResponses('#/components/schemas/Student'),
      },
      post: {
        tags: ['Students'], summary: 'Create a student', operationId: 'createStudent',
        description: 'Creates a student and their enrollment in the given class and academic year in one transaction.',
        security: [{ schoolSession: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentInput' } } } },
        responses: mutationResponses('#/components/schemas/Student', true),
      },
    },
    '/api/students/{id}': {
      patch: {
        tags: ['Students'], summary: 'Update a student', operationId: 'updateStudent',
        description: 'Updates any subset of a student. Sending classId and academicYearId together moves the student\'s enrollment for that year.',
        security: [{ schoolSession: [] }], parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentUpdate' } } } },
        responses: mutationResponses('#/components/schemas/Student', false),
      },
      delete: {
        tags: ['Students'], summary: 'Delete a student', operationId: 'deleteStudent',
        description: 'Soft-deletes the student and removes their enrollments. Requires the student.delete permission.',
        security: [{ schoolSession: [] }], parameters: [idParam],
        responses: {
          '200': { description: 'Student deleted.', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeletionResult' } } } },
          '404': { description: 'Student not found in this school.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          ...authedResponses,
        },
      },
    },
    '/api/auth/sign-in/email': {
      post: {
        tags: ['Authentication'], summary: 'Sign in with email and password', operationId: 'schoolSignIn',
        description: 'Better Auth creates a School session and sets an HttpOnly session cookie. Accounts must already exist; public sign-up is not enabled.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 12, maxLength: 128 } } } } } },
        responses: { '200': { description: 'Signed in; session cookie is set.' }, '401': { description: 'Invalid credentials.' } },
      },
    },
    '/api/auth/sign-out': {
      post: { tags: ['Authentication'], summary: 'Sign out', operationId: 'schoolSignOut', description: 'Ends the current School session.', security: [{ schoolSession: [] }], responses: { '200': { description: 'Signed out; session cookie is cleared.' } } },
    },
    '/api/auth/get-session': {
      get: { tags: ['Authentication'], summary: 'Get the current session', operationId: 'getSchoolSession', security: [{ schoolSession: [] }], responses: { '200': { description: 'Current session, or null if signed out.' } } },
    },
    '/internal/provisioning/tenants': {
      post: {
        tags: ['Internal · server-to-server'], summary: 'Provision a School tenant (internal)', operationId: 'provisionSchoolTenant',
        description: 'PRIVATE PLATFORM-TO-SCHOOL INTEGRATION. Call only from the Platform API using the configured bearer secret. Never call from a browser or expose the shared secret. Idempotent for identical payloads. Provisions a tenant and organization, but does not activate the admin contact account.',
        security: [{ provisioningBearer: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisioningPayload' } } } },
        responses: {
          '200': { description: 'Tenant provisioned or identical request already provisioned.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProvisionedTenant' } } } },
          '400': { description: 'Invalid provisioning payload.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '401': { description: 'Missing or invalid service bearer credential.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '409': { description: 'Provisioning conflict or incomplete prior request.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '500': { description: 'Provisioning failed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      schoolSession: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'HttpOnly cookie set by Better Auth sign-in.' },
      provisioningBearer: { type: 'http', scheme: 'bearer', description: 'Private service-to-service credential. Value is configured outside the API and must never be exposed in client code or docs.' },
    },
    schemas: {
      ProvisioningPayload: jsonSchema(provisioningPayloadSchema),
      ProvisionedTenant: jsonSchema(provisionedTenantSchema),
      ApiError: jsonSchema(errorSchema),
      SchoolAuthContext: jsonSchema(schoolAuthContextSchema),
      AcademicYear: jsonSchema(academicYearSchema),
      AcademicYearInput: jsonSchema(academicYearInputSchema),
      AcademicYearUpdate: jsonSchema(academicYearUpdateSchema),
      SchoolClass: jsonSchema(schoolClassSchema),
      ClassInput: jsonSchema(classInputSchema),
      ClassUpdate: jsonSchema(classUpdateSchema),
      Student: jsonSchema(studentSchema),
      StudentInput: jsonSchema(studentInputSchema),
      StudentUpdate: jsonSchema(studentUpdateSchema),
      SchoolOverview: jsonSchema(schoolOverviewSchema),
      MutationResult: jsonSchema(schoolMutationResultSchema),
      DeletionResult: jsonSchema(schoolDeletionResultSchema),
    },
  },
};

export const schoolOpenApiJson = JSON.stringify(schoolOpenApi);
