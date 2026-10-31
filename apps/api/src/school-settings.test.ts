import {
  academicYear,
  assignRoles,
  currentTimezone,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  user,
  withTenant,
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
let otherId = '';
let foundationId = '';
let yearId = '';
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';
let otherCookie = '';

async function join(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
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

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Pengaturan', slug: `yps-${run}` })
    .returning();
  foundationId = f!.id;
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    return s!.id;
  };
  schoolId = await make(`ps-${run}`);
  otherId = await make(`ps-lain-${run}`);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2001', startsOn: '2000-07-01', endsOn: '2001-06-30' })
    .returning();
  yearId = y!.id;
  adminCookie = await join('adm', schoolId, ['school_admin']);
  teacherCookie = await join('guru', schoolId, ['teacher']);
  otherCookie = await join('lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'class_room',
      'semester',
      'academic_year',
      'school_level',
      'school_setting',
      'member',
      'role',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const valid = {
  timezone: 'Asia/Makassar',
  workingDays: [1, 2, 3, 4, 5],
  semesterNames: ['Catur Wulan 1', 'Catur Wulan 2', 'Catur Wulan 3'],
  lessonDefaultStart: '07:30',
  lessonDefaultMinutes: 45,
};

describe('pengaturan sekolah', () => {
  it('sekolah baru mendapat nilai bawaan tanpa membuat baris', async () => {
    const res = await call('GET', '/v1/school/settings', adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      timezone: 'Asia/Jakarta',
      workingDays: [1, 2, 3, 4, 5, 6],
      semesterNames: ['Ganjil', 'Genap'],
      lessonDefaultStart: '07:00',
      lessonDefaultMinutes: 40,
    });
    const rows = await app.platformDb.execute(
      sql`select 1 from school_setting where school_id = ${schoolId}`,
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('anggota biasa boleh membaca, hanya school:manage yang menyimpan', async () => {
    expect((await call('GET', '/v1/school/settings', teacherCookie)).statusCode).toBe(200);
    expect((await call('PUT', '/v1/school/settings', teacherCookie, valid)).statusCode).toBe(403);
    expect((await call('GET', '/v1/school/settings', adminCookie, undefined, otherId)).statusCode).toBe(403);
  });

  it('validasi masukan', async () => {
    const put = (patch: object) => call('PUT', '/v1/school/settings', adminCookie, { ...valid, ...patch });
    expect((await put({ timezone: 'Mars/Olympus' })).statusCode).toBe(400);
    expect((await put({ workingDays: [] })).statusCode).toBe(400);
    expect((await put({ workingDays: [1, 1] })).statusCode).toBe(400);
    expect((await put({ workingDays: [0, 8] })).statusCode).toBe(400);
    expect((await put({ semesterNames: [] })).statusCode).toBe(400);
    expect((await put({ semesterNames: ['A', 'B', 'C', 'D', 'E'] })).statusCode).toBe(400);
    expect((await put({ semesterNames: ['Ganjil', 'ganjil'] })).statusCode).toBe(400);
    expect((await put({ lessonDefaultStart: '7:00' })).statusCode).toBe(400);
    expect((await put({ lessonDefaultMinutes: 5 })).statusCode).toBe(400);
  });

  it('menyimpan, mengganti zona waktu sekolah, dan tidak menyentuh sekolah lain', async () => {
    const res = await call('PUT', '/v1/school/settings', adminCookie, valid);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(valid);
    expect((await call('GET', '/v1/school/settings', teacherCookie)).json()).toEqual(valid);
    // Zona waktu terbaca di konteks tenant (dasar "hari ini" di seluruh API) dan muncul di /v1/me.
    expect(await withTenant(app.tenantDb, [schoolId], async () => currentTimezone())).toBe('Asia/Makassar');
    expect(await withTenant(app.tenantDb, [otherId], async () => currentTimezone())).toBe('Asia/Jakarta');
    const me = (
      await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: adminCookie, origin } })
    ).json();
    expect(me.memberships[0].timezone).toBe('Asia/Makassar');
    expect((await call('GET', '/v1/school/settings', otherCookie, undefined, otherId)).json().timezone).toBe(
      'Asia/Jakarta',
    );
    // Simpan ulang (upsert) memperbarui, bukan menggandakan.
    expect(
      (await call('PUT', '/v1/school/settings', adminCookie, { ...valid, workingDays: [6, 1] })).json()
        .workingDays,
    ).toEqual([1, 6]);
    const rows = await app.platformDb.execute(
      sql`select 1 from school_setting where school_id = ${schoolId}`,
    );
    expect(rows.rows).toHaveLength(1);
    await call('PUT', '/v1/school/settings', adminCookie, valid);
  });

  it('semester bawaan memakai nama dari pengaturan dan menutup seluruh tahun ajaran', async () => {
    const res = await call('POST', `/v1/academic-years/${yearId}/semesters/default`, adminCookie);
    expect(res.statusCode).toBe(201);
    const list = res.json() as { name: string; startsOn: string; endsOn: string }[];
    expect(list.map((s) => s.name)).toEqual(valid.semesterNames);
    expect(list[0]!.startsOn).toBe('2000-07-01');
    expect(list[2]!.endsOn).toBe('2001-06-30');
    // Berurutan tanpa celah dan tanpa tumpang tindih.
    for (let i = 1; i < list.length; i++) {
      const prev = new Date(`${list[i - 1]!.endsOn}T00:00:00Z`).getTime() + 86_400_000;
      expect(new Date(`${list[i]!.startsOn}T00:00:00Z`).getTime()).toBe(prev);
    }
  });

  it('kalender memakai hari efektif sekolah bila daysPerWeek tidak diberikan', async () => {
    const total = async (query = '') =>
      (await call('GET', `/v1/academic-years/${yearId}/calendar${query}`, adminCookie)).json().days;
    const school5 = await total(); // sekolah menyimpan Senin-Jumat
    expect(school5.workdays).toBe((await total('?daysPerWeek=5')).workdays);
    await call('PUT', '/v1/school/settings', adminCookie, { ...valid, workingDays: [1, 2, 3, 4, 5, 6] });
    const school6 = await total();
    expect(school6.workdays).toBe((await total('?daysPerWeek=6')).workdays);
    expect(school6.workdays).toBeGreaterThan(school5.workdays);
    await call('PUT', '/v1/school/settings', adminCookie, { ...valid, workingDays: [2, 4] });
    expect((await total()).workdays).toBeLessThan(school5.workdays);
    await call('PUT', '/v1/school/settings', adminCookie, valid);
  });
});

describe('tingkat kelas', () => {
  const create = (body: object, cookie = adminCookie, sid = schoolId) =>
    call('POST', '/v1/school/levels', cookie, body, sid);
  let level7 = '';
  let level8 = '';

  it('daftar awal kosong dan kelas boleh bertingkat teks bebas', async () => {
    expect((await call('GET', '/v1/school/levels', teacherCookie)).json()).toEqual([]);
    const free = await call('POST', '/v1/classes', adminCookie, {
      academicYearId: yearId,
      name: 'Bebas',
      level: 'Kelas Apa Saja',
    });
    expect(free.statusCode).toBe(201);
    await call('DELETE', `/v1/classes/${free.json().id}`, adminCookie);
  });

  it('hanya school:manage yang menulis; urutan otomatis; kode unik', async () => {
    expect((await create({ code: '7', label: 'Kelas 7' }, teacherCookie)).statusCode).toBe(403);
    const a = await create({ code: '7', label: 'Kelas 7' });
    const b = await create({ code: '8', label: 'Kelas 8' });
    expect(a.statusCode).toBe(201);
    expect(b.json().sort).toBeGreaterThan(a.json().sort);
    level7 = a.json().id;
    level8 = b.json().id;
    const dup = await create({ code: '7', label: 'Lagi' });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('conflict');
    expect((await create({ code: 'a b', label: 'Spasi' })).statusCode).toBe(400);
    expect(
      (await call('GET', '/v1/school/levels', teacherCookie)).json().map((l: { code: string }) => l.code),
    ).toEqual(['7', '8']);
    expect((await call('GET', '/v1/school/levels', otherCookie, undefined, otherId)).json()).toEqual([]);
  });

  it('mengubah nama dan urutan; kode tetap', async () => {
    const res = await call('PUT', `/v1/school/levels/${level7}`, adminCookie, { label: 'Tujuh', sort: 99 });
    expect(res.json()).toMatchObject({ code: '7', label: 'Tujuh', sort: 99 });
    const order = (await call('GET', '/v1/school/levels', adminCookie))
      .json()
      .map((l: { code: string }) => l.code);
    expect(order).toEqual(['8', '7']);
    expect(
      (await call('PUT', `/v1/school/levels/${crypto.randomUUID()}`, adminCookie, { label: 'X', sort: 1 }))
        .statusCode,
    ).toBe(404);
  });

  it('kelas dan tarif divalidasi terhadap daftar bila terisi', async () => {
    const bad = await call('POST', '/v1/classes', adminCookie, {
      academicYearId: yearId,
      name: '9A',
      level: '9',
    });
    expect(bad.statusCode).toBe(400);
    expect(code(bad)).toBe('invalid_level');
    const good = await call('POST', '/v1/classes', adminCookie, {
      academicYearId: yearId,
      name: '7A',
      level: '7',
    });
    expect(good.statusCode).toBe(201);
    const upd = await call('PUT', `/v1/classes/${good.json().id}`, adminCookie, { name: '7A', level: '5' });
    expect(code(upd)).toBe('invalid_level');
  });

  it('hapus ditolak selagi dipakai kelas, lolos bila bebas', async () => {
    const used = await call('DELETE', `/v1/school/levels/${level7}`, adminCookie);
    expect(used.statusCode).toBe(409);
    expect(code(used)).toBe('in_use');
    expect((await call('DELETE', `/v1/school/levels/${level8}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/school/levels/${level8}`, adminCookie)).statusCode).toBe(404);
  });

  it('isi bawaan menurut jenjang melewati kode yang sudah ada', async () => {
    const res = await call('POST', '/v1/school/levels/defaults', adminCookie, { stage: 'smp' });
    expect(res.statusCode).toBe(200);
    const codes = res.json().map((l: { code: string }) => l.code);
    expect(codes.sort()).toEqual(['7', '8', '9']);
    const again = await call('POST', '/v1/school/levels/defaults', adminCookie, { stage: 'smp' });
    expect(again.json()).toHaveLength(3);
    expect((await call('POST', '/v1/school/levels/defaults', adminCookie, { stage: 'tk' })).statusCode).toBe(
      400,
    );
  });
});
