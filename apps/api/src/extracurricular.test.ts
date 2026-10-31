import {
  academicYear,
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subscription,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { todayInJakarta } from './attendance-lib';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
let semesterId = '';
const userIds: string[] = [];
let adminCookie = '';
let coachCookie = '';
let otherTeacherCookie = '';
let principalCookie = '';
let noModuleCookie = '';
let otherCookie = '';
let coachTeacherId = '';
let otherTeacherId = '';
let inactiveTeacherId = '';
let foreignTeacherId = '';
let ani = '';
let budi = '';
let citra = '';
let foreignStudent = '';
let graduated = '';

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return { cookie: await login(u.email), memberId: m!.id };
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const today = () => todayInJakarta();
const daysAgo = (back: number) =>
  new Date(Date.parse(today()) - back * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Ekskul', slug: `ye-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const make = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`eks-${run}`, ['extracurricular']);
  noModuleId = await make(`eks-nomod-${run}`, []);
  otherId = await make(`eks-lain-${run}`, ['extracurricular']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  yearId = y!.id;
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  semesterId = sem!.id;
  await db.insert(academicYear).values({
    schoolId: otherId,
    name: '2000-2099',
    startsOn: '2000-01-01',
    endsOn: '2099-12-31',
    isActive: true,
  });

  adminCookie = (await join('admin-ekskul', schoolId, ['school_admin'])).cookie;
  const coach = await join('guru-pembina', schoolId, ['teacher']);
  coachCookie = coach.cookie;
  const other = await join('guru-lain', schoolId, ['teacher']);
  otherTeacherCookie = other.cookie;
  principalCookie = (await join('kepsek-ekskul', schoolId, ['principal'])).cookie;
  noModuleCookie = (await join('admin-tanpa-modul-ekskul', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-ekskul-lain', otherId, ['school_admin'])).cookie;

  const [t1] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Pembina', memberId: coach.memberId })
    .returning();
  coachTeacherId = t1!.id;
  const [t2] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Lain', memberId: other.memberId })
    .returning();
  otherTeacherId = t2!.id;
  const [t3] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Nonaktif', status: 'inactive' })
    .returning();
  inactiveTeacherId = t3!.id;
  const [t4] = await db.insert(teacher).values({ schoolId: otherId, name: 'Guru Sekolah Lain' }).returning();
  foreignTeacherId = t4!.id;

  const mk = async (sid: string, name: string, status: 'active' | 'graduated' = 'active') => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, gender: 'L', status }).returning();
    return s!.id;
  };
  ani = await mk(schoolId, 'Ani');
  budi = await mk(schoolId, 'Budi');
  citra = await mk(schoolId, 'Citra');
  graduated = await mk(schoolId, 'Alumni', 'graduated');
  foreignStudent = await mk(otherId, 'Siswa Lain');
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'extracurricular_attendance',
      'extracurricular_assessment',
      'extracurricular_session',
      'extracurricular_member',
      'extracurricular',
      'extracurricular_category',
      'student',
      'teacher',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const ids = { futsal: '', pramuka: '', sessionA: '' };

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/extracurriculars', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/extracurriculars')).statusCode).toBe(401);
    // Guru dan kepala sekolah boleh membaca, tetapi hanya pengelola yang mengubah ekskul.
    expect((await call('GET', '/v1/extracurriculars', coachCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/extracurriculars', principalCookie)).statusCode).toBe(200);
    const body = { name: 'Basket', category: 'sport' };
    expect((await call('POST', '/v1/extracurriculars', coachCookie, body)).statusCode).toBe(403);
    expect((await call('POST', '/v1/extracurriculars', principalCookie, body)).statusCode).toBe(403);
  });
});

