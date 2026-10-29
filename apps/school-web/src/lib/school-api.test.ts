import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  ApiError,
  acceptAdminActivation,
  authErrorMessage,
  createAcademicYear,
  createClass,
  createStudent,
  deleteStudent,
  getAcademicYears,
  getClasses,
  getOverview,
  getStudents,
  lookupAdminActivation,
  updateAcademicYear,
  updateClass,
  updateStudent,
} from '@/lib/school-api';

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

const yearId = '00000000-0000-4000-8000-000000000001';
const classId = '00000000-0000-4000-8000-000000000002';
const studentId = '00000000-0000-4000-8000-000000000003';

const academicYear = {
  id: yearId,
  name: '2026/2027',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  isActive: true,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const schoolClass = {
  id: classId,
  name: '7A',
  gradeLevel: 7,
  capacity: 32,
  studentCount: 28,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const student = {
  id: studentId,
  nis: '2026001',
  nisn: '0012345678',
  fullName: 'Ayu Prameswari',
  gender: 'P',
  status: 'AKTIF',
  classId,
  className: '7A',
  academicYearId: yearId,
  academicYearName: '2026/2027',
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const overview = {
  students: { total: 1, active: 1 },
  classes: { total: 1, seats: 32 },
  academicYears: { total: 1, activeName: '2026/2027' },
  recentStudents: [student],
};

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('request error handling', () => {
  it('maps a network failure to an unreachable-API ApiError', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await expectApiFailure(getStudents());
    expect(error.status).toBe(0);
    expect(error.message).toBe('Cannot reach the School API. Check your connection and try again.');
    expect(error.code).toBeUndefined();
  });

  it('surfaces API error envelopes with message, code and status', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ error: { message: 'That class name already exists', code: 'DUPLICATE_CLASS' } }, 409));

    const error = await expectApiFailure(getClasses());
    expect(error.status).toBe(409);
    expect(error.code).toBe('DUPLICATE_CLASS');
    expect(error.message).toBe('That class name already exists');
  });

  it('falls back to the rate-limit message when a 429 has no error envelope', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respondUnparsable(429));

    const error = await expectApiFailure(getOverview());
    expect(error.status).toBe(429);
    expect(error.message).toBe('Too many attempts. Wait a while and try again.');
  });

  it('rejects a non-array list with a 502 ApiError', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ items: [] }));

    const error = await expectApiFailure(getStudents());
    expect(error.status).toBe(502);
    expect(error.message).toBe('The School API returned an invalid list.');
  });
});

describe('authErrorMessage', () => {
  it('replaces better-auth\'s raw network failure with the unreachable-API wording', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe('Cannot reach the School API. Check your connection and try again.');
  });

  it('keeps a genuine API message', () => {
    expect(authErrorMessage(new Error('Check your email and password.'))).toBe('Check your email and password.');
  });

  it('treats a blank or missing message as unreachable rather than showing nothing', () => {
    expect(authErrorMessage(new Error('   '))).toBe('Cannot reach the School API. Check your connection and try again.');
    expect(authErrorMessage(undefined)).toBe('Cannot reach the School API. Check your connection and try again.');
  });
});

describe('reads', () => {
  it('requests the overview with cookie credentials and parses it', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(overview));

    await expect(getOverview()).resolves.toEqual(overview);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/school\/overview$/);
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string> | undefined)?.['content-type']).toBeUndefined();
  });

  it('parses every student in the list against the contract', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond([student]));

    await expect(getStudents()).resolves.toEqual([student]);
    expect(String(lastCall().url)).toMatch(/\/api\/students$/);
  });

  it('rejects with ZodError when a record violates the contract', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond([{ id: studentId, fullName: 'Broken' }]));

    await expect(getStudents()).rejects.toBeInstanceOf(ZodError);
  });

  it('reads classes and academic years from their own endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond([schoolClass]));
    await expect(getClasses()).resolves.toEqual([schoolClass]);
    expect(String(lastCall().url)).toMatch(/\/api\/classes$/);

    fetchMock.mockResolvedValue(respond([academicYear]));
    await expect(getAcademicYears()).resolves.toEqual([academicYear]);
    expect(String(lastCall().url)).toMatch(/\/api\/academic-years$/);
  });
});

