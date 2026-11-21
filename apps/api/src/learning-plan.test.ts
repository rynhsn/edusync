import {
  academicYear,
  assignRoles,
  classRoom,
  entitlement,
  eq,
  foundation,
  learningObjective,
  learningOutcome,
  learningPlan,
  learningPlanSetting,
  member,
  school,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  subject,
  subscription,
  teacher,
  teachingAssignment,
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

/** Tahap 3.6.1: sakelar per sekolah dan perencanaan pembelajaran. */
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
  'admin' | 'kurikulum' | 'operator' | 'guruMtk' | 'guruIpa' | 'guruLain' | 'other',
  string
>;
const ids = {} as Record<
  'year' | 'sem' | 'sem2' | 'otherYear' | 'otherSem' | 'mtk' | 'ipa' | 'tpMtk' | 'tpMtk2' | 'tpIpa' | 'tpOld',
  string
>;

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
const setSwitch = (on: boolean, sid = schoolId, who = cookie.admin) =>
  call('PUT', '/v1/learning-plan/settings', who, { planEnabled: on }, sid);

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

const plan = (extra: object = {}) => ({
  subjectId: ids.mtk,
  academicYearId: ids.year,
  title: 'Perencanaan Bilangan',
  goals: 'Murid memahami bilangan bulat.',
  steps: 'Pembukaan, inti, penutup.',
  assessmentPlan: 'Kuis singkat dan observasi.',
  ...extra,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Rencana', slug: `yrp-${run}` })
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
  for (const slug of [`rp-${run}`, `rp2-${run}`]) {
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
  await db().insert(schoolLevel).values({ schoolId, code: '7', label: 'Kelas 7', sort: 1 });

  const mkYear = async (sid: string) => {
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
    return [y!.id, s!.id] as const;
  };
  [ids.year, ids.sem] = await mkYear(schoolId);
  [ids.otherYear, ids.otherSem] = await mkYear(otherSchoolId);
  // Tahun kedua di sekolah A: semester dari tahun lain tidak boleh dipakai.
  const [y2] = await db()
    .insert(academicYear)
    .values({ schoolId, name: '2027/2028', startsOn: '2027-07-12', endsOn: '2028-06-30' })
    .returning();
  const [s2] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: y2!.id,
      name: 'Ganjil',
      startsOn: '2027-07-12',
      endsOn: '2027-12-20',
    })
    .returning();
  ids.sem2 = s2!.id;

  for (const [key, c] of [
    ['mtk', 'MTK'],
    ['ipa', 'IPA'],
  ] as const) {
    const [s] = await db().insert(subject).values({ schoolId, code: c, name: c }).returning();
    ids[key] = s!.id;
    const [o] = await db()
      .insert(learningOutcome)
      .values({ schoolId, subjectId: s!.id, phase: 'D', description: `CP ${c}` })
      .returning();
    const mkTp = async (description: string, active = true) => {
      const [t] = await db()
        .insert(learningObjective)
        .values({ schoolId, outcomeId: o!.id, description, active })
        .returning();
      return t!.id;
    };
    if (key === 'mtk') {
      ids.tpMtk = await mkTp('TP satu');
      ids.tpMtk2 = await mkTp('TP dua');
      ids.tpOld = await mkTp('TP lama', false);
    } else ids.tpIpa = await mkTp('TP ipa');
  }

  const admin = await makeMember('admin', schoolId, ['school_admin']);
  const kurikulum = await makeMember('kurikulum', schoolId, ['curriculum']);
  const operator = await makeMember('operator', schoolId, ['operator']);
  const guruMtk = await makeMember('gurumtk', schoolId, ['teacher']);
  const guruIpa = await makeMember('guruipa', schoolId, ['teacher']);
  const guruLain = await makeMember('gurulain', schoolId, ['teacher']);
  const other = await makeMember('admin2', otherSchoolId, ['school_admin']);
  Object.assign(cookie, {
    admin: admin.cookie,
    kurikulum: kurikulum.cookie,
    operator: operator.cookie,
    guruMtk: guruMtk.cookie,
    guruIpa: guruIpa.cookie,
    guruLain: guruLain.cookie,
    other: other.cookie,
  });
  const [cls] = await db()
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.year, name: '7A', level: '7' })
    .returning();
  for (const [m, name, subjectId] of [
    [guruMtk.memberId, 'Guru MTK', ids.mtk],
    [guruIpa.memberId, 'Guru IPA', ids.ipa],
  ] as const) {
    const [t] = await db().insert(teacher).values({ schoolId, name, memberId: m }).returning();
    await db().insert(teachingAssignment).values({ schoolId, classId: cls!.id, subjectId, teacherId: t!.id });
  }
  await db().insert(teacher).values({ schoolId, name: 'Guru lain', memberId: guruLain.memberId });
}, 60_000);

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'learning_plan_objective',
      'learning_plan',
      'learning_plan_setting',
      'learning_objective',
      'learning_outcome',
      'teaching_assignment',
      'teacher',
      'class_room',
      'semester',
      'subject',
      'school_level',
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