describe('kegiatan', () => {
  it('membuat ekskul, nama unik, dan validasi pembina', async () => {
    const created = await call('POST', '/v1/extracurriculars', adminCookie, {
      name: 'Futsal',
      category: 'sport',
      coachTeacherId,
      weekday: 3,
      startsAt: '15:30',
      endsAt: '17:00',
      location: 'Lapangan',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Futsal',
      coachName: 'Pak Pembina',
      memberCount: 0,
      active: true,
      canManage: true,
    });
    ids.futsal = created.json().id;

    const pramuka = await call('POST', '/v1/extracurriculars', adminCookie, {
      name: 'Pramuka',
      category: 'scout',
      externalCoach: 'Kak Rudi',
    });
    expect(pramuka.statusCode).toBe(201);
    expect(pramuka.json().coachName).toBe('Kak Rudi');
    ids.pramuka = pramuka.json().id;

    const dup = await call('POST', '/v1/extracurriculars', adminCookie, {
      name: 'Futsal',
      category: 'sport',
    });
    expect(dup.statusCode).toBe(409);

    const post = (extra: object) =>
      call('POST', '/v1/extracurriculars', adminCookie, {
        name: `Uji ${Math.random()}`,
        category: 'art',
        ...extra,
      });
    expect((await post({ coachTeacherId: foreignTeacherId })).json().error.code).toBe('invalid_reference');
    expect((await post({ coachTeacherId: inactiveTeacherId })).statusCode).toBe(400);
    expect((await post({ startsAt: '17:00', endsAt: '15:00' })).statusCode).toBe(400);
    expect((await post({ weekday: 8 })).statusCode).toBe(400);
    expect((await post({ category: 'musik' })).statusCode).toBe(400);
  });

  it('daftar menandai hak kelola, ubah dan nonaktifkan', async () => {
    const asCoach = (await call('GET', '/v1/extracurriculars', coachCookie)).json();
    expect(asCoach.map((e: { name: string }) => e.name)).toEqual(['Futsal', 'Pramuka']);
    expect(asCoach.find((e: { name: string }) => e.name === 'Futsal').canManage).toBe(true);
    expect(asCoach.find((e: { name: string }) => e.name === 'Pramuka').canManage).toBe(false);

    const body = {
      name: 'Futsal Putra',
      category: 'sport',
      coachTeacherId: otherTeacherId,
      active: false,
    };
    const upd = await call('PUT', `/v1/extracurriculars/${ids.futsal}`, adminCookie, body);
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'Futsal Putra', coachName: 'Bu Lain', active: false });
    // Guru pembina tidak boleh mengubah ekskulnya sendiri.
    expect((await call('PUT', `/v1/extracurriculars/${ids.futsal}`, coachCookie, body)).statusCode).toBe(403);
    expect(
      (await call('PUT', `/v1/extracurriculars/${ids.futsal}`, otherCookie, body, otherId)).statusCode,
    ).toBe(404);
    // Kembalikan.
    const back = await call('PUT', `/v1/extracurriculars/${ids.futsal}`, adminCookie, {
      name: 'Futsal',
      category: 'sport',
      coachTeacherId,
    });
    expect(back.json()).toMatchObject({ coachName: 'Pak Pembina', active: true });
  });

  it('ekskul sekolah lain tidak terlihat', async () => {
    expect((await call('GET', '/v1/extracurriculars', otherCookie, undefined, otherId)).json()).toEqual([]);
    expect(
      (await call('GET', `/v1/extracurriculars/${ids.futsal}/members`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
  });
});

describe('anggota', () => {
  const members = (cookie = adminCookie) => call('GET', `/v1/extracurriculars/${ids.futsal}/members`, cookie);

  it('menambah anggota, duplikat dilewati, dan siswa tak sah ditolak', async () => {
    const add = await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, adminCookie, {
      studentIds: [ani, budi],
    });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toEqual({ added: 2, skipped: 0 });

    const again = await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, coachCookie, {
      studentIds: [budi, citra, citra],
    });
    expect(again.json()).toEqual({ added: 1, skipped: 1 });

    const foreign = await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, adminCookie, {
      studentIds: [foreignStudent],
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('invalid_reference');
    expect(
      (
        await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, adminCookie, {
          studentIds: [graduated],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, adminCookie, { studentIds: [] }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, adminCookie, {
          studentIds: [ani],
          academicYearId: crypto.randomUUID(),
        })
      ).json().error.code,
    ).toBe('invalid_reference');

    const list = (await members()).json();
    expect(list.map((m: { name: string }) => m.name)).toEqual(['Ani', 'Budi', 'Citra']);
    expect(list[0]).toMatchObject({ studentId: ani, className: null });
    const byYear = await call(
      'GET',
      `/v1/extracurriculars/${ids.futsal}/members?academicYearId=${yearId}`,
      adminCookie,
    );
    expect(byYear.json()).toHaveLength(3);
    const summary = (await call('GET', '/v1/extracurriculars', adminCookie)).json();
    expect(summary.find((e: { id: string }) => e.id === ids.futsal).memberCount).toBe(3);
  });

  it('guru lain dan penonton tidak boleh mengubah anggota', async () => {
    const body = { studentIds: [ani] };
    expect(
      (await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, otherTeacherCookie, body)).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/extracurriculars/${ids.futsal}/members`, principalCookie, body)).statusCode,
    ).toBe(403);
    expect(
      (await call('DELETE', `/v1/extracurriculars/${ids.futsal}/members/${ani}`, otherTeacherCookie))
        .statusCode,
    ).toBe(403);
    // Guru yang bukan pembina pramuka tetap tidak bisa; pembina futsal tidak membina pramuka.
    expect(
      (await call('POST', `/v1/extracurriculars/${ids.pramuka}/members`, coachCookie, body)).statusCode,
    ).toBe(403);
    expect((await members(otherTeacherCookie)).statusCode).toBe(200);
  });

  it('mengeluarkan anggota', async () => {
    const del = await call('DELETE', `/v1/extracurriculars/${ids.futsal}/members/${citra}`, coachCookie);
    expect(del.statusCode).toBe(200);
    expect((await members()).json()).toHaveLength(2);
    expect(
      (await call('DELETE', `/v1/extracurriculars/${ids.futsal}/members/${citra}`, adminCookie)).statusCode,
    ).toBe(404);
  });
});

describe('pertemuan dan absensi', () => {
  it('membuat pertemuan, tanggal ganda 409, masa depan ditolak', async () => {
    const create = await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, coachCookie, {
      date: today(),
      topic: 'Latihan passing',
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({ date: today(), topic: 'Latihan passing', filled: 0, total: 2 });
    ids.sessionA = create.json().id;

    const dup = await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, adminCookie, {
      date: today(),
    });
    expect(dup.statusCode).toBe(409);
    const future = await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, adminCookie, {
      date: new Date(Date.parse(today()) + 3 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(future.statusCode).toBe(409);
    expect(future.json().error.code).toBe('future_date');
    expect(
      (
        await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, otherTeacherCookie, {
          date: daysAgo(1),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('daftar pertemuan memakai rentang tanggal dan membatasi 366 hari', async () => {
    await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, adminCookie, { date: daysAgo(7) });
    const list = (await call('GET', `/v1/extracurriculars/${ids.futsal}/sessions`, adminCookie)).json();
    expect(list.map((s: { date: string }) => s.date)).toEqual([today(), daysAgo(7)]);
    const narrow = await call(
      'GET',
      `/v1/extracurriculars/${ids.futsal}/sessions?from=${daysAgo(2)}&to=${today()}`,
      adminCookie,
    );
    expect(narrow.json()).toHaveLength(1);
    const wide = await call(
      'GET',
      `/v1/extracurriculars/${ids.futsal}/sessions?from=${daysAgo(400)}&to=${today()}`,
      adminCookie,
    );
    expect(wide.statusCode).toBe(400);
    expect(wide.json().error.code).toBe('invalid_range');
    expect(
      (
        await call(
          'GET',
          `/v1/extracurriculars/${ids.futsal}/sessions?from=${today()}&to=${daysAgo(3)}`,
          adminCookie,
        )
      ).statusCode,
    ).toBe(400);
  });

  it('absensi hanya untuk anggota; pembina boleh, guru lain 403', async () => {
    const url = `/v1/extracurricular-sessions/${ids.sessionA}/attendance`;
    const sheet = (await call('GET', url, coachCookie)).json();
    expect(sheet.session).toMatchObject({
      id: ids.sessionA,
      extracurricularId: ids.futsal,
      topic: 'Latihan passing',
    });
    expect(sheet.canRecord).toBe(true);
    expect(sheet.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Budi']);
    expect(sheet.students.every((s: { status: unknown }) => s.status === null)).toBe(true);

    const save = await call('PUT', url, coachCookie, {
      records: [
        { studentId: ani, status: 'present' },
        { studentId: budi, status: 'sick', note: 'Demam' },
      ],
    });
    expect(save.statusCode).toBe(200);
    expect(save.json()).toEqual({ saved: 2 });

    // Siswa bukan anggota (Citra sudah dikeluarkan, siswa sekolah lain).
    const nonMember = await call('PUT', url, adminCookie, {
      records: [{ studentId: citra, status: 'present' }],
    });
    expect(nonMember.statusCode).toBe(400);
    expect(nonMember.json().error.code).toBe('invalid_reference');
    expect(
      (await call('PUT', url, adminCookie, { records: [{ studentId: foreignStudent, status: 'present' }] }))
        .statusCode,
    ).toBe(400);

    expect(
      (await call('PUT', url, otherTeacherCookie, { records: [{ studentId: ani, status: 'absent' }] }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', url, principalCookie, { records: [{ studentId: ani, status: 'absent' }] }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', url, adminCookie, { records: [{ studentId: ani, status: 'late' }] })).statusCode,
    ).toBe(400);

    // Pengelola menimpa; penonton melihat tetapi tidak boleh mengisi.
    await call('PUT', url, adminCookie, { records: [{ studentId: ani, status: 'excused', note: 'Izin' }] });
    const viewer = (await call('GET', url, otherTeacherCookie)).json();
    expect(viewer.canRecord).toBe(false);
    expect(viewer.students.find((s: { studentId: string }) => s.studentId === ani)).toMatchObject({
      status: 'excused',
      note: 'Izin',
    });
    const list = (await call('GET', `/v1/extracurriculars/${ids.futsal}/sessions`, adminCookie)).json();
    expect(list.find((s: { id: string }) => s.id === ids.sessionA)).toMatchObject({ filled: 2, total: 2 });
    expect((await call('GET', url, otherCookie, undefined, otherId)).statusCode).toBe(404);
  });

  it('menghapus pertemuan beserta absensinya', async () => {
    const extra = await call('POST', `/v1/extracurriculars/${ids.futsal}/sessions`, coachCookie, {
      date: daysAgo(14),
    });
    const sessionId = extra.json().id;
    await call('PUT', `/v1/extracurricular-sessions/${sessionId}/attendance`, coachCookie, {
      records: [{ studentId: ani, status: 'present' }],
    });
    expect(
      (await call('DELETE', `/v1/extracurricular-sessions/${sessionId}`, otherTeacherCookie)).statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/extracurricular-sessions/${sessionId}`, coachCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/extracurricular-sessions/${sessionId}`, coachCookie)).statusCode).toBe(
      404,
    );
    const rows = await app.platformDb.execute(
      sql`select count(*)::int as n from extracurricular_attendance where session_id = ${sessionId}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('penilaian', () => {
  const url = () => `/v1/extracurriculars/${ids.futsal}/assessments`;

  it('menyimpan predikat per semester dan menolak yang bukan anggota', async () => {
    const empty = (await call('GET', `${url()}?semesterId=${semesterId}`, coachCookie)).json();
    expect(empty).toEqual([
      { studentId: ani, name: 'Ani', predicate: null, note: null },
      { studentId: budi, name: 'Budi', predicate: null, note: null },
    ]);
    const save = await call('PUT', url(), coachCookie, {
      semesterId,
      records: [
        { studentId: ani, predicate: 'A', note: 'Aktif' },
        { studentId: budi, predicate: 'C' },
      ],
    });
    expect(save.json()).toEqual({ saved: 2 });
    await call('PUT', url(), adminCookie, { semesterId, records: [{ studentId: budi, predicate: 'B' }] });
    const after = (await call('GET', `${url()}?semesterId=${semesterId}`, adminCookie)).json();
    expect(after).toEqual([
      { studentId: ani, name: 'Ani', predicate: 'A', note: 'Aktif' },
      { studentId: budi, name: 'Budi', predicate: 'B', note: null },
    ]);

    const nonMember = await call('PUT', url(), adminCookie, {
      semesterId,
      records: [{ studentId: citra, predicate: 'A' }],
    });
    expect(nonMember.json().error.code).toBe('invalid_reference');
    expect(
      (
        await call('PUT', url(), adminCookie, {
          semesterId: crypto.randomUUID(),
          records: [{ studentId: ani, predicate: 'A' }],
        })
      ).json().error.code,
    ).toBe('invalid_reference');
    expect(
      (await call('PUT', url(), adminCookie, { semesterId, records: [{ studentId: ani, predicate: 'E' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('PUT', url(), otherTeacherCookie, {
          semesterId,
          records: [{ studentId: ani, predicate: 'A' }],
        })
      ).statusCode,
    ).toBe(403);
    expect((await call('GET', `${url()}?semesterId=${crypto.randomUUID()}`, adminCookie)).statusCode).toBe(
      400,
    );
  });
});

describe('laporan', () => {
  it('merekap kehadiran per anggota pada rentang tanggal', async () => {
    const report = (
      await call(
        'GET',
        `/v1/extracurriculars/${ids.futsal}/report?from=${daysAgo(30)}&to=${today()}`,
        principalCookie,
      )
    ).json();
    expect(report.totalSessions).toBe(2);
    expect(report.students).toEqual([
      expect.objectContaining({ studentId: ani, present: 0, excused: 1, sick: 0, absent: 0, sessions: 1 }),
      expect.objectContaining({ studentId: budi, present: 0, excused: 0, sick: 1, absent: 0, sessions: 1 }),
    ]);
    const narrow = (
      await call(
        'GET',
        `/v1/extracurriculars/${ids.futsal}/report?from=${daysAgo(3)}&to=${today()}`,
        adminCookie,
      )
    ).json();
    expect(narrow.totalSessions).toBe(1);
    expect(
      (
        await call(
          'GET',
          `/v1/extracurriculars/${ids.futsal}/report?from=${daysAgo(500)}&to=${today()}`,
          adminCookie,
        )
      ).statusCode,
    ).toBe(400);
  });
});

describe('menghapus ekskul', () => {
  it('ekskul berpertemuan ditolak 409 in_use; yang kosong boleh dihapus', async () => {
    const del = await call('DELETE', `/v1/extracurriculars/${ids.futsal}`, adminCookie);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('in_use');
    expect((await call('DELETE', `/v1/extracurriculars/${ids.futsal}`, coachCookie)).statusCode).toBe(403);

    await call('POST', `/v1/extracurriculars/${ids.pramuka}/members`, adminCookie, { studentIds: [ani] });
    expect(
      (await call('DELETE', `/v1/extracurriculars/${ids.pramuka}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/v1/extracurriculars/${ids.pramuka}`, adminCookie)).statusCode).toBe(200);
    const list = (await call('GET', '/v1/extracurriculars', adminCookie)).json();
    expect(list.map((e: { name: string }) => e.name)).toEqual(['Futsal']);
  });
});

describe('kategori dinamis', () => {
  const create = (cookie: string, body: object, sid = schoolId) =>
    call('POST', '/v1/extracurricular-categories', cookie, body, sid);

  it('sekolah tanpa baris diisi kategori bawaan secara malas', async () => {
    const list = await call('GET', '/v1/extracurricular-categories', otherCookie, undefined, otherId);
    expect(list.statusCode).toBe(200);
    expect(list.json().map((c: { key: string }) => c.key)).toEqual([
      'sport',
      'art',
      'religion',
      'science',
      'scout',
      'other',
    ]);
    expect(list.json()[0]).toMatchObject({ label: 'Olahraga', icon: 'trophy', tone: 'emerald', usedBy: 0 });
    // Guru boleh membaca, tidak boleh menulis.
    expect((await call('GET', '/v1/extracurricular-categories', coachCookie)).statusCode).toBe(200);
    expect((await create(coachCookie, { key: 'x', label: 'X' })).statusCode).toBe(403);
  });

  it('menambah, memvalidasi, memakai, menonaktifkan, dan menghapus kategori', async () => {
    const made = await create(adminCookie, { key: 'musik', label: 'Musik', icon: 'music', tone: 'violet' });
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({
      key: 'musik',
      icon: 'music',
      tone: 'violet',
      active: true,
      usedBy: 0,
    });
    const catId = made.json().id;
    expect((await create(adminCookie, { key: 'musik', label: 'Lagi' })).statusCode).toBe(409);
    expect((await create(adminCookie, { key: 'Bad Key', label: 'X' })).statusCode).toBe(400);
    expect((await create(adminCookie, { key: 'ikon', label: 'X', icon: 'rocket' })).statusCode).toBe(400);
    expect((await create(adminCookie, { key: 'nada', label: 'X', tone: 'pink' })).statusCode).toBe(400);
    // Kategori sekolah lain tidak terlihat dan tidak bisa dipakai.
    const foreign = await call('GET', '/v1/extracurricular-categories', otherCookie, undefined, otherId);
    expect(foreign.json().some((c: { key: string }) => c.key === 'musik')).toBe(false);
    expect(
      (await call('POST', '/v1/extracurriculars', otherCookie, { name: 'Band', category: 'musik' }, otherId))
        .statusCode,
    ).toBe(400);

    const band = await call('POST', '/v1/extracurriculars', adminCookie, { name: 'Band', category: 'musik' });
    expect(band.statusCode).toBe(201);
    expect(band.json().category).toBe('musik');
    const listed = (await call('GET', '/v1/extracurricular-categories', adminCookie)).json();
    expect(listed.find((c: { key: string }) => c.key === 'musik').usedBy).toBe(1);

    const catUrl = `/v1/extracurricular-categories/${catId}`;
    const del = await call('DELETE', catUrl, adminCookie);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('in_use');

    const off = await call('PUT', catUrl, adminCookie, {
      label: 'Musik',
      icon: 'music',
      tone: 'violet',
      active: false,
    });
    expect(off.json().active).toBe(false);
    expect(
      (await call('POST', '/v1/extracurriculars', adminCookie, { name: 'Paduan', category: 'musik' })).json()
        .error.code,
    ).toBe('invalid_reference');
    // Ekskul yang sudah memakai kategori nonaktif tetap bisa diubah tanpa mengganti kategori.
    const keep = await call('PUT', `/v1/extracurriculars/${band.json().id}`, adminCookie, {
      name: 'Band',
      category: 'musik',
      description: 'Latihan',
    });
    expect(keep.statusCode).toBe(200);

    expect((await call('DELETE', `/v1/extracurriculars/${band.json().id}`, adminCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', catUrl, coachCookie)).statusCode).toBe(403);
    expect((await call('DELETE', catUrl, otherCookie, undefined, otherId)).statusCode).toBe(404);
    expect((await call('DELETE', catUrl, adminCookie)).statusCode).toBe(200);
  });
});
