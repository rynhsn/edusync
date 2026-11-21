import {
  academicYear,
  assignRoles,
  entitlement,
  eq,
  foundation,
  learningProcessReview,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  subscription,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/** Tahap 3.6.3: penilaian proses pembelajaran (C12). */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherSchoolId = '';
const userIds: string[] = [];
const cookie = {} as Record<
  'admin' | 'kepsek' | 'kurikulum' | 'operator' | 'guruA' | 'guruB' | 'other',
  string
>;
const ids = {} as Record<'sem' | 'otherSem' | 'tA' | 'tB' | 'tC', string>;

const db = () => app.platformDb;
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: who,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const setSwitch = (payload: object, sid = schoolId, who = cookie.admin) =>
  call('PUT', '/v1/learning-plan/settings', who, payload, sid);
const post = (who: string, body: object) =>
  call('POST', '/v1/learning-reviews', who, { semesterId: ids.sem, ...body });
const reviewsOf = async (who: string, query = '') =>
  (await call('GET', `/v1/learning-reviews${query}`, who)).json().reviews as {
    id: string;
    reviewerKind: string;
  }[];

async function makeMember(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { memberId: m!.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Tinjauan', slug: `ytj-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const made: string[] = [];
  for (const slug of [`tj-${run}`, `tj2-${run}`]) {
    const [s] = await db().insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db(), s!.id);
    await db().insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'grades',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    made.push(s!.id);
  }
  [schoolId, otherSchoolId] = made as [string, string];
  const mkSem = async (sid: string) => {
    const [y] = await db()
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    const [s] = await db()
      .insert(semester)
      .values({
        schoolId: sid,
        academicYearId: y!.id,
        name: 'Ganjil',
        startsOn: '2026-07-13',
        endsOn: '2026-12-20',
      })
      .returning();
    return s!.id;
  };
  ids.sem = await mkSem(schoolId);
  ids.otherSem = await mkSem(otherSchoolId);

  const admin = await makeMember('admin', schoolId, ['school_admin']);
  const kepsek = await makeMember('kepsek', schoolId, ['principal']);
  const kurikulum = await makeMember('kurikulum', schoolId, ['curriculum']);
  const operator = await makeMember('operator', schoolId, ['operator']);
  const guruA = await makeMember('gurua', schoolId, ['teacher']);
  const guruB = await makeMember('gurub', schoolId, ['teacher']);
  const other = await makeMember('admin2', otherSchoolId, ['school_admin']);
  Object.assign(cookie, {
    admin: admin.cookie,
    kepsek: kepsek.cookie,
    kurikulum: kurikulum.cookie,
    operator: operator.cookie,
    guruA: guruA.cookie,
    guruB: guruB.cookie,
    other: other.cookie,
  });
  for (const [key, name, memberId] of [
    ['tA', 'Guru A', guruA.memberId],
    ['tB', 'Guru B', guruB.memberId],
    ['tC', 'Guru C', undefined],
  ] as const) {
    const [t] = await db()
      .insert(teacher)
      .values({ schoolId, name, ...(memberId ? { memberId } : {}) })
      .returning();
    ids[key] = t!.id;
  }
}, 60_000);

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'learning_process_review',
      'learning_plan_setting',
      'teacher',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db().delete(school).where(eq(school.id, sid));
  }
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('sakelar penilaian proses mati', () => {
  it('semua endpoint 403 feature_disabled, termasuk untuk pengelola; izin tetap diperiksa lebih dulu', async () => {
    for (const who of [cookie.admin, cookie.guruA]) {
      expect(code(await call('GET', '/v1/learning-reviews', who))).toBe('feature_disabled');
      expect(code(await post(who, { teacherId: ids.tA, reviewerKind: 'self', note: 'x' }))).toBe(
        'feature_disabled',
      );
    }
    const coverage = `/v1/learning-reviews/coverage?semesterId=${ids.sem}`;
    expect(code(await call('GET', coverage, cookie.admin))).toBe('feature_disabled');
    expect(code(await call('PUT', `/v1/learning-reviews/${FAKE}`, cookie.admin, {}))).toBe(
      'feature_disabled',
    );
    expect(code(await call('GET', coverage, cookie.guruA))).toBe('forbidden');
    expect(await db().select().from(learningProcessReview)).toHaveLength(0);
  });

  it('sakelar hanya milik sekolah yang menyalakannya', async () => {
    const res = await setSwitch({ reviewEnabled: true });
    expect(res.json()).toMatchObject({ reviewEnabled: true, reviewMinPerSemester: 1, planEnabled: false });
    expect(code(await call('GET', '/v1/learning-reviews', cookie.other, undefined, otherSchoolId))).toBe(
      'feature_disabled',
    );
  });
});

