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
let foundationId = '';
let yearId = '';
let ganjilId = '';
let genapId = '';
let foreignSemesterId = '';
const userIds: string[] = [];
let opCookie = '';
let adminCookie = '';

// Satu kelas A dan B, tiga mapel, tiga guru. Guru 1 mengampu mapel 1 di kelas A dan B (untuk uji bentrok).
const fx = {
  kelasA: { id: '', name: '' },
  kelasB: { id: '', name: '' },
  s1: { id: '', name: '' },
  s2: { id: '', name: '' },
  s3: { id: '', name: '' },
  p: [] as { id: string; number: number }[],
};

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

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

/** Isi sel jadwal; `sem` kosong = setahun penuh. */
const put = (classId: string, subjectId: string, periodIdx: number, weekday: number, sem?: string) =>
  call('PUT', '/v1/schedule/cell', opCookie, {
    classId,
    weekday,
    periodId: fx.p[periodIdx]!.id,
    subjectId,
    ...(sem ? { semesterId: sem } : {}),
  });
const del = (classId: string, periodIdx: number, weekday: number, sem?: string) =>
  call(
    'DELETE',
    `/v1/schedule/cell?classId=${classId}&weekday=${weekday}&periodId=${fx.p[periodIdx]!.id}${sem ? `&semesterId=${sem}` : ''}`,
    opCookie,
  );
type Entry = { weekday: number; periodId: string; subjectName: string; semesterId: string | null };
const grid = async (classId: string, sem?: string) =>
  (
    await call('GET', `/v1/schedule?classId=${classId}${sem ? `&semesterId=${sem}` : ''}`, opCookie)
  ).json() as Entry[];