describe('sakelar mati (bawaan): semua endpoint perencanaan 403 feature_disabled', () => {
  it('tanpa baris pengaturan, sakelar terbaca mati dan tidak ada baris dibuat', async () => {
    const res = await call('GET', '/v1/learning-plan/settings', cookie.operator);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      planEnabled: false,
      journalEnabled: false,
      reviewEnabled: false,
      reviewMinPerSemester: 1,
    });
    const rows = await db()
      .select()
      .from(learningPlanSetting)
      .where(eq(learningPlanSetting.schoolId, schoolId));
    expect(rows).toHaveLength(0);
  });

  it('daftar, buat, ubah, TP, dan hapus ditolak dengan kode feature_disabled (bukan module_disabled)', async () => {
    const attempts = [
      call('GET', '/v1/learning-plans', cookie.admin),
      call('POST', '/v1/learning-plans', cookie.admin, plan()),
      call('PUT', `/v1/learning-plans/${FAKE}`, cookie.admin, { title: 'x' }),
      call('PUT', `/v1/learning-plans/${FAKE}/objectives`, cookie.admin, { objectiveIds: [] }),
      call('DELETE', `/v1/learning-plans/${FAKE}`, cookie.admin),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe('feature_disabled');
    }
  });
});

describe('pengaturan sakelar', () => {
  it('hanya curriculum:manage yang mengubah; guru dan operator 403, pengelola kurikulum boleh', async () => {
    expect((await setSwitch(true, schoolId, cookie.guruMtk)).statusCode).toBe(403);
    expect((await setSwitch(true, schoolId, cookie.operator)).statusCode).toBe(403);
    const res = await call('PUT', '/v1/learning-plan/settings', cookie.kurikulum, {
      planEnabled: true,
      reviewMinPerSemester: 2,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({
      planEnabled: true,
      journalEnabled: false,
      reviewEnabled: false,
      reviewMinPerSemester: 2,
    });
    const bad = await call('PUT', '/v1/learning-plan/settings', cookie.admin, { reviewMinPerSemester: 5 });
    expect(bad.statusCode).toBe(400);
    // Field yang dihilangkan tidak berubah.
    const again = await call('PUT', '/v1/learning-plan/settings', cookie.admin, { journalEnabled: true });
    expect(again.json()).toMatchObject({ planEnabled: true, journalEnabled: true, reviewMinPerSemester: 2 });
    await call('PUT', '/v1/learning-plan/settings', cookie.admin, {
      journalEnabled: false,
      reviewMinPerSemester: 1,
    });
  });

  it('sekolah lain tidak terpengaruh dan tidak bisa membaca perencanaan sekolah ini', async () => {
    expect((await call('GET', '/v1/learning-plans', cookie.other)).statusCode).toBe(403);
    const theirs = await call('GET', '/v1/learning-plan/settings', cookie.other, undefined, otherSchoolId);
    expect(theirs.json().planEnabled).toBe(false);
    expect(code(await call('GET', '/v1/learning-plans', cookie.other, undefined, otherSchoolId))).toBe(
      'feature_disabled',
    );
  });
});

describe('perencanaan: izin', () => {
  it('operator tidak bisa menulis tetapi bisa membaca; pengampu boleh, guru mapel lain dan tanpa penugasan 403', async () => {
    expect((await call('POST', '/v1/learning-plans', cookie.operator, plan())).statusCode).toBe(403);
    expect((await call('GET', '/v1/learning-plans', cookie.operator)).statusCode).toBe(200);
    for (const who of [cookie.guruIpa, cookie.guruLain]) {
      const res = await call('POST', '/v1/learning-plans', who, plan());
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe('not_subject_teacher');
    }
    const made = await call('POST', '/v1/learning-plans', cookie.guruMtk, plan({ title: 'Milik guru MTK' }));
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json()).toMatchObject({
      title: 'Milik guru MTK',
      teacherName: 'Guru MTK',
      semesterId: null,
      objectives: [],
    });
  });

  it('guru bukan pengampu tidak bisa mengubah atau menghapus; pengampu dan admin bisa', async () => {
    const created = (
      await call('POST', '/v1/learning-plans', cookie.admin, plan({ title: 'Milik admin' }))
    ).json();
    expect(created.teacherId).toBeNull();
    const url = `/v1/learning-plans/${created.id}`;
    expect((await call('PUT', url, cookie.guruIpa, { title: 'x' })).statusCode).toBe(403);
    expect((await call('DELETE', url, cookie.guruIpa)).statusCode).toBe(403);
    expect((await call('PUT', url, cookie.guruMtk, { title: 'Diubah guru' })).statusCode).toBe(200);
    expect((await call('DELETE', url, cookie.admin)).statusCode).toBe(200);
    expect((await call('DELETE', url, cookie.admin)).statusCode).toBe(404);
  });
});

describe('perencanaan: isi dan validasi', () => {
  it('buat dengan TP, ubah, ganti TP, filter semester, dan tautan https', async () => {
    const res = await call(
      'POST',
      '/v1/learning-plans',
      cookie.admin,
      plan({
        semesterId: ids.sem,
        levelCode: '7',
        linkUrl: 'https://drive.example.com/rencana',
        objectiveIds: [ids.tpMtk],
      }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const p = res.json();
    expect(p.objectives.map((o: { id: string }) => o.id)).toEqual([ids.tpMtk]);
    expect(p).toMatchObject({
      semesterName: 'Ganjil',
      levelCode: '7',
      linkUrl: 'https://drive.example.com/rencana',
    });

    const upd = await call('PUT', `/v1/learning-plans/${p.id}`, cookie.admin, {
      title: 'Judul baru',
      linkUrl: null,
      semesterId: null,
      objectiveIds: [ids.tpMtk, ids.tpMtk2],
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json()).toMatchObject({
      title: 'Judul baru',
      linkUrl: null,
      semesterId: null,
      goals: p.goals,
    });
    expect(upd.json().objectives).toHaveLength(2);

    const only = await call('PUT', `/v1/learning-plans/${p.id}/objectives`, cookie.admin, {
      objectiveIds: [],
    });
    expect(only.json().objectives).toEqual([]);

    await call('PUT', `/v1/learning-plans/${p.id}`, cookie.admin, { semesterId: ids.sem });
    const filtered = await call(
      'GET',
      `/v1/learning-plans?semesterId=${ids.sem}&subjectId=${ids.mtk}`,
      cookie.admin,
    );
    expect(filtered.json().plans.map((x: { id: string }) => x.id)).toEqual([p.id]);
    const none = await call('GET', `/v1/learning-plans?subjectId=${ids.ipa}`, cookie.admin);
    expect(none.json().plans).toEqual([]);
  });

  it('menolak tautan bukan https, kolom kosong, teks terlalu panjang, tingkat dan semester yang salah', async () => {
    const check = async (extra: object, status: number, errorCode?: string) => {
      const res = await call('POST', '/v1/learning-plans', cookie.admin, plan(extra));
      expect(res.statusCode, res.body).toBe(status);
      if (errorCode) expect(code(res)).toBe(errorCode);
    };
    await check({ linkUrl: 'http://x.example.com' }, 400, 'invalid_link');
    await check({ linkUrl: 'javascript:alert(1)' }, 400, 'invalid_link');
    await check({ goals: '' }, 400);
    await check({ steps: 'x'.repeat(8001) }, 400);
    await check({ levelCode: '99' }, 400, 'invalid_level');
    await check({ semesterId: ids.sem2 }, 400, 'invalid_reference');
    await check({ semesterId: ids.otherSem }, 400, 'invalid_reference');
    await check({ subjectId: FAKE }, 404);
    await check({ academicYearId: ids.otherYear }, 404);
  });

  it('TP: mapel lain, nonaktif, dan lebih dari 20 ditolak; TP nonaktif yang sudah terkait boleh tetap', async () => {
    const mismatch = await call(
      'POST',
      '/v1/learning-plans',
      cookie.admin,
      plan({ objectiveIds: [ids.tpIpa] }),
    );
    expect(code(mismatch)).toBe('objective_subject_mismatch');
    const inactive = await call(
      'POST',
      '/v1/learning-plans',
      cookie.admin,
      plan({ objectiveIds: [ids.tpOld] }),
    );
    expect(code(inactive)).toBe('objective_inactive');
    const many = Array.from({ length: 21 }, () => crypto.randomUUID());
    const tooMany = await call('POST', '/v1/learning-plans', cookie.admin, plan({ objectiveIds: many }));
    expect(code(tooMany)).toBe('too_many_objectives');
    const unknown = await call(
      'POST',
      '/v1/learning-plans',
      cookie.admin,
      plan({ objectiveIds: [crypto.randomUUID()] }),
    );
    expect(unknown.statusCode).toBe(400);
    // Gagal di tengah tidak meninggalkan baris setengah jadi (semua dalam satu transaksi).
    const rows = await db().select().from(learningPlan).where(eq(learningPlan.schoolId, schoolId));
    expect(rows.every((r) => r.title !== 'Perencanaan Bilangan')).toBe(true);

    const p = (
      await call('POST', '/v1/learning-plans', cookie.admin, plan({ objectiveIds: [ids.tpMtk] }))
    ).json();
    await db().update(learningObjective).set({ active: false }).where(eq(learningObjective.id, ids.tpMtk));
    const keep = await call('PUT', `/v1/learning-plans/${p.id}/objectives`, cookie.admin, {
      objectiveIds: [ids.tpMtk],
    });
    expect(keep.statusCode, keep.body).toBe(200);
    expect(keep.json().objectives[0]).toMatchObject({ id: ids.tpMtk, active: false });
    await db().update(learningObjective).set({ active: true }).where(eq(learningObjective.id, ids.tpMtk));
  });
});

describe('dimatikan kembali', () => {
  it('sakelar dimatikan: data tetap, endpoint 403 lagi; sekolah lain tetap mati', async () => {
    const before = await db().select().from(learningPlan).where(eq(learningPlan.schoolId, schoolId));
    expect(before.length).toBeGreaterThan(0);
    expect((await setSwitch(false)).statusCode).toBe(200);
    expect(code(await call('GET', '/v1/learning-plans', cookie.admin))).toBe('feature_disabled');
    const after = await db().select().from(learningPlan).where(eq(learningPlan.schoolId, schoolId));
    expect(after).toHaveLength(before.length);
    const theirs = await call('GET', '/v1/learning-plan/settings', cookie.other, undefined, otherSchoolId);
    expect(theirs.json().planEnabled).toBe(false);
  });
});
