import {
  academicYear,
  assignRoles,
  calendarEvent,
  entitlement,
  eq,
  foundation,
  lessonAttendance,
  lessonPeriod,
  member,
  scheduleEntry,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta, weekdayOf } from './gate';

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
let adminCookie = '';
let teacherACookie = '';
let teacherBCookie = '';
let noModuleCookie = '';
let otherCookie = '';
let memberA = '';
let memberB = '';

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

const kiosk = (method: 'GET' | 'POST', url: string, key: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { 'x-device-key': key, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

/** Tanggal Jakarta `back` hari sebelum hari ini. */
const daysAgo = (back: number) => jakarta(new Date(Date.now() - back * 86_400_000)).date;
const today = () => jakarta(new Date()).date;
/** Hari terakhir sebelum hari ini yang jatuh Senin-Sabtu (punya jadwal). */
function lastSchoolDay() {
  for (let back = 1; back < 8; back++) {
    const d = daysAgo(back);
    if (weekdayOf(d) <= 6) return d;
  }
  throw new Error('tidak mungkin');
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Gerbang', slug: `yg-${run}` })
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
  schoolId = await make(`gbg-${run}`, ['attendance', 'schedule']);
  noModuleId = await make(`gbg-nomod-${run}`, []);
  otherId = await make(`gbg-lain-${run}`, ['attendance']);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  adminCookie = (await join('admin-gerbang', schoolId, ['school_admin'])).cookie;
  const a = await join('guru-a', schoolId, ['teacher']);
  teacherACookie = a.cookie;
  memberA = a.memberId;
  const b = await join('guru-b', schoolId, ['teacher']);
  teacherBCookie = b.cookie;
  memberB = b.memberId;
  noModuleCookie = (await join('admin-tanpa-modul', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-gerbang-lain', otherId, ['school_admin'])).cookie;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'lesson_attendance',
      'tap_event',
      'daily_attendance',
      'attendance_card',
      'attendance_device',
      'attendance_policy',
      'duty_roster',
      'schedule_entry',
      'calendar_event',
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

const ids: {
  kelas: string;
  siswa: string[];
  guruA: string;
  guruB: string;
  mapel: string;
  key: string;
  deviceId: string;
} = { kelas: '', siswa: [], guruA: '', guruB: '', mapel: '', key: '', deviceId: '' };

describe('modul, izin, dan kebijakan', () => {
  it('modul harus aktif, guru tidak boleh mengatur, dan kebijakan divalidasi', async () => {
    const blocked = await call('GET', '/v1/attendance/policy', noModuleCookie, undefined, noModuleId);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await call('GET', '/v1/attendance/devices', teacherACookie)).statusCode).toBe(403);
    expect((await app.inject('/v1/attendance/policy')).statusCode).toBe(401);

    const def = (await call('GET', '/v1/attendance/policy', teacherACookie)).json();
    expect(def).toMatchObject({ lateAfter: '07:15', departureFrom: '12:00', debounceSeconds: 30 });

    const bad = await call('PUT', '/v1/attendance/policy', adminCookie, { ...def, lateAfter: '13:00' });
    expect(bad.json().error.code).toBe('invalid_policy');
    const saved = await call('PUT', '/v1/attendance/policy', adminCookie, { ...def, lateAfter: '07:00' });
    expect(saved.statusCode).toBe(200);
    expect((await call('GET', '/v1/attendance/policy', teacherACookie)).json().lateAfter).toBe('07:00');
  });
});

describe('data dasar', () => {
  it('menyiapkan kelas, siswa, guru, dan jadwal', async () => {
    const mk = async (url: string, body: object) => (await call('POST', url, adminCookie, body)).json();
    ids.kelas = (await mk('/v1/classes', { academicYearId: yearId, name: '7A', level: '7' })).id;
    ids.mapel = (await mk('/v1/subjects', { code: 'MTK', name: 'Matematika' })).id;
    for (const [i, name] of ['Ani', 'Budi', 'Citra'].entries()) {
      const s = await mk('/v1/students', { name, gender: i === 1 ? 'L' : 'P', classId: ids.kelas });
      expect(s.id).toBeTruthy();
      ids.siswa.push(s.id);
    }
    ids.guruA = (await mk('/v1/teachers', { name: 'Guru A' })).id;
    ids.guruB = (await mk('/v1/teachers', { name: 'Guru B' })).id;
    const db = app.platformDb;
    await db.update(teacher).set({ memberId: memberA }).where(eq(teacher.id, ids.guruA));
    await db.update(teacher).set({ memberId: memberB }).where(eq(teacher.id, ids.guruB));

    const [period] = await db
      .insert(lessonPeriod)
      .values({ schoolId, number: 1, startsAt: '07:00', endsAt: '07:40' })
      .returning();
    const weekdays = new Set([weekdayOf(lastSchoolDay()), weekdayOf(today())].filter((d) => d <= 6));
    for (const weekday of weekdays) {
      await db.insert(scheduleEntry).values({
        schoolId,
        academicYearId: yearId,
        classId: ids.kelas,
        subjectId: ids.mapel,
        teacherId: ids.guruA,
        weekday,
        periodId: period!.id,
      });
    }
  });
});

describe('perangkat dan kartu', () => {
  it('perangkat mendapat kunci sekali, bisa dinonaktifkan, dan diputar kuncinya', async () => {
    const created = await call('POST', '/v1/attendance/devices', adminCookie, { name: 'Gerbang utama' });
    expect(created.statusCode).toBe(201);
    ids.key = created.json().key;
    ids.deviceId = created.json().id;
    expect(ids.key).toMatch(/^esk_/);

    const list = (await call('GET', '/v1/attendance/devices', adminCookie)).json();
    expect(list[0]).toMatchObject({ name: 'Gerbang utama', keyPrefix: ids.key.slice(0, 8), active: true });
    expect(JSON.stringify(list)).not.toContain(ids.key);

    expect((await kiosk('GET', '/v1/kiosk/info', ids.key)).json()).toMatchObject({
      device: 'Gerbang utama',
      methods: ['rfid', 'qr', 'manual'],
    });
    expect((await kiosk('GET', '/v1/kiosk/info', 'esk_salah-salah-salah-salah')).statusCode).toBe(401);
    expect((await app.inject('/v1/kiosk/info')).statusCode).toBe(401);

    await call('PATCH', `/v1/attendance/devices/${ids.deviceId}`, adminCookie, { active: false });
    expect((await kiosk('GET', '/v1/kiosk/info', ids.key)).statusCode).toBe(401);
    await call('PATCH', `/v1/attendance/devices/${ids.deviceId}`, adminCookie, { active: true });

    const rotated = (
      await call('POST', `/v1/attendance/devices/${ids.deviceId}/rotate-key`, adminCookie)
    ).json();
    expect((await kiosk('GET', '/v1/kiosk/info', ids.key)).statusCode).toBe(401);
    ids.key = rotated.key;
    expect((await kiosk('GET', '/v1/kiosk/info', ids.key)).statusCode).toBe(200);
  });

  it('kartu RFID wajib berkode, kode unik, QR dibuatkan token, siswa lain sekolah ditolak', async () => {
    const [ani, budi, citra] = ids.siswa;
    const post = (body: object, cookie = adminCookie, sid = schoolId) =>
      call('POST', '/v1/attendance/cards', cookie, body, sid);
    expect((await post({ studentId: ani, kind: 'rfid' })).json().error.code).toBe('code_required');
    const rfid = await post({ studentId: ani, kind: 'rfid', code: 'a1b2c3d4' });
    expect(rfid.statusCode).toBe(201);
    expect(rfid.json().code).toBe('A1B2C3D4');
    expect((await post({ studentId: budi, kind: 'rfid', code: 'A1B2C3D4' })).statusCode).toBe(409);
    expect((await post({ studentId: budi, kind: 'rfid', code: 'B0B0B0B0' })).statusCode).toBe(201);
    expect((await post({ studentId: citra, kind: 'qr' })).json().code).toMatch(/^esq_/);
    // Siswa sekolah ini tidak terlihat dari sekolah lain.
    expect(
      (await post({ studentId: ani, kind: 'rfid', code: 'ZZZZ9999' }, otherCookie, otherId)).statusCode,
    ).toBe(400);
    expect((await call('GET', '/v1/attendance/cards', teacherACookie)).statusCode).toBe(403);
  });
});

describe('tap kiosk', () => {
  const day = lastSchoolDay();
  const tap = (code: string, time: string, extra: object = {}) =>
    kiosk('POST', '/v1/kiosk/tap', ids.key, { code, at: `${day}T${time}+07:00`, ...extra });

  it('masuk tepat waktu, tap ganda diabaikan, masuk kedua tidak mengubah jam', async () => {
    const first = (await tap('a1b2c3d4', '06:50:00')).json();
    expect(first).toMatchObject({ result: 'in', direction: 'in', late: false });
    expect(first.student).toMatchObject({ name: 'Ani', className: '7A' });
    expect((await tap('A1B2C3D4', '06:50:10')).json().result).toBe('duplicate');
    expect((await tap('A1B2C3D4', '06:58:00')).json().result).toBe('already_in');
  });

  it('terlambat, pulang, dan kirim ulang offline tidak dobel', async () => {
    expect((await tap('B0B0B0B0', '07:30:00')).json()).toMatchObject({ result: 'in', late: true });
    expect((await tap('B0B0B0B0', '13:00:00', { clientId: 'dev1-0001' })).json().result).toBe('out');
    expect((await tap('B0B0B0B0', '13:10:00', { clientId: 'dev1-0001' })).json().result).toBe('replayed');
  });

  it('kartu tak dikenal, waktu di luar rentang, metode dinonaktifkan', async () => {
    expect((await tap('00000000', '06:00:00')).json().error.code).toBe('unknown_card');
    const future = await kiosk('POST', '/v1/kiosk/tap', ids.key, {
      code: 'A1B2C3D4',
      at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(future.json().error.code).toBe('invalid_time');
    const old = await kiosk('POST', '/v1/kiosk/tap', ids.key, {
      code: 'A1B2C3D4',
      at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });
    expect(old.json().error.code).toBe('invalid_time');

    const policy = (await call('GET', '/v1/attendance/policy', adminCookie)).json();
    await call('PUT', '/v1/attendance/policy', adminCookie, { ...policy, methods: ['rfid'] });
    const qr = (await call('GET', '/v1/attendance/cards?studentId=' + ids.siswa[2], adminCookie)).json()[0]
      .code;
    expect((await tap(qr, '06:40:00')).json().error.code).toBe('method_disabled');
    await call('PUT', '/v1/attendance/policy', adminCookie, { ...policy, methods: ['rfid', 'qr', 'manual'] });
    expect((await tap(qr, '06:40:00')).json().result).toBe('in');
  });

  it('rekap harian dan catatan tap tidak bisa diubah aplikasi', async () => {
    const daily = (await call('GET', `/v1/gate/daily?date=${day}`, teacherACookie)).json();
    expect(daily.summary).toMatchObject({ total: 3, present: 2, late: 1, notYet: 0 });
    const budi = daily.students.find((s: { name: string }) => s.name === 'Budi');
    expect(budi.checkOutAt).toBeTruthy();

    const asTenant = (q: ReturnType<typeof sql>) =>
      withTenant(app.tenantDb, [schoolId], (tx) => tx.execute(q));
    await expect(asTenant(sql`update tap_event set source = 'manual'`)).rejects.toThrow();
    await expect(asTenant(sql`delete from tap_event`)).rejects.toThrow();
  });

  it('libur sekolah menolak tap', async () => {
    await app.platformDb.insert(calendarEvent).values({
      schoolId,
      academicYearId: yearId,
      type: 'holiday',
      scope: 'school',
      title: 'Libur uji',
      startsOn: daysAgo(1),
      endsOn: daysAgo(1),
    });
    const res = await kiosk('POST', '/v1/kiosk/tap', ids.key, {
      code: 'A1B2C3D4',
      at: `${daysAgo(1)}T06:00:00+07:00`,
    });
    expect(res.json().error.code).toBe('school_closed');
    await app.platformDb.execute(sql`delete from calendar_event where school_id = ${schoolId}`);
  });
});

describe('guru piket', () => {
  it('hanya guru piket atau pengurus yang boleh absen gerbang manual', async () => {
    const [ani] = ids.siswa;
    const body = { studentId: ani, kind: 'sick' };
    expect((await call('POST', '/v1/gate/manual', teacherBCookie, body)).json().error.code).toBe(
      'not_on_duty',
    );
    expect((await call('GET', '/v1/duty-roster/me', teacherBCookie)).json()).toMatchObject({
      onDuty: false,
      canCover: false,
    });
    expect(
      (await call('PUT', '/v1/duty-roster', teacherBCookie, { date: today(), teacherIds: [ids.guruB] }))
        .statusCode,
    ).toBe(403);

    const set = await call('PUT', '/v1/duty-roster', adminCookie, { date: today(), teacherIds: [ids.guruB] });
    expect(set.statusCode).toBe(200);
    expect(
      (
        await call('PUT', '/v1/duty-roster', adminCookie, {
          date: today(),
          teacherIds: [crypto.randomUUID()],
        })
      ).statusCode,
    ).toBe(400);
    expect((await call('GET', '/v1/duty-roster/me', teacherBCookie)).json()).toMatchObject({
      onDuty: true,
      canCover: true,
    });
    const roster = (
      await call('GET', `/v1/duty-roster?from=${today()}&to=${today()}`, teacherACookie)
    ).json();
    expect(roster).toEqual([{ date: today(), teacherId: ids.guruB, teacherName: 'Guru B' }]);

    const marked = await call('POST', '/v1/gate/manual', teacherBCookie, body);
    expect(marked.json()).toMatchObject({ result: 'marked', status: 'sick' });
    const scan = await call('POST', '/v1/gate/scan', teacherBCookie, { code: 'b0b0b0b0' });
    expect(scan.json()).toMatchObject({ result: 'in', student: { name: 'Budi' } });
    const daily = (await call('GET', `/v1/gate/daily?date=${today()}`, teacherACookie)).json();
    expect(daily.students.find((s: { name: string }) => s.name === 'Ani').status).toBe('sick');
    expect(
      (await call('POST', '/v1/gate/scan', teacherACookie, { code: 'b0b0b0b0' })).json().error.code,
    ).toBe('not_on_duty');
  });
});

describe('absensi per jam pelajaran', () => {
  let entryPast = '';
  let entryToday = '';
  const day = lastSchoolDay();

  it('guru jadwal melihat dan mengisi jamnya; guru lain tidak', async () => {
    const lessons = (await call('GET', `/v1/lessons?date=${day}`, teacherACookie)).json();
    expect(lessons.canCover).toBe(false);
    expect(lessons.lessons).toHaveLength(1);
    expect(lessons.lessons[0]).toMatchObject({
      className: '7A',
      subjectName: 'Matematika',
      mine: true,
      total: 3,
      filled: 0,
    });
    entryPast = lessons.lessons[0].id;
    expect((await call('GET', `/v1/lessons?date=${day}`, teacherBCookie)).json().lessons).toHaveLength(0);

    const sheet = (
      await call('GET', `/v1/lesson-attendance?scheduleEntryId=${entryPast}&date=${day}`, teacherACookie)
    ).json();
    expect(sheet).toMatchObject({ canRecord: true, substitute: false });
    // Status gerbang ikut tampil: Ani tap masuk, Budi terlambat.
    expect(sheet.students.find((s: { name: string }) => s.name === 'Ani').gate).toBe('present');
    expect(sheet.students.find((s: { name: string }) => s.name === 'Budi').gate).toBe('late');

    const records = ids.siswa.map((studentId) => ({ studentId, status: 'present' }));
    const forbidden = await call('PUT', '/v1/lesson-attendance', teacherBCookie, {
      scheduleEntryId: entryPast,
      date: day,
      records,
    });
    expect(forbidden.json().error.code).toBe('not_your_lesson');
    const saved = await call('PUT', '/v1/lesson-attendance', teacherACookie, {
      scheduleEntryId: entryPast,
      date: day,
      records,
    });
    expect(saved.json()).toEqual({ saved: 3, substitute: false });
    const after = (await call('GET', `/v1/lessons?date=${day}`, teacherACookie)).json();
    expect(after.lessons[0].filled).toBe(3);
  });

  it('validasi tanggal dan anggota kelas', async () => {
    const put = (body: object) =>
      call('PUT', '/v1/lesson-attendance', teacherACookie, {
        scheduleEntryId: entryPast,
        records: [{ studentId: ids.siswa[0], status: 'absent' }],
        ...body,
      });
    expect((await put({ date: daysAgo(-3) })).json().error.code).toBe('future_date');
    const other = daysAgo(1) === day ? daysAgo(2) : daysAgo(1);
    expect((await put({ date: other })).json().error.code).toBe('invalid_date');
    const stray = await put({ date: day, records: [{ studentId: crypto.randomUUID(), status: 'present' }] });
    expect(stray.json().error.code).toBe('invalid_reference');
  });

  it.skipIf(weekdayOf(today()) > 6)(
    'guru piket menggantikan guru yang berhalangan, tercatat sebagai pengganti',
    async () => {
      // Guru B piket hari ini (diatur di tes sebelumnya) dan melihat semua jam.
      const lessons = (await call('GET', `/v1/lessons?date=${today()}`, teacherBCookie)).json();
      expect(lessons.canCover).toBe(true);
      expect(lessons.lessons[0]).toMatchObject({ mine: false });
      entryToday = lessons.lessons[0].id;

      const records = ids.siswa.map((studentId) => ({ studentId, status: 'present' }));
      const res = await call('PUT', '/v1/lesson-attendance', teacherBCookie, {
        scheduleEntryId: entryToday,
        date: today(),
        records,
      });
      expect(res.json()).toEqual({ saved: 3, substitute: true });
      const rows = await app.platformDb
        .select()
        .from(lessonAttendance)
        .where(eq(lessonAttendance.scheduleEntryId, entryToday));
      expect(rows.every((r) => r.substitute)).toBe(true);

      // Pengurus juga boleh menggantikan; pemilik jadwal menandainya bukan pengganti.
      expect(
        (
          await call('PUT', '/v1/lesson-attendance', adminCookie, {
            scheduleEntryId: entryToday,
            date: today(),
            records,
          })
        ).json().substitute,
      ).toBe(true);
      expect(
        (
          await call('PUT', '/v1/lesson-attendance', teacherACookie, {
            scheduleEntryId: entryToday,
            date: today(),
            records,
          })
        ).json().substitute,
      ).toBe(false);
    },
  );
});
