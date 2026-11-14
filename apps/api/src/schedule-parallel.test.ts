import { randomUUID } from 'node:crypto';
import {
  academicYear,
  assignRoles,
  classSubjectParticipation,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3B.3: jadwal paralel (lane) dan pertemuan gabungan (combinedKey). Sekolah tanpa keduanya berperilaku persis seperti
 * sebelumnya (dijaga juga oleh schedule.test.ts dan schedule-semester.test.ts yang tidak diubah).
 */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const NIL_KEY = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
let otherYearId = '';
const userIds: string[] = [];
let opCookie = '';
let teacherCookie = '';
let otherCookie = '';
let periods: { id: string }[] = [];

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
    .values({ name: 'Yayasan Paralel', slug: `yp-${run}` })
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
  const make = async (slug: string) => {
    const [s] = await db.insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of ['schedule', 'attendance']) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`par-${run}`);
  otherId = await make(`par-lain-${run}`);
  const year = (sid: string) =>
    db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
  yearId = (await year(schoolId))[0]!.id;
  otherYearId = (await year(otherId))[0]!.id;
  opCookie = await join('operator-paralel', schoolId, ['operator']);
  teacherCookie = await join('guru-paralel', schoolId, ['teacher']);
  otherCookie = await join('operator-paralel-lain', otherId, ['operator']);
  await call('POST', '/v1/lesson-periods/generate', opCookie, { firstStart: '07:00', count: 6, minutes: 40 });
  periods = (await call('GET', '/v1/lesson-periods', opCookie)).json();
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'schedule_entry',
      'semester',
      'class_subject_participation',
      'teaching_assignment',
      'teaching_assignment_history',
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

interface Fx {
  classA: { id: string };
  classB: { id: string };
  classC: { id: string };
  fis: { id: string };
  kim: { id: string };
  mtk: { id: string };
  tFis: { id: string };
  tKim: { id: string };
  tMtk: { id: string };
}

/** Tiga rombel, tiga mapel (Fisika dan Kimia pilihan di semua rombel, Matematika wajib), tiga guru. */
async function fixture(label: string): Promise<Fx> {
  const mk = async (url: string, body: object) => (await call('POST', url, opCookie, body)).json();
  const classA = await mk('/v1/classes', { academicYearId: yearId, name: `XI-${label}1`, level: '11' });
  const classB = await mk('/v1/classes', { academicYearId: yearId, name: `XI-${label}2`, level: '11' });
  const classC = await mk('/v1/classes', { academicYearId: yearId, name: `XI-${label}3`, level: '11' });
  const fis = await mk('/v1/subjects', { code: `FIS${label}`, name: `Fisika ${label}` });
  const kim = await mk('/v1/subjects', { code: `KIM${label}`, name: `Kimia ${label}` });
  const mtk = await mk('/v1/subjects', { code: `MTK${label}`, name: `Matematika ${label}` });
  const tFis = await mk('/v1/teachers', { name: `Guru Fisika ${label}` });
  const tKim = await mk('/v1/teachers', { name: `Guru Kimia ${label}` });
  const tMtk = await mk('/v1/teachers', { name: `Guru Mtk ${label}` });
  for (const c of [classA, classB, classC]) {
    for (const [s, t] of [
      [fis, tFis],
      [kim, tKim],
      [mtk, tMtk],
    ] as const) {
      await call('PUT', `/v1/classes/${c.id}/assignments/${s.id}`, opCookie, { teacherId: t.id });
    }
    for (const s of [fis, kim]) {
      await app.platformDb
        .insert(classSubjectParticipation)
        .values({ schoolId, classId: c.id, subjectId: s.id, mode: 'selected', updatedBy: 'test' });
    }
  }
  return { classA, classB, classC, fis, kim, mtk, tFis, tKim, tMtk };
}

const put = (body: object) => call('PUT', '/v1/schedule/cell', opCookie, body);
const del = (qs: string) => call('DELETE', `/v1/schedule/cell?${qs}`, opCookie);
const grid = async (classId: string) =>
  (await call('GET', `/v1/schedule?classId=${classId}`, opCookie)).json();

