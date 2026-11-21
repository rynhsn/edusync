import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  examType,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
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
let foundationId = '';
let schoolId = '';
let otherId = '';
let noModuleId = '';
let semesterId = '';
let typeA = '';
let typeB = '';
let classA = '';
let adminCookie = '';
let teacherCookie = '';
let otherCookie = '';
const ids: Record<string, string> = {};
const userIds: string[] = [];

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

type Seat = { name: string };
type Layout = {
  rooms: { id: string; name: string; students: Seat[] }[];
  unassigned: Seat[];
  placed?: number;
};
/** Ringkas susunan jadi {namaRuang: [nama siswa]} supaya mudah dibandingkan. */
const byRoom = (l: Layout) => Object.fromEntries(l.rooms.map((r) => [r.name, r.students.map((s) => s.name)]));
const scope = (type = typeA) => `semesterId=${semesterId}&examTypeId=${type}`;
const getLayout = async (type = typeA) =>
  (await call('GET', `/v1/exam/room-assignments?${scope(type)}`, adminCookie)).json() as Layout;
const auto = (body: object = {}, type = typeA) =>
  call('POST', '/v1/exam/room-assignments/auto', adminCookie, {
    semesterId,
    examTypeId: type,
    ...body,
  });
const move = (moves: { studentId: string; roomId: string | null }[], cookie = adminCookie) =>
  call('PUT', '/v1/exam/room-assignments', cookie, { semesterId, examTypeId: typeA, moves });
