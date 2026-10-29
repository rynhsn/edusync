import {
  academicYear,
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  subscription,
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

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
const userIds: string[] = [];
let opCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
let otherCookie = '';

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
  return login(u.email);
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Jadwal', slug: `yj-${run}` })
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
    const [s] = await db.insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`jdw-${run}`, ['schedule', 'attendance']);
  noModuleId = await make(`jdw-nomod-${run}`, []);
  otherId = await make(`jdw-lain-${run}`, ['schedule', 'attendance']);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  opCookie = await join('operator-jadwal', schoolId, ['operator']);
  teacherCookie = await join('guru-jadwal', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul', noModuleId, ['school_admin']);
  otherCookie = await join('operator-jadwal-lain', otherId, ['operator']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'schedule_entry',
      'class_attendance',
      'calendar_event',
      'teaching_assignment',
      'lesson_period',
      'enrollment',
      'student',
      'teacher',
      'subject',
      'class_room',
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

async function setup(sid: string, cookie: string, label: string, year = yearId) {
  const mk = async (url: string, body: object) => (await call('POST', url, cookie, body, sid)).json();
  const kelas = await mk('/v1/classes', { academicYearId: year, name: `7${label}`, level: '7' });
  const mapel = await mk('/v1/subjects', { code: `MTK${label}`, name: `Matematika ${label}` });
  const guru = await mk('/v1/teachers', { name: `Guru ${label}` });
  return { kelas, mapel, guru };
}

describe('modul dan izin', () => {
  it('sekolah tanpa modul jadwal ditolak, guru hanya boleh membaca', async () => {
    const blocked = await call('GET', '/v1/lesson-periods', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');

    expect((await call('GET', '/v1/lesson-periods', teacherCookie)).statusCode).toBe(200);
    expect(
      (
        await call('POST', '/v1/lesson-periods', teacherCookie, {
          number: 1,
          startsAt: '07:00',
          endsAt: '07:40',
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject('/v1/lesson-periods')).statusCode).toBe(401);
  });

  it('/v1/me menampilkan modul aktif per sekolah', async () => {
    const me = (await app.inject({ url: '/v1/me', headers: { cookie: opCookie } })).json();
    expect(me.memberships[0].modules.sort()).toEqual(['attendance', 'schedule']);
    const none = (await app.inject({ url: '/v1/me', headers: { cookie: noModuleCookie } })).json();
    expect(none.memberships[0].modules).toEqual([]);
  });
});

describe('jam pelajaran', () => {
  it('membuat otomatis, menolak tumpang tindih dan nomor ganda, mengubah, dan menghapus', async () => {
    const gen = await call('POST', '/v1/lesson-periods/generate', opCookie, {
      firstStart: '07:00',
      count: 4,
      minutes: 40,
      breakAfter: 2,
      breakMinutes: 20,
    });
    expect(gen.statusCode).toBe(201);
    expect(gen.json().map((p: { startsAt: string; endsAt: string }) => [p.startsAt, p.endsAt])).toEqual([
      ['07:00', '07:40'],
      ['07:40', '08:20'],
      ['08:40', '09:20'],
      ['09:20', '10:00'],
    ]);
    // Sudah ada: tidak boleh dibuat ulang.
    expect(
      (
        await call('POST', '/v1/lesson-periods/generate', opCookie, {
          firstStart: '07:00',
          count: 2,
          minutes: 40,
        })
      ).statusCode,
    ).toBe(409);

    const periods = gen.json();
    expect(
      (
        await call('POST', '/v1/lesson-periods', opCookie, { number: 5, startsAt: '09:30', endsAt: '10:10' })
      ).json().error.code,
    ).toBe('invalid_period');
    expect(
      (await call('POST', '/v1/lesson-periods', opCookie, { number: 1, startsAt: '11:00', endsAt: '11:40' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await call('POST', '/v1/lesson-periods', opCookie, { number: 5, startsAt: '11:00', endsAt: '10:00' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/lesson-periods', opCookie, { number: 5, startsAt: '25:00', endsAt: '26:00' }))
        .statusCode,
    ).toBe(400);

    const five = await call('POST', '/v1/lesson-periods', opCookie, {
      number: 5,
      startsAt: '10:30',
      endsAt: '11:10',
    });
    expect(five.statusCode).toBe(201);
    const edit = await call('PUT', `/v1/lesson-periods/${five.json().id}`, opCookie, {
      number: 5,
      startsAt: '10:30',
      endsAt: '11:20',
    });
    expect(edit.json().endsAt).toBe('11:20');
    expect((await call('DELETE', `/v1/lesson-periods/${five.json().id}`, opCookie)).statusCode).toBe(200);
    expect(periods).toHaveLength(4);
  });
});

describe('kisi jadwal', () => {
  it('butuh guru pengampu, menolak guru ganda di jam yang sama, mengganti isi, dan mengosongkan', async () => {
    const a = await setup(schoolId, opCookie, 'A');
    const b = await setup(schoolId, opCookie, 'B');
    const periods = (await call('GET', '/v1/lesson-periods', opCookie)).json();
    const [p1, p2] = periods;
    const cell = (cls: string, subjectId: string, periodId: string, weekday = 1) =>
      call('PUT', '/v1/schedule/cell', opCookie, { classId: cls, weekday, periodId, subjectId });

    // Belum ada guru pengampu.
    const none = await cell(a.kelas.id, a.mapel.id, p1.id);
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('no_assignment');

    await call('PUT', `/v1/classes/${a.kelas.id}/assignments/${a.mapel.id}`, opCookie, {
      teacherId: a.guru.id,
    });
    const ok = await cell(a.kelas.id, a.mapel.id, p1.id);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ teacherName: 'Guru A', subjectName: 'Matematika A', weekday: 1 });

    // Guru yang sama mengampu kelas B: tidak boleh di jam yang sama, boleh di jam lain.
    await call('PUT', `/v1/classes/${b.kelas.id}/assignments/${b.mapel.id}`, opCookie, {
      teacherId: a.guru.id,
    });
    const busy = await cell(b.kelas.id, b.mapel.id, p1.id);
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('teacher_busy');
    expect(busy.json().error.message).toContain('7A');
    expect((await cell(b.kelas.id, b.mapel.id, p2.id)).statusCode).toBe(200);
    expect((await cell(b.kelas.id, b.mapel.id, p1.id, 2)).statusCode).toBe(200);

    // Mengisi ulang sel yang sama dengan guru yang sama tidak dianggap bentrok dengan dirinya sendiri.
    expect((await cell(a.kelas.id, a.mapel.id, p1.id)).statusCode).toBe(200);

    // Jadwal per kelas dan per guru.
    const byClass = (await call('GET', `/v1/schedule?classId=${b.kelas.id}`, teacherCookie)).json();
    expect(byClass).toHaveLength(2);
    const byTeacher = (await call('GET', `/v1/schedule?teacherId=${a.guru.id}`, teacherCookie)).json();
    expect(byTeacher.map((e: { className: string }) => e.className).sort()).toEqual(['7A', '7B', '7B']);
    expect((await call('GET', '/v1/schedule', teacherCookie)).statusCode).toBe(400);

    // Jam yang sudah dipakai tidak bisa dihapus; setelah dikosongkan bisa.
    expect((await call('DELETE', `/v1/lesson-periods/${p1.id}`, opCookie)).json().error.code).toBe('in_use');
    expect(
      (await call('DELETE', `/v1/schedule/cell?classId=${a.kelas.id}&weekday=1&periodId=${p1.id}`, opCookie))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('DELETE', `/v1/schedule/cell?classId=${a.kelas.id}&weekday=1&periodId=${p1.id}`, opCookie))
        .statusCode,
    ).toBe(404);
    expect((await cell(b.kelas.id, b.mapel.id, p1.id)).statusCode).toBe(200);
  });

  it('data sekolah lain tidak terlihat dan tidak bisa dipakai', async () => {
    const [otherYear] = await app.platformDb
      .insert(academicYear)
      .values({
        schoolId: otherId,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    const other = await setup(otherId, otherCookie, 'Z', otherYear?.id);
    const mine = await setup(schoolId, opCookie, 'C');
    await call(
      'POST',
      '/v1/lesson-periods/generate',
      otherCookie,
      { firstStart: '07:00', count: 2, minutes: 40 },
      otherId,
    );
    const otherPeriod = (await call('GET', '/v1/lesson-periods', otherCookie, undefined, otherId)).json()[0];
    // Kelas milik sekolah lain tidak ditemukan dari sekolah ini.
    const res = await call('PUT', '/v1/schedule/cell', opCookie, {
      classId: other.kelas.id,
      weekday: 1,
      periodId: otherPeriod.id,
      subjectId: mine.mapel.id,
    });
    expect(res.statusCode).toBe(404);
    expect((await call('GET', '/v1/lesson-periods', otherCookie, undefined, otherId)).json()).toHaveLength(2);
    expect(
      (await call('GET', `/v1/schedule?classId=${mine.kelas.id}`, otherCookie, undefined, otherId)).json(),
    ).toEqual([]);
  });
});

describe('absensi harian', () => {
  const put = (cookie: string, body: object, sid = schoolId) =>
    call('PUT', '/v1/attendance', cookie, body, sid);

  async function classWithStudents(label: string) {
    const kelas = (
      await call('POST', '/v1/classes', opCookie, { academicYearId: yearId, name: `Abs${label}`, level: '8' })
    ).json();
    const ids: string[] = [];
    for (const name of ['Dewi', 'Agus', 'Citra']) {
      const s = (
        await call('POST', '/v1/students', opCookie, {
          name: `${name} ${label}`,
          gender: 'L',
          classId: kelas.id,
        })
      ).json();
      ids.push(s.id);
    }
    return { kelas, ids };
  }

  it('modul dan izin: sekolah tanpa modul ditolak, guru boleh mengisi, pengguna biasa tidak', async () => {
    const { kelas } = await classWithStudents('P');
    const blocked = await call(
      'GET',
      `/v1/attendance?classId=${kelas.id}&date=2026-09-01`,
      noModuleCookie,
      undefined,
      noModuleId,
    );
    expect(blocked.json().error.code).toBe('module_disabled');
    expect(
      (await call('GET', `/v1/attendance?classId=${kelas.id}&date=2026-09-01`, teacherCookie)).statusCode,
    ).toBe(200);
    expect((await app.inject(`/v1/attendance?classId=${kelas.id}&date=2026-09-01`)).statusCode).toBe(401);
  });

  it('mengisi, mengubah, rekap, dan menghapus; siswa urut nama dan belum diisi bernilai null', async () => {
    const { kelas, ids } = await classWithStudents('Q');
    const before = (
      await call('GET', `/v1/attendance?classId=${kelas.id}&date=2026-09-02`, teacherCookie)
    ).json();
    expect(before.students.map((s: { name: string }) => s.name)).toEqual(['Agus Q', 'Citra Q', 'Dewi Q']);
    expect(before.students.every((s: { status: unknown }) => s.status === null)).toBe(true);
    expect(before.closed).toBeNull();

    const [dewi, agus, citra] = ids as [string, string, string];
    const day = (date: string, rows: [string, string][]) =>
      put(teacherCookie, {
        classId: kelas.id,
        date,
        records: rows.map(([studentId, status]) => ({ studentId, status })),
      });
    expect(
      (
        await day('2026-09-02', [
          [dewi, 'present'],
          [agus, 'sick'],
          [citra, 'absent'],
        ])
      ).json().saved,
    ).toBe(3);
    expect(
      (
        await day('2026-09-03', [
          [dewi, 'present'],
          [agus, 'present'],
          [citra, 'excused'],
        ])
      ).statusCode,
    ).toBe(200);
    // Mengubah satu siswa menimpa isian lama, tidak menggandakan.
    expect((await day('2026-09-02', [[agus, 'present']])).statusCode).toBe(200);

    const sheet = (
      await call('GET', `/v1/attendance?classId=${kelas.id}&date=2026-09-02`, teacherCookie)
    ).json();
    expect(
      Object.fromEntries(sheet.students.map((s: { name: string; status: string }) => [s.name, s.status])),
    ).toEqual({
      'Agus Q': 'present',
      'Citra Q': 'absent',
      'Dewi Q': 'present',
    });

    const recap = (
      await call(
        'GET',
        `/v1/attendance/recap?classId=${kelas.id}&from=2026-09-01&to=2026-09-30`,
        teacherCookie,
      )
    ).json();
    expect(recap.days).toBe(2);
    const row = (name: string) => recap.students.find((s: { name: string }) => s.name === name);
    expect(row('Agus Q')).toMatchObject({ present: 2, sick: 0 });
    expect(row('Citra Q')).toMatchObject({ absent: 1, excused: 1, present: 0 });
    expect(
      (
        await call(
          'GET',
          `/v1/attendance/recap?classId=${kelas.id}&from=2026-09-30&to=2026-09-01`,
          teacherCookie,
        )
      ).statusCode,
    ).toBe(400);

    expect(
      (await call('DELETE', `/v1/attendance?classId=${kelas.id}&date=2026-09-03`, opCookie)).statusCode,
    ).toBe(200);
    expect(
      (await call('DELETE', `/v1/attendance?classId=${kelas.id}&date=2026-09-03`, opCookie)).statusCode,
    ).toBe(404);
  });

  it('menolak tanggal yang belum tiba, hari libur sekolah, siswa bukan anggota kelas, dan kelas sekolah lain', async () => {
    const { kelas, ids } = await classWithStudents('R');
    const other = await classWithStudents('S');
    const rec = (studentId: string) => [{ studentId, status: 'present' }];

    const future = await put(teacherCookie, {
      classId: kelas.id,
      date: '2099-01-01',
      records: rec(ids[0] as string),
    });
    expect(future.json().error.code).toBe('future_date');

    // Libur dari kalender akademik menutup absensi dan terlihat di lembar absensi.
    await call('POST', `/v1/academic-years/${yearId}/events`, opCookie, {
      type: 'holiday',
      title: 'Libur Uji',
      startsOn: '2026-09-10',
      endsOn: '2026-09-11',
    });
    const closed = await put(teacherCookie, {
      classId: kelas.id,
      date: '2026-09-10',
      records: rec(ids[0] as string),
    });
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error.code).toBe('school_closed');
    const sheet = (
      await call('GET', `/v1/attendance?classId=${kelas.id}&date=2026-09-11`, teacherCookie)
    ).json();
    expect(sheet.closed).toEqual({ type: 'holiday', title: 'Libur Uji' });

    // Siswa kelas lain tidak boleh dimasukkan.
    const stray = await put(teacherCookie, {
      classId: kelas.id,
      date: '2026-09-04',
      records: rec(other.ids[0] as string),
    });
    expect(stray.json().error.code).toBe('invalid_reference');

    // Sekolah lain tidak dapat mengakses kelas ini.
    expect(
      (
        await call(
          'GET',
          `/v1/attendance?classId=${kelas.id}&date=2026-09-04`,
          otherCookie,
          undefined,
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await put(
          otherCookie,
          { classId: kelas.id, date: '2026-09-04', records: rec(ids[0] as string) },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
  });
});
