import {
  academicYear,
  assignRoles,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
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
let otherSchoolId = '';
let foundationId = '';
let yearId = '';
let otherYearId = '';
const userIds: string[] = [];
let opCookie = '';
let teacherCookie = '';
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

async function member_(label: string, sid: string, roles: string[]) {
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
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Master', slug: `ym-${run}` })
    .returning();
  foundationId = f!.id;
  const ids: string[] = [];
  const years: string[] = [];
  for (const slug of [`mst-${run}`, `mst2-${run}`]) {
    const [s] = await app.platformDb.insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(app.platformDb, s!.id);
    const [y] = await app.platformDb
      .insert(academicYear)
      .values({
        schoolId: s!.id,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    ids.push(s!.id);
    years.push(y!.id);
  }
  [schoolId, otherSchoolId] = ids as [string, string];
  [yearId, otherYearId] = years as [string, string];
  opCookie = await member_('operator-master', schoolId, ['operator']);
  teacherCookie = await member_('guru-master', schoolId, ['teacher']);
  otherCookie = await member_('operator-lain', otherSchoolId, ['operator']);
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'teaching_assignment',
      'enrollment',
      'student',
      'teacher',
      'subject',
      'class_room',
      'program',
      'academic_year',
      'member',
      'role',
    ]) {
      await app.platformDb.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await app.platformDb.delete(school).where(eq(school.id, sid));
  }
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('izin master data', () => {
  it('guru boleh membaca, tidak boleh mengubah; tanpa login ditolak', async () => {
    expect((await call('GET', '/v1/classes', teacherCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/students', teacherCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/subjects', teacherCookie)).statusCode).toBe(200);
    // Daftar guru hanya untuk pemegang teacher:read; guru biasa tidak.
    expect((await call('GET', '/v1/teachers', teacherCookie)).statusCode).toBe(403);
    for (const [url, body] of [
      ['/v1/classes', { academicYearId: yearId, name: 'X', level: '7' }],
      ['/v1/students', { name: 'Siswa', gender: 'L' }],
      ['/v1/subjects', { code: 'MTK', name: 'Matematika' }],
      ['/v1/teachers', { name: 'Guru' }],
    ] as const) {
      expect((await call('POST', url, teacherCookie, body)).statusCode, url).toBe(403);
    }
    expect((await app.inject('/v1/students')).statusCode).toBe(401);
  });
});

describe('kelas, jurusan, dan mapel', () => {
  it('membuat, mengubah, menolak duplikat, dan menolak menghapus yang masih dipakai', async () => {
    const prog = await call('POST', '/v1/programs', opCookie, {
      code: 'TKJ',
      name: 'Teknik Komputer dan Jaringan',
    });
    expect(prog.statusCode).toBe(201);
    expect((await call('POST', '/v1/programs', opCookie, { code: 'TKJ', name: 'Lain' })).statusCode).toBe(
      409,
    );

    const cls = await call('POST', '/v1/classes', opCookie, {
      academicYearId: yearId,
      programId: prog.json().id,
      name: 'X TKJ 1',
      level: 'X',
    });
    expect(cls.statusCode).toBe(201);
    expect(cls.json()).toMatchObject({
      name: 'X TKJ 1',
      programName: 'Teknik Komputer dan Jaringan',
      studentCount: 0,
    });
    const dup = await call('POST', '/v1/classes', opCookie, {
      academicYearId: yearId,
      name: 'X TKJ 1',
      level: 'X',
    });
    expect(dup.statusCode).toBe(409);

    const upd = await call('PUT', `/v1/classes/${cls.json().id}`, opCookie, {
      name: 'X TKJ A',
      level: 'X',
      programId: null,
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'X TKJ A', programId: null, programName: null });

    // Jurusan yang dipakai kelas tidak bisa dihapus; setelah kelas melepasnya bisa.
    const cls2 = await call('POST', '/v1/classes', opCookie, {
      academicYearId: yearId,
      programId: prog.json().id,
      name: 'XI TKJ 1',
      level: 'XI',
    });
    expect((await call('DELETE', `/v1/programs/${prog.json().id}`, opCookie)).statusCode).toBe(409);
    expect((await call('DELETE', `/v1/classes/${cls2.json().id}`, opCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/programs/${prog.json().id}`, opCookie)).statusCode).toBe(200);

    const list = (await call('GET', `/v1/classes?academicYearId=${yearId}`, opCookie)).json();
    expect(list.map((c: { name: string }) => c.name)).toEqual(['X TKJ A']);
  });

  it('tahun ajaran atau jurusan sekolah lain ditolak', async () => {
    const res = await call('POST', '/v1/classes', opCookie, {
      academicYearId: otherYearId,
      name: 'Z',
      level: '7',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
  });

  it('mapel: kode unik, ubah, dan hapus', async () => {
    const s = await call('POST', '/v1/subjects', opCookie, { code: 'MTK', name: 'Matematika' });
    expect(s.statusCode).toBe(201);
    expect((await call('POST', '/v1/subjects', opCookie, { code: 'MTK', name: 'Lagi' })).statusCode).toBe(
      409,
    );
    expect(
      (
        await call('PUT', `/v1/subjects/${s.json().id}`, opCookie, { code: 'MAT', name: 'Matematika Wajib' })
      ).json().code,
    ).toBe('MAT');
    expect((await call('DELETE', `/v1/subjects/${s.json().id}`, opCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/subjects/${s.json().id}`, opCookie)).statusCode).toBe(404);
  });
});

describe('guru, siswa, dan penugasan', () => {
  it('siswa: tambah ke kelas, cari, pindah kelas, siklus hidup, dan hapus lunak', async () => {
    const a = (
      await call('POST', '/v1/classes', opCookie, { academicYearId: yearId, name: '7A', level: '7' })
    ).json();
    const b = (
      await call('POST', '/v1/classes', opCookie, { academicYearId: yearId, name: '7B', level: '7' })
    ).json();

    const ani = await call('POST', '/v1/students', opCookie, {
      name: 'Ani Lestari',
      nis: '1001',
      nisn: '0012345678',
      gender: 'P',
      birthDate: '2013-05-04',
      classId: a.id,
    });
    expect(ani.statusCode).toBe(201);
    expect(ani.json()).toMatchObject({
      name: 'Ani Lestari',
      classId: a.id,
      className: '7A',
      status: 'active',
    });
    const budi = (
      await call('POST', '/v1/students', opCookie, { name: 'Budi', nis: '1002', gender: 'L' })
    ).json();
    expect(budi.classId).toBeNull();

    // NIS atau NISN ganda ditolak; kosong boleh berulang.
    expect(
      (await call('POST', '/v1/students', opCookie, { name: 'Ganda', nis: '1001', gender: 'L' })).statusCode,
    ).toBe(409);
    expect(
      (await call('POST', '/v1/students', opCookie, { name: 'Tanpa Nomor 1', gender: 'L' })).statusCode,
    ).toBe(201);
    expect(
      (await call('POST', '/v1/students', opCookie, { name: 'Tanpa Nomor 2', gender: 'L' })).statusCode,
    ).toBe(201);

    // Cari dan saring.
    const byName = (await call('GET', '/v1/students?q=lestari', opCookie)).json();
    expect(byName.items.map((s: { name: string }) => s.name)).toEqual(['Ani Lestari']);
    expect((await call('GET', '/v1/students?q=1002', opCookie)).json().items[0].name).toBe('Budi');
    const inA = (await call('GET', `/v1/students?classId=${a.id}`, opCookie)).json();
    expect(inA.total).toBe(1);
    const paged = (await call('GET', '/v1/students?limit=2&offset=0', opCookie)).json();
    expect(paged.items).toHaveLength(2);
    expect(paged.total).toBeGreaterThanOrEqual(4);

    // Pindah kelas pada tahun ajaran yang sama mengganti kelas; jumlah siswa kelas ikut.
    const moved = await call('PUT', `/v1/students/${ani.json().id}/class`, opCookie, { classId: b.id });
    expect(moved.json()).toMatchObject({ classId: b.id, className: '7B' });
    const counts = (await call('GET', `/v1/classes?academicYearId=${yearId}`, opCookie)).json();
    expect(counts.find((c: { name: string }) => c.name === '7A').studentCount).toBe(0);
    expect(counts.find((c: { name: string }) => c.name === '7B').studentCount).toBe(1);
    expect((await call('DELETE', `/v1/classes/${b.id}`, opCookie)).statusCode).toBe(409);
    const out = await call('PUT', `/v1/students/${ani.json().id}/class`, opCookie, { classId: null });
    expect(out.json().classId).toBeNull();

    // Siklus hidup: lulus tetap terlihat; hapus menyembunyikan dan melepas NIS-nya dari daftar.
    const grad = await call('PUT', `/v1/students/${budi.id}`, opCookie, {
      name: 'Budi',
      nis: '1002',
      gender: 'L',
      status: 'graduated',
    });
    expect(grad.json().status).toBe('graduated');
    expect((await call('GET', '/v1/students?status=graduated', opCookie)).json().total).toBe(1);
    expect((await call('DELETE', `/v1/students/${budi.id}`, opCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/students/${budi.id}`, opCookie)).statusCode).toBe(404);
    expect((await call('GET', '/v1/students?status=graduated', opCookie)).json().total).toBe(0);

    // Kelas sekolah lain tidak bisa dipakai.
    const otherClass = (
      await call(
        'POST',
        '/v1/classes',
        otherCookie,
        { academicYearId: otherYearId, name: 'Lain', level: '7' },
        otherSchoolId,
      )
    ).json();
    const cross = await call('PUT', `/v1/students/${ani.json().id}/class`, opCookie, {
      classId: otherClass.id,
    });
    expect(cross.statusCode).toBe(400);
  });

  it('guru dan penugasan: NIP unik, tetapkan, ganti, lepas, dan tidak bisa dihapus saat masih mengampu', async () => {
    const t1 = (await call('POST', '/v1/teachers', opCookie, { name: 'Pak Dodi', nip: '1980' })).json();
    const t2 = (await call('POST', '/v1/teachers', opCookie, { name: 'Bu Eka' })).json();
    expect((await call('POST', '/v1/teachers', opCookie, { name: 'Ganda', nip: '1980' })).statusCode).toBe(
      409,
    );
    expect((await call('GET', '/v1/teachers?q=dodi', opCookie)).json()).toHaveLength(1);

    const cls = (
      await call('POST', '/v1/classes', opCookie, { academicYearId: yearId, name: '8A', level: '8' })
    ).json();
    const mapel = (await call('POST', '/v1/subjects', opCookie, { code: 'IPA', name: 'IPA' })).json();
    const path = `/v1/classes/${cls.id}/assignments/${mapel.id}`;
    expect((await call('PUT', path, opCookie, { teacherId: t1.id })).statusCode).toBe(200);
    expect((await call('PUT', path, opCookie, { teacherId: t2.id })).statusCode).toBe(200);
    const list = (await call('GET', `/v1/classes/${cls.id}/assignments`, opCookie)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ subjectCode: 'IPA', teacherName: 'Bu Eka' });

    expect((await call('DELETE', `/v1/teachers/${t2.id}`, opCookie)).statusCode).toBe(409);
    expect((await call('DELETE', `/v1/subjects/${mapel.id}`, opCookie)).statusCode).toBe(409);
    expect((await call('DELETE', `/v1/classes/${cls.id}`, opCookie)).statusCode).toBe(409);
    expect((await call('DELETE', path, opCookie)).statusCode).toBe(200);
    expect((await call('DELETE', path, opCookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/teachers/${t2.id}`, opCookie)).statusCode).toBe(200);
  });
});

describe('isolasi antar sekolah', () => {
  it('data sekolah lain tidak terlihat dan tidak bisa diubah', async () => {
    const mine = (await call('POST', '/v1/subjects', opCookie, { code: 'ISO', name: 'Milik Saya' })).json();
    const theirs = (
      await call(
        'POST',
        '/v1/students',
        otherCookie,
        { name: 'Siswa Sekolah Lain', gender: 'P' },
        otherSchoolId,
      )
    ).json();

    const students = (await call('GET', '/v1/students', opCookie)).json();
    expect(students.items.find((s: { id: string }) => s.id === theirs.id)).toBeUndefined();
    expect((await call('GET', `/v1/students/${theirs.id}`, opCookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/students/${theirs.id}`, opCookie)).statusCode).toBe(404);
    expect(
      (
        await call(
          'PUT',
          `/v1/subjects/${mine.id}`,
          otherCookie,
          { code: 'X', name: 'Diubah' },
          otherSchoolId,
        )
      ).statusCode,
    ).toBe(404);
    // Kode yang sama boleh dipakai di dua sekolah.
    expect(
      (await call('POST', '/v1/subjects', otherCookie, { code: 'ISO', name: 'Punya Lain' }, otherSchoolId))
        .statusCode,
    ).toBe(201);
  });
});

describe('tahun ajaran aktif', () => {
  it('tahun pertama otomatis aktif; mengaktifkan yang lain menonaktifkan sebelumnya; hanya pemegang izin', async () => {
    const sid = otherSchoolId;
    // Sekolah ini sudah punya tahun aktif dari beforeAll; tahun baru tidak otomatis aktif.
    const next = (
      await call(
        'POST',
        '/v1/academic-years',
        otherCookie,
        { name: '2027/2028', startsOn: '2027-07-12', endsOn: '2028-06-30' },
        sid,
      )
    ).json();
    expect(next.isActive).toBe(false);

    expect((await call('PUT', `/v1/academic-years/${next.id}/activate`, teacherCookie)).statusCode).toBe(403);
    const res = await call('PUT', `/v1/academic-years/${next.id}/activate`, otherCookie, undefined, sid);
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(true);
    const list = (await call('GET', '/v1/academic-years', otherCookie, undefined, sid)).json();
    expect(list.filter((y: { isActive: boolean }) => y.isActive)).toHaveLength(1);
    expect(list.find((y: { isActive: boolean }) => y.isActive).id).toBe(next.id);

    // Tahun ajaran sekolah lain tidak terjangkau.
    expect(
      (await call('PUT', `/v1/academic-years/${yearId}/activate`, otherCookie, undefined, sid)).statusCode,
    ).toBe(404);
  });
});

describe('impor siswa', () => {
  const importRows = (cookie: string, rows: object[], dryRun: boolean, sid = schoolId) =>
    call('POST', '/v1/students/import', cookie, { dryRun, rows }, sid);
  const r = (row: number, over: Record<string, string> = {}) => ({
    row,
    name: `Siswa ${row}`,
    nis: `9${row}`,
    nisn: '',
    gender: 'L',
    birthDate: '',
    className: '',
    ...over,
  });

  it('hanya pemegang student:manage', async () => {
    expect((await importRows(teacherCookie, [r(2)], true)).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/students/import' })).statusCode).toBe(401);
  });

  it('pratinjau melaporkan kesalahan per baris dan tidak menyimpan apa pun', async () => {
    await call('POST', '/v1/classes', opCookie, { academicYearId: yearId, name: 'Impor 7A', level: '7' });
    await call('POST', '/v1/students', opCookie, { name: 'Sudah Ada', nis: '9001', gender: 'P' });
    const rows = [
      r(2, { nis: '9100', className: 'impor 7a', gender: 'Laki-laki', birthDate: '2013-02-03' }), // valid (kelas tak peka huruf)
      r(3, { name: '' }),
      r(4, { gender: 'X' }),
      r(5, { nis: '9001' }), // sudah dipakai di sekolah
      r(6, { nis: '9100' }), // ganda dengan baris 2
      r(7, { birthDate: '03/02/2013' }),
      r(8, { className: 'Kelas Hantu' }),
      r(9, { nis: 'ab cd' }),
    ];
    const res = await importRows(opCookie, rows, true);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ total: 8, valid: 1, imported: 0 });
    const byRow = (n: number) => body.errors.filter((e: { row: number }) => e.row === n);
    expect(byRow(3)[0].field).toBe('name');
    expect(byRow(4)[0].field).toBe('gender');
    expect(byRow(5)[0].message).toContain('sudah dipakai');
    expect(byRow(6)[0].message).toContain('baris 2');
    expect(byRow(7)[0].field).toBe('birthDate');
    expect(byRow(8)[0].field).toBe('className');
    expect(byRow(9)[0].field).toBe('nis');
    expect(byRow(2)).toHaveLength(0);

    // Tidak ada yang tersimpan, juga bila dryRun salah tetapi ada baris cacat.
    const attempt = await importRows(opCookie, rows, false);
    expect(attempt.json().imported).toBe(0);
    const after = (await call('GET', '/v1/students?q=Siswa', opCookie)).json();
    expect(after.total).toBe(0);
  });

  it('menyimpan semua baris yang valid sekaligus beserta penempatan kelasnya', async () => {
    const rows = [
      r(2, { nis: '9201', className: 'Impor 7A', gender: 'P' }),
      r(3, { nis: '9202', nisn: '0099887766', birthDate: '2012-12-31', gender: 'perempuan' }),
      r(4, { nis: '' }),
    ];
    const res = await importRows(opCookie, rows, false);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 3, valid: 3, imported: 3, errors: [] });

    const list = (await call('GET', '/v1/students?q=Siswa', opCookie)).json();
    expect(list.total).toBe(3);
    const s2 = list.items.find((s: { nis: string }) => s.nis === '9201');
    expect(s2).toMatchObject({ className: 'Impor 7A', gender: 'P' });
    expect(list.items.find((s: { nis: string }) => s.nis === '9202')).toMatchObject({
      nisn: '0099887766',
      birthDate: '2012-12-31',
      className: null,
    });

    // Mengimpor ulang file yang sama ditolak (NIS sudah ada), tanpa duplikat.
    const again = await importRows(opCookie, rows, false);
    expect(again.json().imported).toBe(0);
    expect(again.json().errors.length).toBeGreaterThan(0);
    expect((await call('GET', '/v1/students?q=Siswa', opCookie)).json().total).toBe(3);
  });

  it('batas jumlah baris dan isolasi sekolah', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => r(i + 2, { nis: `x${i}` }));
    expect((await importRows(opCookie, many, true)).statusCode).toBe(400);
    expect((await importRows(opCookie, [], true)).statusCode).toBe(400);

    // NIS yang dipakai di sekolah lain tidak dianggap bentrok.
    const res = await importRows(otherCookie, [r(2, { nis: '9201' })], false, otherSchoolId);
    expect(res.json()).toMatchObject({ imported: 1, errors: [] });
  });
});

describe('impor guru', () => {
  const importRows = (cookie: string, rows: object[], dryRun: boolean, sid = schoolId) =>
    call('POST', '/v1/teachers/import', cookie, { dryRun, rows }, sid);
  const r = (row: number, over: Record<string, string> = {}) => ({
    row,
    name: `Guru ${row}`,
    nip: `77${row}`,
    status: '',
    ...over,
  });

  it('izin, pratinjau berisi kesalahan per baris, dan tidak ada yang tersimpan bila ada yang cacat', async () => {
    expect((await importRows(teacherCookie, [r(2)], true)).statusCode).toBe(403);
    await call('POST', '/v1/teachers', opCookie, { name: 'Sudah Ada', nip: '7700' });
    const rows = [
      r(2),
      r(3, { name: '' }),
      r(4, { nip: '7700' }),
      r(5, { nip: '772' }),
      r(6, { status: 'cuti' }),
      r(7, { nip: 'a b' }),
    ];
    const res = await importRows(opCookie, rows, true);
    const body = res.json();
    expect(body).toMatchObject({ total: 6, valid: 1, imported: 0 });
    const field = (n: number) => body.errors.find((e: { row: number }) => e.row === n)?.field;
    expect([field(3), field(4), field(5), field(6), field(7)]).toEqual([
      'name',
      'nip',
      'nip',
      'status',
      'nip',
    ]);
    expect((await importRows(opCookie, rows, false)).json().imported).toBe(0);
    expect((await call('GET', '/v1/teachers?q=Guru', opCookie)).json()).toHaveLength(0);
  });

  it('menyimpan semua guru valid dan menolak impor ulang', async () => {
    const rows = [r(2), r(3, { status: 'Nonaktif' }), r(4, { nip: '' })];
    const res = await importRows(opCookie, rows, false);
    expect(res.json()).toMatchObject({ total: 3, valid: 3, imported: 3, errors: [] });
    const list = (await call('GET', '/v1/teachers?q=Guru', opCookie)).json();
    expect(list).toHaveLength(3);
    expect(list.find((t: { nip: string }) => t.nip === '773').status).toBe('inactive');
    expect((await importRows(opCookie, rows, false)).json().imported).toBe(0);
    // Sekolah lain boleh memakai NIP yang sama.
    expect((await importRows(otherCookie, [r(2)], false, otherSchoolId)).json().imported).toBe(1);
  });
});
