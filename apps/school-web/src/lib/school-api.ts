import {
  academicYearInputSchema,
  academicYearSchema,
  academicYearUpdateSchema,
  bootstrapSchoolAdminSchema,
  classInputSchema,
  classUpdateSchema,
  schoolAdminActivationAcceptanceSchema,
  schoolAdminActivationLookupSchema,
  schoolAdminActivationTokenRequestSchema,
  schoolAuthContextSchema,
  schoolClassSchema,
  schoolDeletionResultSchema,
  schoolMutationResultSchema,
  schoolOverviewSchema,
  studentInputSchema,
  studentSchema,
  studentUpdateSchema,
  type AcademicYear,
  type AcademicYearInput,
  type AcademicYearUpdateInput,
  type BootstrapSchoolAdminInput,
  type ClassInput,
  type ClassUpdateInput,
  type SchoolAdminActivationTokenRequest,
  type SchoolAuthContext,
  type SchoolClass,
  type SchoolOverview,
  type Student,
  type StudentInput,
  type StudentUpdateInput,
} from '@edusync/contracts';
import { createAuthClient } from 'better-auth/react';

const baseURL = (import.meta.env.VITE_SCHOOL_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4002';

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

const unreachableMessage = 'Cannot reach the School API. Check your connection and try again.';

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
      // before the route runs, which is what broke every DELETE.
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
const patch = (path: string, data: unknown) => request<unknown>(path, { method: 'PATCH', body: JSON.stringify(data) });
const remove = (path: string) => request<unknown>(path, { method: 'DELETE' });

async function list<T>(path: string, parse: (value: unknown) => T): Promise<T[]> {
  const result = await request<unknown>(path);
  if (!Array.isArray(result)) throw new ApiError('The School API returned an invalid list.', 502);
  return result.map(parse);
}

export async function getOverview(): Promise<SchoolOverview> {
  return schoolOverviewSchema.parse(await request<unknown>('/api/school/overview'));
}

// The role is not on the session payload (Better Auth stores it on the organization
// membership), so the app reads it from the API to decide which controls to offer.
export async function getAuthContext(): Promise<SchoolAuthContext> {
  return schoolAuthContextSchema.parse(await request<unknown>('/api/school/me'));
}

export async function getAcademicYears(): Promise<AcademicYear[]> {
  return list('/api/academic-years', (value) => academicYearSchema.parse(value));
}

export async function createAcademicYear(input: AcademicYearInput): Promise<AcademicYear> {
  return academicYearSchema.parse(await post('/api/academic-years', academicYearInputSchema.parse(input)));
}

export async function updateAcademicYear(id: string, input: AcademicYearUpdateInput) {
  return schoolMutationResultSchema.parse(await patch(`/api/academic-years/${encodeURIComponent(id)}`, academicYearUpdateSchema.parse(input)));
}

export async function getClasses(): Promise<SchoolClass[]> {
  return list('/api/classes', (value) => schoolClassSchema.parse(value));
}

export async function createClass(input: ClassInput): Promise<SchoolClass> {
  return schoolClassSchema.parse(await post('/api/classes', classInputSchema.parse(input)));
}

export async function updateClass(id: string, input: ClassUpdateInput) {
  return schoolMutationResultSchema.parse(await patch(`/api/classes/${encodeURIComponent(id)}`, classUpdateSchema.parse(input)));
}

export async function getStudents(): Promise<Student[]> {
  return list('/api/students', (value) => studentSchema.parse(value));
}

export async function createStudent(input: StudentInput): Promise<Student> {
  return studentSchema.parse(await post('/api/students', studentInputSchema.parse(input)));
}

export async function updateStudent(id: string, input: StudentUpdateInput): Promise<Student> {
  return studentSchema.parse(await patch(`/api/students/${encodeURIComponent(id)}`, studentUpdateSchema.parse(input)));
}

export async function deleteStudent(id: string) {
  return schoolDeletionResultSchema.parse(await remove(`/api/students/${encodeURIComponent(id)}`));
}

export async function lookupAdminActivation(input: SchoolAdminActivationTokenRequest) {
  return schoolAdminActivationLookupSchema.parse(await post('/api/admin-activations/lookup', schoolAdminActivationTokenRequestSchema.parse(input)));
}

export async function acceptAdminActivation(input: BootstrapSchoolAdminInput) {
  return schoolAdminActivationAcceptanceSchema.parse(await post('/api/admin-activations/accept', bootstrapSchoolAdminSchema.parse(input)));
}