describe('creates', () => {
  it('posts a trimmed academic year and parses the created record', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(academicYear, 201));

    await expect(createAcademicYear({ name: ' 2026/2027 ', startsOn: '2026-07-01', endsOn: '2027-06-30', isActive: true })).resolves.toEqual(academicYear);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/academic-years$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ name: '2026/2027', startsOn: '2026-07-01', endsOn: '2027-06-30', isActive: true });
  });

  it('rejects an academic year whose end date is not after its start date', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAcademicYear({ name: '2026/2027', startsOn: '2027-06-30', endsOn: '2026-07-01', isActive: false })).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes an omitted class capacity to null', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(schoolClass, 201));

    await expect(createClass({ name: '7A', gradeLevel: 7 })).resolves.toEqual(schoolClass);
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ name: '7A', gradeLevel: 7 });
  });

  it('posts the student together with their enrollment and parses the record', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond(student, 201));

    await expect(createStudent({ nis: '2026001', nisn: null, fullName: 'Ayu Prameswari', gender: 'P', classId, academicYearId: yearId, status: 'AKTIF' })).resolves.toEqual(student);

    const { url, init } = lastCall();
    expect(String(url)).toMatch(/\/api\/students$/);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ nis: '2026001', nisn: null, fullName: 'Ayu Prameswari', gender: 'P', classId, academicYearId: yearId, status: 'AKTIF' });
  });
});

describe('updates', () => {
  it('patches a partial academic year, sending only the active flag', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ updated: true }));

    await expect(updateAcademicYear(yearId, { isActive: true })).resolves.toEqual({ updated: true });

    const { url, init } = lastCall();
    expect(String(url)).toMatch(new RegExp(`/api/academic-years/${yearId}$`));
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ isActive: true });
  });

  it('patches a class and parses the mutation result', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ updated: true }));

    await expect(updateClass(classId, { name: '7B', gradeLevel: 7, capacity: null })).resolves.toEqual({ updated: true });
    expect(String(lastCall().url)).toMatch(new RegExp(`/api/classes/${classId}$`));
  });

  it('parses the updated student the API returns, not a mutation envelope', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ ...student, status: 'MUTASI' }));

    await expect(updateStudent(studentId, { status: 'MUTASI' })).resolves.toEqual({ ...student, status: 'MUTASI' });
    expect(String(lastCall().url)).toMatch(new RegExp(`/api/students/${studentId}$`));
  });

  it('rejects an update that moves a student without naming the academic year', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateStudent(studentId, { classId })).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteStudent', () => {
  it('sends a DELETE and parses the deletion result', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ deleted: true }));

    await expect(deleteStudent(studentId)).resolves.toEqual({ deleted: true });

    const { url, init } = lastCall();
    expect(String(url)).toMatch(new RegExp(`/api/students/${studentId}$`));
    expect(init?.method).toBe('DELETE');
  });

  it('sends no content-type with a bodyless DELETE', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ deleted: true }));

    await deleteStudent(studentId);

    // Fastify rejects an empty body that claims to be JSON, so announcing a content
    // type here turns the DELETE into a 400 before the route handler runs.
    const { init } = lastCall();
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string> | undefined)?.['content-type']).toBeUndefined();
  });

  it('escapes an identifier so it cannot leave its own path segment', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(respond({ deleted: true }));

    await deleteStudent('../../api/school/overview');

    const { pathname } = new URL(String(lastCall().url));
    expect(pathname).toBe('/api/students/..%2F..%2Fapi%2Fschool%2Foverview');
    expect(pathname.startsWith('/api/students/')).toBe(true);
  });
});

describe('school admin activation', () => {
  it('validates token length before looking up an admin activation', async () => {
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupAdminActivation({ token: 'short' })).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up and accepts a school admin activation token', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const token = 'a'.repeat(43);
    fetchMock.mockResolvedValue(respond({ valid: true, email: 'admin@school.edu', name: 'Ada Admin', schoolName: 'Northfield Academy' }));

    await expect(lookupAdminActivation({ token })).resolves.toEqual({
      valid: true,
      email: 'admin@school.edu',
      name: 'Ada Admin',
      schoolName: 'Northfield Academy',
    });
    expect(String(lastCall().url)).toMatch(/\/api\/admin-activations\/lookup$/);

    fetchMock.mockResolvedValue(respond({ activated: true }));
    await expect(acceptAdminActivation({ token, password: 'a-strong-school-password' })).resolves.toEqual({ activated: true });
    expect(String(lastCall().url)).toMatch(/\/api\/admin-activations\/accept$/);
  });
});