describe('lane bawaan: perilaku lama', () => {
  it('tanpa lane dan combinedKey respons tidak memuat field baru dan sel yang sama ditimpa', async () => {
    const fx = await fixture('L');
    const base = { classId: fx.classA.id, weekday: 1, periodId: periods[0]!.id };
    const first = await put({ ...base, subjectId: fx.mtk.id });
    expect(first.statusCode).toBe(200);
    expect(first.json()).not.toHaveProperty('lane');
    expect(first.json()).not.toHaveProperty('combinedKey');
    const again = await put({ ...base, subjectId: fx.fis.id });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    // lane 0 eksplisit sama dengan tanpa lane.
    const explicit = await put({ ...base, subjectId: fx.mtk.id, lane: 0 });
    expect(explicit.json().id).toBe(first.json().id);
    const rows = await grid(fx.classA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('lane');
  });

  it('guru yang sama di dua kelas pada slot yang sama tanpa kunci tetap 409 teacher_busy', async () => {
    const fx = await fixture('M');
    const slot = { weekday: 2, periodId: periods[0]!.id, subjectId: fx.fis.id };
    expect((await put({ ...slot, classId: fx.classA.id })).statusCode).toBe(200);
    const busy = await put({ ...slot, classId: fx.classB.id });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('teacher_busy');
  });
});

describe('jalur paralel (lane)', () => {
  it('beberapa sel di satu slot hanya untuk mapel berpenanda pilihan', async () => {
    const fx = await fixture('P');
    const slot = { classId: fx.classA.id, weekday: 3, periodId: periods[0]!.id };
    const fis = await put({ ...slot, subjectId: fx.fis.id });
    expect(fis.statusCode).toBe(200);
    const kim = await put({ ...slot, subjectId: fx.kim.id, lane: 1 });
    expect(kim.statusCode).toBe(200);
    expect(kim.json()).toMatchObject({ lane: 1, subjectName: `Kimia P`, teacherName: 'Guru Kimia P' });
    expect(kim.json().id).not.toBe(fis.json().id);

    // Mapel wajib (tanpa penanda) tidak boleh ikut paralel: di lane lain atau menimpa lane 0 yang berdampingan.
    const mtkLane = await put({ ...slot, subjectId: fx.mtk.id, lane: 2 });
    expect(mtkLane.statusCode).toBe(400);
    expect(mtkLane.json().error.code).toBe('parallel_requires_selected');
    expect(mtkLane.json().error.message).toContain('Matematika P');
    const mtkOver = await put({ ...slot, subjectId: fx.mtk.id });
    expect(mtkOver.statusCode).toBe(400);
    expect(mtkOver.json().error.code).toBe('parallel_requires_selected');

    // Lane 1 sendirian pun menuntut mapel berpenanda; satu sel lane 0 mapel wajib tetap sah (perilaku lama).
    const other = { classId: fx.classA.id, weekday: 3, periodId: periods[1]!.id };
    expect((await put({ ...other, subjectId: fx.mtk.id, lane: 1 })).json().error.code).toBe(
      'parallel_requires_selected',
    );
    expect((await put({ ...other, subjectId: fx.mtk.id })).statusCode).toBe(200);
    // Slot berisi mapel wajib lane 0 tidak boleh ditambah lane lain.
    const addToMtk = await put({ ...other, subjectId: fx.fis.id, lane: 1 });
    expect(addToMtk.statusCode).toBe(400);
    expect(addToMtk.json().error.code).toBe('parallel_requires_selected');

    // Lane di luar 0..9 ditolak validasi.
    expect((await put({ ...slot, subjectId: fx.fis.id, lane: 10 })).statusCode).toBe(400);
    expect((await put({ ...slot, subjectId: fx.fis.id, lane: -1 })).statusCode).toBe(400);
  });

  it('GET memuat lane hanya bila bukan 0 dan DELETE menghapus satu lane saja', async () => {
    const fx = await fixture('G');
    const slot = { classId: fx.classA.id, weekday: 4, periodId: periods[0]!.id };
    await put({ ...slot, subjectId: fx.fis.id });
    await put({ ...slot, subjectId: fx.kim.id, lane: 3 });
    const rows = await grid(fx.classA.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('lane');
    expect(rows[1]).toMatchObject({ lane: 3 });
    // Per guru memuat sel lane-nya juga.
    const byTeacher = (await call('GET', `/v1/schedule?teacherId=${fx.tKim.id}`, teacherCookie)).json();
    expect(byTeacher).toHaveLength(1);
    expect(byTeacher[0]).toMatchObject({ lane: 3 });

    const q = `classId=${fx.classA.id}&weekday=4&periodId=${periods[0]!.id}`;
    expect((await del(`${q}&lane=2`)).statusCode).toBe(404);
    expect((await del(`${q}&lane=3`)).statusCode).toBe(200);
    expect(await grid(fx.classA.id)).toHaveLength(1);
    // Tanpa lane = lane 0.
    expect((await del(q)).statusCode).toBe(200);
    expect(await grid(fx.classA.id)).toHaveLength(0);
  });

  it('guru yang sama tidak boleh dua sel di slot yang sama walau beda lane', async () => {
    const fx = await fixture('T');
    // Fisika dan Kimia diampu guru yang sama di kelas A.
    await call('PUT', `/v1/classes/${fx.classA.id}/assignments/${fx.kim.id}`, opCookie, {
      teacherId: fx.tFis.id,
    });
    const slot = { classId: fx.classA.id, weekday: 5, periodId: periods[0]!.id };
    expect((await put({ ...slot, subjectId: fx.fis.id })).statusCode).toBe(200);
    const busy = await put({ ...slot, subjectId: fx.kim.id, lane: 1 });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('teacher_busy');
  });

  it('lane yang sama di kelas lain tidak bentrok; guru sama di kelas lain pada lane lain tetap bentrok', async () => {
    const fx = await fixture('K');
    const at = { weekday: 1, periodId: periods[2]!.id };
    expect((await put({ ...at, classId: fx.classA.id, subjectId: fx.fis.id })).statusCode).toBe(200);
    expect((await put({ ...at, classId: fx.classB.id, subjectId: fx.kim.id })).statusCode).toBe(200);
    const busy = await put({ ...at, classId: fx.classB.id, subjectId: fx.fis.id, lane: 1 });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('teacher_busy');
  });

  it('hanya pengelola jadwal yang boleh menulis jalur paralel', async () => {
    const fx = await fixture('H');
    const res = await call('PUT', '/v1/schedule/cell', teacherCookie, {
      classId: fx.classA.id,
      weekday: 1,
      periodId: periods[0]!.id,
      subjectId: fx.fis.id,
      lane: 1,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('pertemuan gabungan (combinedKey)', () => {
  // Kunci baru per uji supaya sel uji lain tidak ikut menjadi anggota kelompok.
  let key = '';
  beforeEach(() => {
    key = randomUUID();
  });

  it('guru yang sama di beberapa rombel lolos teacher_busy hanya dengan kunci sama', async () => {
    const fx = await fixture('C');
    const at = { weekday: 2, periodId: periods[3]!.id, subjectId: fx.fis.id };
    const a = await put({ ...at, classId: fx.classA.id, combinedKey: key });
    expect(a.statusCode).toBe(200);
    expect(a.json().combinedKey).toBe(key);
    const b = await put({ ...at, classId: fx.classB.id, combinedKey: key });
    expect(b.statusCode).toBe(200);
    const c = await put({ ...at, classId: fx.classC.id, combinedKey: key });
    expect(c.statusCode).toBe(200);

    // Tanpa kunci (atau kunci lain) tetap 409.
    await del(`classId=${fx.classC.id}&weekday=2&periodId=${periods[3]!.id}`);
    const noKey = await put({ ...at, classId: fx.classC.id });
    expect(noKey.statusCode).toBe(409);
    expect(noKey.json().error.code).toBe('teacher_busy');
    const otherKey = await put({ ...at, classId: fx.classC.id, combinedKey: NIL_KEY });
    expect(otherKey.statusCode).toBe(409);
    expect(otherKey.json().error.code).toBe('teacher_busy');

    // Jadwal guru memuat kedua sel bergabung; kunci hanya muncul pada sel bergabung.
    const byTeacher = (await call('GET', `/v1/schedule?teacherId=${fx.tFis.id}`, opCookie)).json();
    expect(byTeacher.filter((e: { combinedKey?: string }) => e.combinedKey === key)).toHaveLength(2);
    expect((await grid(fx.classA.id)).every((e: { combinedKey?: string }) => e.combinedKey === key)).toBe(
      true,
    );
  });

  it('anggota yang tidak cocok ditolak combined_mismatch', async () => {
    const fx = await fixture('D');
    const at = { weekday: 3, periodId: periods[3]!.id };
    expect(
      (await put({ ...at, classId: fx.classA.id, subjectId: fx.fis.id, combinedKey: key })).statusCode,
    ).toBe(200);
    // Mapel lain (guru lain) dengan kunci yang sama.
    const subject = await put({ ...at, classId: fx.classB.id, subjectId: fx.kim.id, combinedKey: key });
    expect(subject.statusCode).toBe(400);
    expect(subject.json().error.code).toBe('combined_mismatch');
    // Hari atau jam lain.
    const day = await put({
      classId: fx.classB.id,
      weekday: 4,
      periodId: periods[3]!.id,
      subjectId: fx.fis.id,
      combinedKey: key,
    });
    expect(day.json().error.code).toBe('combined_mismatch');
    const period = await put({
      classId: fx.classB.id,
      weekday: 3,
      periodId: periods[4]!.id,
      subjectId: fx.fis.id,
      combinedKey: key,
    });
    expect(period.json().error.code).toBe('combined_mismatch');
    // Kelas yang sama (lane lain) bukan pertemuan gabungan.
    const sameClass = await put({
      ...at,
      classId: fx.classA.id,
      subjectId: fx.fis.id,
      lane: 1,
      combinedKey: key,
    });
    expect(sameClass.json().error.code).toBe('combined_mismatch');
    // Cakupan semester berbeda dari anggota setahun penuh.
    const [sem] = await app.platformDb
      .insert(semester)
      .values({
        schoolId,
        academicYearId: yearId,
        name: `Ganjil ${randomUUID().slice(0, 4)}`,
        startsOn: '2026-07-13',
        endsOn: '2026-12-31',
      })
      .returning();
    const scope = await put({
      ...at,
      classId: fx.classB.id,
      subjectId: fx.fis.id,
      semesterId: sem!.id,
      combinedKey: key,
    });
    expect(scope.json().error.code).toBe('combined_mismatch');
    // Yang cocok tetap bisa.
    expect(
      (await put({ ...at, classId: fx.classB.id, subjectId: fx.fis.id, combinedKey: key })).statusCode,
    ).toBe(200);
  });

  it('mengganti subjek sel yang sudah bergabung ditolak, melepas kunci membuat teacher_busy kembali berlaku', async () => {
    const fx = await fixture('E');
    const at = { weekday: 5, periodId: periods[3]!.id };
    await put({ ...at, classId: fx.classA.id, subjectId: fx.fis.id, combinedKey: key });
    await put({ ...at, classId: fx.classB.id, subjectId: fx.fis.id, combinedKey: key });
    // Ganti mapel di B sambil mempertahankan kunci: tidak cocok dengan A.
    const swap = await put({ ...at, classId: fx.classB.id, subjectId: fx.kim.id, combinedKey: key });
    expect(swap.json().error.code).toBe('combined_mismatch');
    // Menulis ulang B tanpa kunci: B tetap bentrok dengan A (A masih bergabung).
    const solo = await put({ ...at, classId: fx.classB.id, subjectId: fx.fis.id });
    expect(solo.statusCode).toBe(409);
    expect(solo.json().error.code).toBe('teacher_busy');
  });

  it('kunci sekolah lain tidak dianggap anggota (isolasi tenant)', async () => {
    const fx = await fixture('F');
    const at = { weekday: 6, periodId: periods[3]!.id };
    expect(
      (await put({ ...at, classId: fx.classA.id, subjectId: fx.fis.id, combinedKey: key })).statusCode,
    ).toBe(200);

    const mkOther = async (url: string, body: object) =>
      (await call('POST', url, otherCookie, body, otherId)).json();
    const cls = await mkOther('/v1/classes', { academicYearId: otherYearId, name: 'Z1', level: '11' });
    const sub = await mkOther('/v1/subjects', { code: 'FISZ', name: 'Fisika Z' });
    const tch = await mkOther('/v1/teachers', { name: 'Guru Z' });
    await call(
      'PUT',
      `/v1/classes/${cls.id}/assignments/${sub.id}`,
      otherCookie,
      { teacherId: tch.id },
      otherId,
    );
    await call(
      'POST',
      '/v1/lesson-periods/generate',
      otherCookie,
      { firstStart: '07:00', count: 2, minutes: 40 },
      otherId,
    );
    const otherPeriod = (await call('GET', '/v1/lesson-periods', otherCookie, undefined, otherId)).json()[0];
    const res = await call(
      'PUT',
      '/v1/schedule/cell',
      otherCookie,
      { classId: cls.id, weekday: 6, periodId: otherPeriod.id, subjectId: sub.id, combinedKey: key },
      otherId,
    );
    // Tidak ada anggota yang terlihat di sekolah itu, jadi tidak ada ketidakcocokan; sel milik sekolah itu sendiri.
    expect(res.statusCode).toBe(200);
    expect((await grid(fx.classA.id)).filter((e: { classId: string }) => e.classId === cls.id)).toHaveLength(
      0,
    );
  });
});