const newRoom = async (name: string, capacity?: number) => {
  const r = await call('POST', '/v1/exam/rooms', adminCookie, { name, ...(capacity ? { capacity } : {}) });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Ruang', slug: `yrg-${run}` })
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
  const makeSchool = async (slug: string, modules: string[]) => {
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
  schoolId = await makeSchool(`ruang-${run}`, ['exams']);
  otherId = await makeSchool(`ruang-lain-${run}`, ['exams']);
  noModuleId = await makeSchool(`ruang-nomod-${run}`, ['grades']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  const [sem] = await db
    .insert(semester)
    .values({ schoolId, academicYearId: y!.id, name: 'Ganjil', startsOn: '2026-07-13', endsOn: '2026-12-19' })
    .returning();
  semesterId = sem!.id;
  const [ta, tb] = await db
    .insert(examType)
    .values([
      { schoolId, name: 'Asesmen Tengah', shortName: 'ASTS' },
      { schoolId, name: 'Asesmen Akhir', shortName: 'ASAS' },
    ])
    .returning();
  typeA = ta!.id;
  typeB = tb!.id;
  const [ka, kb] = await db
    .insert(classRoom)
    .values([
      { schoolId, academicYearId: y!.id, name: '7A', level: '7' },
      { schoolId, academicYearId: y!.id, name: '7B', level: '7' },
    ])
    .returning();
  classA = ka!.id;
  const roster: [string, string][] = [
    ['Ani', ka!.id],
    ['Budi', ka!.id],
    ['Citra', ka!.id],
    ['Dodi', kb!.id],
    ['Eka', kb!.id],
  ];
  for (const [name, classId] of roster) {
    const [st] = await db.insert(student).values({ schoolId, name, gender: 'L' }).returning();
    ids[name] = st!.id;
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: y!.id });
  }
  // Siswa nonaktif tidak boleh menjadi kandidat.
  const [gone] = await db
    .insert(student)
    .values({ schoolId, name: 'Fani', gender: 'P', status: 'transferred' })
    .returning();
  await db
    .insert(enrollment)
    .values({ schoolId, studentId: gone!.id, classId: ka!.id, academicYearId: y!.id });

  adminCookie = await join('admin-ruang', schoolId, ['school_admin']);
  teacherCookie = await join('guru-ruang', schoolId, ['teacher']);
  otherCookie = await join('admin-ruang-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId, noModuleId]) {
    for (const table of [
      'audit_log',
      'exam_room_assignment',
      'exam_room',
      'enrollment',
      'student',
      'exam_type',
      'semester',
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

describe('ruang ujian', () => {
  it('modul `exams` wajib; sesi wajib', async () => {
    const cookie = await join('admin-nomod-ruang', noModuleId, ['school_admin']);
    const res = await call('GET', '/v1/exam/rooms', cookie, undefined, noModuleId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/exam/rooms')).statusCode).toBe(401);
  });

  it('tambah, ubah, hapus; nama ganda 409; kapasitas divalidasi', async () => {
    expect((await call('GET', '/v1/exam/rooms', adminCookie)).json()).toEqual([]);
    const made = await call('POST', '/v1/exam/rooms', adminCookie, { name: ' Ruang 01 ', capacity: 30 });
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json()).toMatchObject({ name: 'Ruang 01', capacity: 30, active: true });
    const noCap = await call('POST', '/v1/exam/rooms', adminCookie, { name: 'Ruang 02' });
    expect(noCap.json().capacity).toBeNull();

    expect((await call('POST', '/v1/exam/rooms', adminCookie, { name: 'Ruang 01' })).statusCode).toBe(409);
    for (const capacity of [0, -1, 501, 1.5]) {
      expect((await call('POST', '/v1/exam/rooms', adminCookie, { name: 'X', capacity })).statusCode).toBe(
        400,
      );
    }
    expect((await call('POST', '/v1/exam/rooms', adminCookie, { name: '   ' })).statusCode).toBe(400);

    const upd = await call('PUT', `/v1/exam/rooms/${made.json().id}`, adminCookie, {
      name: 'Lab Komputer',
      capacity: 20,
    });
    expect(upd.json()).toMatchObject({ name: 'Lab Komputer', capacity: 20 });
    // Nama bentrok saat mengubah.
    const clash = await call('PUT', `/v1/exam/rooms/${noCap.json().id}`, adminCookie, {
      name: 'Lab Komputer',
    });
    expect(clash.statusCode).toBe(409);

    expect((await call('DELETE', `/v1/exam/rooms/${made.json().id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/exam/rooms/${made.json().id}`, adminCookie)).statusCode).toBe(404);
    expect(
      (await call('PUT', `/v1/exam/rooms/${made.json().id}`, adminCookie, { name: 'Z' })).statusCode,
    ).toBe(404);
    await call('DELETE', `/v1/exam/rooms/${noCap.json().id}`, adminCookie);
  });
});

describe('penempatan ruang', () => {
  let r1 = '';
  let r2 = '';
  let r3 = '';

  it('penempatan otomatis mengisi ruang berurutan menurut kapasitas', async () => {
    r1 = await newRoom('Ruang 01', 2);
    r2 = await newRoom('Ruang 02', 2);
    r3 = await newRoom('Ruang 03', 2);
    // Sebelum penempatan: semua kandidat aktif belum berruang (Fani nonaktif tidak ikut).
    const before = await getLayout();
    expect(before.unassigned.map((s) => s.name)).toEqual(['Ani', 'Budi', 'Citra', 'Dodi', 'Eka']);

    const res = await auto();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().placed).toBe(5);
    expect(byRoom(res.json())).toEqual({
      'Ruang 01': ['Ani', 'Budi'],
      'Ruang 02': ['Citra', 'Dodi'],
      'Ruang 03': ['Eka'],
    });
    expect(res.json().unassigned).toEqual([]);
    // Jenis ujian lain tidak terpengaruh.
    expect((await getLayout(typeB)).unassigned).toHaveLength(5);
  });

  it('data kartu peserta memuat nama ruang; kosong bila belum ditempatkan atau tanpa jenis ujian', async () => {
    const res = await call(
      'GET',
      `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classA}&examTypeId=${typeA}`,
      adminCookie,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().items.map((i: { name: string; room: string }) => [i.name, i.room])).toEqual([
      ['Ani', 'Ruang 01'],
      ['Budi', 'Ruang 01'],
      ['Citra', 'Ruang 02'],
    ]);
    const typeBRes = await call(
      'GET',
      `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classA}&examTypeId=${typeB}`,
      adminCookie,
    );
    expect(typeBRes.json().items.every((i: { room: string }) => i.room === '')).toBe(true);
    const noType = await call(
      'GET',
      `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classA}`,
      adminCookie,
    );
    expect(noType.json().items.every((i: { room: string }) => i.room === '')).toBe(true);
  });

  it('pindah manual menghormati kapasitas dan bisa melepas siswa', async () => {
    const full = await move([{ studentId: ids.Eka!, roomId: r1 }]);
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('room_full');
    expect(full.json().error.message).toContain('Ruang 01');
    expect(byRoom(await getLayout())['Ruang 03']).toEqual(['Eka']);

    // Tukar dalam satu permintaan: hasil akhir tidak melebihi kapasitas.
    const swap = await move([
      { studentId: ids.Eka!, roomId: r1 },
      { studentId: ids.Ani!, roomId: r3 },
    ]);
    expect(swap.statusCode, swap.body).toBe(200);
    expect(byRoom(swap.json())).toMatchObject({ 'Ruang 01': ['Budi', 'Eka'], 'Ruang 03': ['Ani'] });

    // Idempoten dan lepas ruang.
    expect((await move([{ studentId: ids.Ani!, roomId: r3 }])).statusCode).toBe(200);
    const un = await move([{ studentId: ids.Ani!, roomId: null }]);
    expect(un.json().unassigned.map((s: Seat) => s.name)).toEqual(['Ani']);

    // Rujukan tidak dikenal.
    expect((await move([{ studentId: ids.Ani!, roomId: crypto.randomUUID() }])).statusCode).toBe(400);
    expect((await move([{ studentId: crypto.randomUUID(), roomId: r1 }])).json().error.code).toBe(
      'invalid_reference',
    );
  });

  it('overwrite=false menjaga penempatan manual; overwrite=true membagi ulang', async () => {
    // Susunan: R1 [Budi, Eka], R2 [Citra, Dodi], R3 [], Ani belum berruang.
    const keep = await auto({ overwrite: false });
    expect(keep.statusCode, keep.body).toBe(200);
    expect(keep.json().placed).toBe(1);
    expect(byRoom(keep.json())).toMatchObject({
      'Ruang 01': ['Budi', 'Eka'],
      'Ruang 02': ['Citra', 'Dodi'],
      'Ruang 03': ['Ani'],
    });
    expect((await auto({ overwrite: false })).json().placed).toBe(0);

    const redo = await auto({ overwrite: true });
    expect(redo.json().placed).toBe(5);
    expect(byRoom(redo.json())).toEqual({
      'Ruang 01': ['Ani', 'Budi'],
      'Ruang 02': ['Citra', 'Dodi'],
      'Ruang 03': ['Eka'],
    });
  });

  it('cakupan kelas dan ruang dibatasi; ruang tanpa kapasitas ditolak', async () => {
    await call('DELETE', `/v1/exam/room-assignments?${scope(typeB)}`, adminCookie);
    const only = await auto({ classIds: [classA], roomIds: [r2, r3] }, typeB);
    expect(only.statusCode, only.body).toBe(200);
    expect(byRoom(only.json())).toMatchObject({ 'Ruang 02': ['Ani', 'Budi'], 'Ruang 03': ['Citra'] });
    expect(only.json().unassigned.map((s: Seat) => s.name)).toEqual(['Dodi', 'Eka']);

    const r4 = await newRoom('Ruang 04');
    const noCap = await auto({}, typeB);
    expect(noCap.statusCode).toBe(400);
    expect(noCap.json().error.code).toBe('capacity_required');
    expect(noCap.json().error.message).toContain('Ruang 04');
    expect((await auto({ classIds: [crypto.randomUUID()] }, typeB)).statusCode).toBe(400);
    await call('DELETE', `/v1/exam/rooms/${r4}`, adminCookie);
  });

  it('kapasitas kurang: 409 rooms_full dan tidak ada yang berubah (juga dengan overwrite)', async () => {
    const before = byRoom(await getLayout());
    const res = await auto({ roomIds: [r1], overwrite: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('rooms_full');
    expect(res.json().error.message).toMatch(/5.*2/);
    expect(byRoom(await getLayout())).toEqual(before);
  });

  it('kosongkan penempatan', async () => {
    const res = await call('DELETE', `/v1/exam/room-assignments?${scope()}`, adminCookie);
    expect(res.json()).toEqual({ removed: 5 });
    expect((await getLayout()).unassigned).toHaveLength(5);
  });

  it('menghapus ruang melepas siswanya', async () => {
    await auto();
    expect((await call('DELETE', `/v1/exam/rooms/${r3}`, adminCookie)).statusCode).toBe(200);
    expect((await getLayout()).unassigned.map((s) => s.name)).toEqual(['Eka']);
  });
});

describe('izin dan isolasi sekolah', () => {
  it('guru (exam:read) boleh membaca tetapi tidak mengubah', async () => {
    expect((await call('GET', '/v1/exam/rooms', teacherCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/exam/room-assignments?${scope()}`, teacherCookie)).statusCode).toBe(200);
    expect((await call('POST', '/v1/exam/rooms', teacherCookie, { name: 'Terlarang' })).statusCode).toBe(403);
    expect((await move([{ studentId: ids.Ani!, roomId: null }], teacherCookie)).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/exam/room-assignments/auto', teacherCookie, { semesterId, examTypeId: typeA }))
        .statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/exam/room-assignments?${scope()}`, teacherCookie)).statusCode).toBe(
      403,
    );
  });

  it('sekolah lain tidak melihat atau memakai data ruang', async () => {
    const rooms = (await call('GET', '/v1/exam/rooms', adminCookie)).json();
    expect(rooms.length).toBeGreaterThan(0);
    expect((await call('GET', '/v1/exam/rooms', otherCookie, undefined, otherId)).json()).toEqual([]);
    expect(
      (await call('PUT', `/v1/exam/rooms/${rooms[0].id}`, otherCookie, { name: 'Curian' }, otherId))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/v1/exam/rooms/${rooms[0].id}`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);

    const url = `/v1/exam/room-assignments?${scope()}`;
    const read = await call('GET', url, otherCookie, undefined, otherId);
    expect(read.statusCode).toBe(400);
    expect(read.json().error.code).toBe('invalid_reference');
    const put = await call(
      'PUT',
      '/v1/exam/room-assignments',
      otherCookie,
      { semesterId, examTypeId: typeA, moves: [{ studentId: ids.Ani!, roomId: rooms[0].id }] },
      otherId,
    );
    expect(put.statusCode).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/v1/exam/room-assignments/auto',
          otherCookie,
          { semesterId, examTypeId: typeA },
          otherId,
        )
      ).statusCode,
    ).toBe(400);
    expect((await call('DELETE', url, otherCookie, undefined, otherId)).statusCode).toBe(400);
  });
});