describe('izin dan visibilitas', () => {
  let principalId = '';
  let selfId = '';

  it('guru hanya mencatat refleksi dirinya; jenis lain, guru lain, dan peran tanpa izin ditolak', async () => {
    const own = await post(cookie.guruA, {
      reviewerKind: 'self',
      ratings: { planning: 3 },
      note: ' refleksi ',
    });
    expect(own.statusCode, own.body).toBe(201);
    selfId = own.json().id;
    expect(own.json()).toMatchObject({
      teacherId: ids.tA,
      reviewerKind: 'self',
      sharedWithTeacher: false,
      note: 'refleksi',
      respondentCount: null,
    });
    for (const body of [
      { reviewerKind: 'principal', teacherId: ids.tA, note: 'x' },
      { reviewerKind: 'peer', teacherId: ids.tA, reviewerTeacherId: ids.tB, note: 'x' },
      { reviewerKind: 'student', teacherId: ids.tA, respondentCount: 5, note: 'x' },
      { reviewerKind: 'self', teacherId: ids.tB, note: 'x' },
    ]) {
      const res = await post(cookie.guruA, body);
      expect([res.statusCode, code(res)], JSON.stringify(body)).toEqual([403, 'forbidden']);
    }
    // Operator memegang subject:read tetapi bukan pengelola dan bukan guru berizin tulis perangkat.
    expect(code(await call('GET', '/v1/learning-reviews', cookie.operator))).toBe('forbidden');
    const asOperator = await post(cookie.operator, {
      reviewerKind: 'principal',
      teacherId: ids.tA,
      note: 'x',
    });
    expect(code(asOperator)).toBe('forbidden');
  });

  it('kepala sekolah, kurikulum, dan admin mencatat semua jenis; bawaan tidak dibagikan ke guru', async () => {
    const res = await post(cookie.kepsek, {
      teacherId: ids.tA,
      reviewerKind: 'principal',
      reviewedOn: '2026-10-12',
      ratings: { planning: 4, implementation: 3 },
    });
    expect(res.statusCode, res.body).toBe(201);
    principalId = res.json().id;
    expect(res.json()).toMatchObject({ sharedWithTeacher: false, reviewedOn: '2026-10-12' });
    const peer = await post(cookie.kurikulum, {
      teacherId: ids.tA,
      reviewerKind: 'peer',
      reviewerTeacherId: ids.tB,
      ratings: { assessment: 2 },
      sharedWithTeacher: true,
    });
    expect(peer.statusCode, peer.body).toBe(201);
    expect(peer.json()).toMatchObject({ reviewerTeacherName: 'Guru B', sharedWithTeacher: true });
    const student = await post(cookie.admin, {
      teacherId: ids.tB,
      reviewerKind: 'student',
      respondentCount: 30,
      ratings: { follow_up: 3.25 },
    });
    expect(student.statusCode, student.body).toBe(201);
    expect(student.json()).toMatchObject({ respondentCount: 30, reviewerTeacherId: null });
  });

  it('guru melihat refleksinya dan yang dibagikan saja; pengelola melihat semua', async () => {
    const mine = await reviewsOf(cookie.guruA);
    expect(mine.map((r) => r.reviewerKind).sort()).toEqual(['peer', 'self']);
    expect(mine.some((r) => r.id === principalId)).toBe(false);
    // Filter teacherId tidak membuka akses ke tinjauan guru lain.
    expect(await reviewsOf(cookie.guruB, `?teacherId=${ids.tA}`)).toHaveLength(0);
    for (const who of [cookie.admin, cookie.kepsek, cookie.kurikulum]) {
      expect(await reviewsOf(who)).toHaveLength(4);
    }
    expect(await reviewsOf(cookie.admin, `?teacherId=${ids.tB}&semesterId=${ids.sem}`)).toHaveLength(1);
    // Penanda dibagikan hanya diubah pengelola.
    const own = await call('PUT', `/v1/learning-reviews/${selfId}`, cookie.guruA, {
      sharedWithTeacher: true,
    });
    expect(own.json().sharedWithTeacher).toBe(false);
    const shared = await call('PUT', `/v1/learning-reviews/${principalId}`, cookie.kepsek, {
      sharedWithTeacher: true,
    });
    expect(shared.json().sharedWithTeacher).toBe(true);
    expect(await reviewsOf(cookie.guruA)).toHaveLength(3);
  });

  it('guru tidak mengubah atau menghapus tinjauan orang lain; yang tak terlihat = 404', async () => {
    const edit = await call('PUT', `/v1/learning-reviews/${principalId}`, cookie.guruA, { note: 'ubah' });
    expect([edit.statusCode, code(edit)]).toEqual([403, 'forbidden']);
    expect((await call('DELETE', `/v1/learning-reviews/${principalId}`, cookie.guruA)).statusCode).toBe(403);
    expect(await reviewsOf(cookie.guruB)).toHaveLength(0);
    expect((await call('DELETE', `/v1/learning-reviews/${selfId}`, cookie.guruB)).statusCode).toBe(404);
    const upd = await call('PUT', `/v1/learning-reviews/${selfId}`, cookie.guruA, {
      ratings: { planning: 4 },
    });
    expect(upd.json().ratings).toEqual({ planning: 4 });
    expect((await call('DELETE', `/v1/learning-reviews/${selfId}`, cookie.guruA)).statusCode).toBe(200);
  });
});