const at = (entries: Entry[], weekday: number, periodIdx: number) =>
  entries.filter((e) => e.weekday === weekday && e.periodId === fx.p[periodIdx]!.id);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Jadwal Semester', slug: `yjs-${run}` })
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
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug: `jds-${run}`, name: `jds-${run}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  for (const moduleKey of ['schedule', 'attendance']) {
    await db
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  }
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  const [g] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-31',
    })
    .returning();
  const [n] = await db
    .insert(semester)
    .values({ schoolId, academicYearId: yearId, name: 'Genap', startsOn: '2027-01-01', endsOn: '2027-06-30' })
    .returning();
  ganjilId = g!.id;
  genapId = n!.id;
  // Semester milik tahun ajaran lain (tidak aktif): tidak boleh dipakai untuk kelas tahun ini.
  const [y2] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2025/2026', startsOn: '2025-07-14', endsOn: '2026-06-30', isActive: false })
    .returning();
  const [fs] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: y2!.id,
      name: 'Ganjil',
      startsOn: '2025-07-14',
      endsOn: '2025-12-31',
    })
    .returning();
  foreignSemesterId = fs!.id;

  opCookie = await join('operator-jdw-sem', schoolId, ['operator']);
  adminCookie = await join('admin-jdw-sem', schoolId, ['school_admin']);

  const mk = async (url: string, body: object) => (await call('POST', url, opCookie, body)).json();
  fx.kelasA = await mk('/v1/classes', { academicYearId: yearId, name: `7A-${run}`, level: '7' });
  fx.kelasB = await mk('/v1/classes', { academicYearId: yearId, name: `7B-${run}`, level: '7' });
  fx.s1 = await mk('/v1/subjects', { code: `M1${run}`, name: `Matematika ${run}` });
  fx.s2 = await mk('/v1/subjects', { code: `M2${run}`, name: `Fisika ${run}` });
  fx.s3 = await mk('/v1/subjects', { code: `M3${run}`, name: `Kimia ${run}` });
  const t1 = await mk('/v1/teachers', { name: `Guru Satu ${run}` });
  const t2 = await mk('/v1/teachers', { name: `Guru Dua ${run}` });
  const t3 = await mk('/v1/teachers', { name: `Guru Tiga ${run}` });
  const assign = (classId: string, subjectId: string, teacherId: string) =>
    call('PUT', `/v1/classes/${classId}/assignments/${subjectId}`, opCookie, { teacherId });
  await assign(fx.kelasA.id, fx.s1.id, t1.id);
  await assign(fx.kelasA.id, fx.s2.id, t2.id);
  await assign(fx.kelasA.id, fx.s3.id, t3.id);
  await assign(fx.kelasB.id, fx.s1.id, t1.id);
  await call('POST', '/v1/lesson-periods/generate', opCookie, { firstStart: '07:00', count: 3, minutes: 40 });
  fx.p = (await call('GET', '/v1/lesson-periods', opCookie)).json();
});

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'schedule_entry',
    'teaching_assignment',
    'lesson_period',
    'enrollment',
    'student',
    'teacher',
    'subject',
    'class_room',
    'semester',
    'academic_year',
    'member',
    'role',
    'entitlement',
  ]) {
    await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('jadwal per semester', () => {
  it('tanpa semesterId perilaku lama tetap: sel setahun penuh, terlihat di semua semester', async () => {
    const res = await put(fx.kelasA.id, fx.s1.id, 0, 1);
    expect(res.statusCode).toBe(200);
    expect(res.json().semesterId).toBeNull();

    const year = await grid(fx.kelasA.id);
    expect(at(year, 1, 0)).toHaveLength(1);
    expect(at(year, 1, 0)[0]!.semesterId).toBeNull();
    // Jadwal efektif semester memuat sel setahun penuh.
    expect(at(await grid(fx.kelasA.id, ganjilId), 1, 0)).toHaveLength(1);
    expect(at(await grid(fx.kelasA.id, genapId), 1, 0)).toHaveLength(1);
  });

  it('Ganjil dan Genap boleh beda mapel di slot yang sama, tidak bocor ke jadwal setahun', async () => {
    const g = await put(fx.kelasA.id, fx.s1.id, 0, 2, ganjilId);
    expect(g.statusCode).toBe(200);
    expect(g.json().semesterId).toBe(ganjilId);
    const n = await put(fx.kelasA.id, fx.s2.id, 0, 2, genapId);
    expect(n.statusCode).toBe(200);
    expect(n.json().id).not.toBe(g.json().id);

    expect(at(await grid(fx.kelasA.id), 2, 0)).toHaveLength(0);
    expect(at(await grid(fx.kelasA.id, ganjilId), 2, 0).map((e) => e.subjectName)).toEqual([fx.s1.name]);
    expect(at(await grid(fx.kelasA.id, genapId), 2, 0).map((e) => e.subjectName)).toEqual([fx.s2.name]);

    // Cakupan yang sama menimpa isi (id tetap).
    const again = await put(fx.kelasA.id, fx.s3.id, 0, 2, ganjilId);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(g.json().id);
    expect(at(await grid(fx.kelasA.id, ganjilId), 2, 0).map((e) => e.subjectName)).toEqual([fx.s3.name]);
  });

  it('bentrok cakupan di slot kelas yang sama ditolak ke dua arah', async () => {
    // Setahun penuh dulu, lalu semester: ditolak.
    expect((await put(fx.kelasA.id, fx.s1.id, 0, 3)).statusCode).toBe(200);
    const sem = await put(fx.kelasA.id, fx.s2.id, 0, 3, ganjilId);
    expect(sem.statusCode).toBe(409);
    expect(sem.json().error.code).toBe('schedule_scope_conflict');

    // Semester dulu, lalu setahun penuh: ditolak.
    expect((await put(fx.kelasA.id, fx.s2.id, 1, 3, genapId)).statusCode).toBe(200);
    const year = await put(fx.kelasA.id, fx.s1.id, 1, 3);
    expect(year.statusCode).toBe(409);
    expect(year.json().error.code).toBe('schedule_scope_conflict');
    // Isi setahun penuh yang ada tidak berubah.
    expect(at(await grid(fx.kelasA.id), 3, 0)[0]!.subjectName).toBe(fx.s1.name);
  });

  it('teacher_busy menghormati irisan cakupan', async () => {
    // Guru 1 mengajar kelas A di Ganjil, hari 4 jam 1.
    expect((await put(fx.kelasA.id, fx.s1.id, 0, 4, ganjilId)).statusCode).toBe(200);
    const yearBusy = await put(fx.kelasB.id, fx.s1.id, 0, 4);
    expect(yearBusy.statusCode).toBe(409);
    expect(yearBusy.json().error.code).toBe('teacher_busy');
    const sameSem = await put(fx.kelasB.id, fx.s1.id, 0, 4, ganjilId);
    expect(sameSem.statusCode).toBe(409);
    expect(sameSem.json().error.code).toBe('teacher_busy');
    // Semester lain tidak beririsan.
    expect((await put(fx.kelasB.id, fx.s1.id, 0, 4, genapId)).statusCode).toBe(200);

    // Sel setahun penuh milik guru yang sama bentrok dengan semester mana pun.
    expect((await put(fx.kelasA.id, fx.s1.id, 0, 5)).statusCode).toBe(200);
    const semBusy = await put(fx.kelasB.id, fx.s1.id, 0, 5, ganjilId);
    expect(semBusy.statusCode).toBe(409);
    expect(semBusy.json().error.code).toBe('teacher_busy');
  });

  it('DELETE hanya menghapus sel pada cakupan yang persis sama', async () => {
    expect((await put(fx.kelasA.id, fx.s1.id, 2, 6, ganjilId)).statusCode).toBe(200);
    expect((await del(fx.kelasA.id, 2, 6, genapId)).statusCode).toBe(404);
    // Tanpa semesterId = setahun penuh: tidak ada sel di cakupan itu.
    expect((await del(fx.kelasA.id, 2, 6)).statusCode).toBe(404);
    expect(at(await grid(fx.kelasA.id, ganjilId), 6, 2)).toHaveLength(1);
    expect((await del(fx.kelasA.id, 2, 6, ganjilId)).statusCode).toBe(200);
    expect(at(await grid(fx.kelasA.id, ganjilId), 6, 2)).toHaveLength(0);
    // Sel setahun penuh tidak ikut terhapus oleh penghapusan semester dan sebaliknya.
    expect((await del(fx.kelasA.id, 0, 1, ganjilId)).statusCode).toBe(404);
    expect(at(await grid(fx.kelasA.id), 1, 0)).toHaveLength(1);
  });

  it('semester milik tahun ajaran lain ditolak (invalid_reference)', async () => {
    const res = await put(fx.kelasA.id, fx.s1.id, 2, 1, foreignSemesterId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
    expect((await del(fx.kelasA.id, 2, 1, foreignSemesterId)).statusCode).toBe(400);
  });

  it('daftar jam pelajaran satu tanggal hanya memuat sel yang berlaku pada tanggal itu', async () => {
    // Hari Senin (1): jam 1 setahun penuh (S1, dari uji pertama); jam 2 beda per semester; jam 3 kosong.
    expect((await put(fx.kelasA.id, fx.s2.id, 1, 1, ganjilId)).statusCode).toBe(200);
    expect((await put(fx.kelasA.id, fx.s3.id, 1, 1, genapId)).statusCode).toBe(200);

    const lessonsOn = async (date: string) => {
      const res = await call('GET', `/v1/lessons?date=${date}`, adminCookie);
      expect(res.statusCode).toBe(200);
      return (res.json().lessons as { className: string; periodNumber: number; subjectName: string }[])
        .filter((l) => l.className === fx.kelasA.name)
        .map((l) => `${l.periodNumber}:${l.subjectName}`)
        .sort();
    };
    // 2026-09-07 Senin di Ganjil; 2027-01-04 Senin di Genap; 2027-08-02 Senin di luar semester mana pun.
    expect(await lessonsOn('2026-09-07')).toEqual([`1:${fx.s1.name}`, `2:${fx.s2.name}`]);
    expect(await lessonsOn('2027-01-04')).toEqual([`1:${fx.s1.name}`, `2:${fx.s3.name}`]);
    expect(await lessonsOn('2027-08-02')).toEqual([`1:${fx.s1.name}`]);

    // Mengisi absensi sel Genap pada tanggal Ganjil ditolak (hari sama, tetapi semester tidak berlaku).
    const genapEntry = (await grid(fx.kelasA.id, genapId)).find(
      (e) => e.weekday === 1 && e.periodId === fx.p[1]!.id,
    ) as Entry & { id: string };
    const res = await call('PUT', '/v1/lesson-attendance', adminCookie, {
      scheduleEntryId: genapEntry.id,
      date: '2026-09-07',
      records: [{ studentId: '00000000-0000-4000-8000-000000000001', status: 'present' }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_date');
  });
});