describe('validasi isi', () => {
  it('rating tak dikenal, kosong, sejawat, responden, dan referensi lintas sekolah', async () => {
    const cases: [object, string][] = [
      [{ reviewerKind: 'principal', ratings: { bogus: 2 } }, 'invalid_rating'],
      [{ reviewerKind: 'principal', ratings: { planning: 5 } }, 'invalid_rating'],
      [{ reviewerKind: 'principal', ratings: { planning: 2.5 } }, 'invalid_rating'],
      [{ reviewerKind: 'principal', ratings: {} }, 'empty_review'],
      [{ reviewerKind: 'principal' }, 'empty_review'],
      [{ reviewerKind: 'peer', note: 'x' }, 'invalid_reviewer'],
      [{ reviewerKind: 'peer', reviewerTeacherId: ids.tA, note: 'x' }, 'invalid_reviewer'],
      [{ reviewerKind: 'peer', reviewerTeacherId: crypto.randomUUID(), note: 'x' }, 'invalid_reviewer'],
      [{ reviewerKind: 'principal', reviewerTeacherId: ids.tB, note: 'x' }, 'invalid_reviewer'],
      [{ reviewerKind: 'student', note: 'x' }, 'invalid_respondents'],
      [{ reviewerKind: 'principal', respondentCount: 3, note: 'x' }, 'invalid_respondents'],
    ];
    for (const [body, expected] of cases) {
      const res = await post(cookie.admin, { teacherId: ids.tA, ...body });
      expect([res.statusCode, code(res)], JSON.stringify(body)).toEqual([400, expected]);
    }
    expect(code(await post(cookie.admin, { reviewerKind: 'principal', note: 'x' }))).toBe(
      'invalid_reference',
    );
    const crossSem = await call('POST', '/v1/learning-reviews', cookie.admin, {
      semesterId: ids.otherSem,
      teacherId: ids.tA,
      reviewerKind: 'principal',
      note: 'x',
    });
    expect(code(crossSem)).toBe('invalid_reference');
    const zero = await post(cookie.admin, {
      teacherId: ids.tA,
      reviewerKind: 'student',
      respondentCount: 0,
      note: 'x',
    });
    expect(zero.statusCode).toBe(400);
  });
});

describe('kecakupan dan isolasi', () => {
  it('menghitung per jenis, met bila total >= minimum, dan hanya guru aktif', async () => {
    const coverage = async (min: number) => {
      await setSwitch({ reviewMinPerSemester: min });
      const res = await call('GET', `/v1/learning-reviews/coverage?semesterId=${ids.sem}`, cookie.kepsek);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().minPerSemester).toBe(min);
      return new Map(
        (res.json().teachers as { teacherName: string; total: number; met: boolean }[]).map((t) => [
          t.teacherName,
          t,
        ]),
      );
    };
    const one = await coverage(1);
    expect(one.get('Guru A')).toMatchObject({
      counts: { self: 0, peer: 1, principal: 1, student: 0 },
      total: 2,
      met: true,
    });
    expect(one.get('Guru B')).toMatchObject({
      counts: { self: 0, peer: 0, principal: 0, student: 1 },
      total: 1,
      met: true,
    });
    expect(one.get('Guru C')).toMatchObject({ total: 0, met: false });
    expect((await coverage(3)).get('Guru A')?.met).toBe(false);
    await db().update(teacher).set({ status: 'inactive' }).where(eq(teacher.id, ids.tC));
    expect((await coverage(1)).has('Guru C')).toBe(false);
    const foreign = await call(
      'GET',
      `/v1/learning-reviews/coverage?semesterId=${ids.otherSem}`,
      cookie.admin,
    );
    expect(foreign.statusCode).toBe(404);
  });

  it('sekolah lain tidak melihat atau mengubah tinjauan; sakelar mati kembali: data tetap', async () => {
    const mine = await db()
      .select()
      .from(learningProcessReview)
      .where(eq(learningProcessReview.schoolId, schoolId));
    await setSwitch({ reviewEnabled: true }, otherSchoolId, cookie.other);
    const theirs = await call('GET', '/v1/learning-reviews', cookie.other, undefined, otherSchoolId);
    expect(theirs.json().reviews).toEqual([]);
    const del = await call(
      'DELETE',
      `/v1/learning-reviews/${mine[0]!.id}`,
      cookie.other,
      undefined,
      otherSchoolId,
    );
    expect(del.statusCode).toBe(404);
    await setSwitch({ reviewEnabled: false });
    expect(code(await call('GET', '/v1/learning-reviews', cookie.admin))).toBe('feature_disabled');
    const after = await db()
      .select()
      .from(learningProcessReview)
      .where(eq(learningProcessReview.schoolId, schoolId));
    expect(after).toHaveLength(mine.length);
  });
});
