import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
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
let otherSemesterId = '';
const userIds: string[] = [];
let adminCookie = '';
let mentorCookie = '';
let otherTeacherCookie = '';
let principalCookie = '';
let noModuleCookie = '';
let otherCookie = '';
let mentorTeacherId = '';
let otherTeacherId = '';
let foreignTeacherId = '';
let ani = '';
let budi = '';
let citra = '';
let dewi = '';
let foreignStudent = '';
let classId = '';

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
const daysAhead = (n: number) => daysAgo(-n);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Tahfidz', slug: `yt-${run}` })
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
  schoolId = await make(`thf-${run}`, ['tahfidz']);
  noModuleId = await make(`thf-nomod-${run}`, []);
  otherId = await make(`thf-lain-${run}`, ['tahfidz']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  yearId = y!.id;
  // Semester pendek: 20 hari, hari ke-10 adalah hari ini, sehingga target terbagi rata separuhnya.
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: daysAgo(9),
      endsOn: daysAhead(10),
      isActive: true,
    })
    .returning();
  semesterId = sem!.id;
  const [oy] = await db
    .insert(academicYear)
    .values({
      schoolId: otherId,
      name: '2000-2099',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  const [osem] = await db
    .insert(semester)
    .values({
      schoolId: otherId,
      academicYearId: oy!.id,
      name: 'Ganjil',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  otherSemesterId = osem!.id;

  adminCookie = (await join('admin-tahfidz', schoolId, ['school_admin'])).cookie;
  const mentor = await join('guru-mentor', schoolId, ['teacher']);
  mentorCookie = mentor.cookie;
  const other = await join('guru-lain-thf', schoolId, ['teacher']);
  otherTeacherCookie = other.cookie;
  principalCookie = (await join('kepsek-tahfidz', schoolId, ['principal'])).cookie;
  noModuleCookie = (await join('admin-tanpa-modul-thf', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-tahfidz-lain', otherId, ['school_admin'])).cookie;

  const [t1] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Ustaz Mentor', memberId: mentor.memberId })
    .returning();
  mentorTeacherId = t1!.id;
  const [t2] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Guru Lain', memberId: other.memberId })
    .returning();
  otherTeacherId = t2!.id;
  const [t3] = await db.insert(teacher).values({ schoolId: otherId, name: 'Guru Sekolah Lain' }).returning();
  foreignTeacherId = t3!.id;

  const mk = async (sid: string, name: string) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, gender: 'L' }).returning();
    return s!.id;
  };
  ani = await mk(schoolId, 'Ani');
  budi = await mk(schoolId, 'Budi');
  citra = await mk(schoolId, 'Citra');
  dewi = await mk(schoolId, 'Dewi');
  foreignStudent = await mk(otherId, 'Siswa Lain');

  const [cls] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: yearId, name: 'VII-A', level: '7' })
    .returning();
  classId = cls!.id;
  for (const studentId of [citra, dewi]) {
    await db.insert(enrollment).values({ schoolId, studentId, classId, academicYearId: yearId });
  }
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'ibadah_log',
      'ibadah_item',
      'hafalan_entry',
      'hafalan_target',
      'halaqah_member',
      'halaqah',
      'enrollment',
      'class_room',
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

const ids = { a: '', b: '', dhuha: '', tilawah: '', puasa: '', entryDewi: '', entryOld: '' };

const entry = (studentId: string, date: string, extra: object = {}) => ({
  studentId,
  date,
  kind: 'ziyadah',
  surahFrom: 1,
  ayahFrom: 1,
  surahTo: 1,
  ayahTo: 7,
  ...extra,
});

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/tahfidz/halaqah', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/tahfidz/halaqah')).statusCode).toBe(401);
    expect((await call('GET', '/v1/tahfidz/halaqah', mentorCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/tahfidz/halaqah', principalCookie)).statusCode).toBe(200);
    // Guru dan kepala sekolah tidak punya tahfidz:manage.
    const body = { name: 'Halaqah X' };
    expect((await call('POST', '/v1/tahfidz/halaqah', mentorCookie, body)).statusCode).toBe(403);
    expect((await call('POST', '/v1/tahfidz/halaqah', principalCookie, body)).statusCode).toBe(403);
    expect((await call('POST', '/v1/tahfidz/ibadah-items', mentorCookie, { name: 'Dhuha' })).statusCode).toBe(
      403,
    );
  });
});

describe('halaqah dan anggota', () => {
  it('membuat halaqah, nama unik, dan validasi mentor', async () => {
    const created = await call('POST', '/v1/tahfidz/halaqah', adminCookie, {
      name: 'Halaqah Al-Fatih',
      mentorTeacherId,
      scheduleNote: "Ba'da Subuh",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Halaqah Al-Fatih',
      mentorName: 'Ustaz Mentor',
      memberCount: 0,
      active: true,
      canManage: true,
      academicYearId: yearId,
    });
    ids.a = created.json().id;
    const b = await call('POST', '/v1/tahfidz/halaqah', adminCookie, { name: 'Halaqah An-Nur' });
    expect(b.statusCode).toBe(201);
    expect(b.json().mentorName).toBeNull();
    ids.b = b.json().id;

    const dup = await call('POST', '/v1/tahfidz/halaqah', adminCookie, { name: 'Halaqah Al-Fatih' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');
    const foreign = await call('POST', '/v1/tahfidz/halaqah', adminCookie, {
      name: 'Halaqah Y',
      mentorTeacherId: foreignTeacherId,
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('invalid_reference');
  });

  it('daftar memuat canManage sesuai peran dan ubah halaqah', async () => {
    const asMentor = (await call('GET', '/v1/tahfidz/halaqah', mentorCookie)).json();
    expect(asMentor.find((h: { id: string }) => h.id === ids.a).canManage).toBe(true);
    expect(asMentor.find((h: { id: string }) => h.id === ids.b).canManage).toBe(false);
    const asOther = (await call('GET', '/v1/tahfidz/halaqah', otherTeacherCookie)).json();
    expect(asOther.every((h: { canManage: boolean }) => !h.canManage)).toBe(true);

    const put = await call('PUT', `/v1/tahfidz/halaqah/${ids.b}`, adminCookie, {
      name: 'Halaqah An-Nur 2',
      mentorTeacherId: otherTeacherId,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ name: 'Halaqah An-Nur 2', mentorName: 'Bu Guru Lain' });
    expect((await call('PUT', `/v1/tahfidz/halaqah/${ids.b}`, mentorCookie, { name: 'Z' })).statusCode).toBe(
      403,
    );
  });

  it('anggota: mentor vs guru lain, satu halaqah per tahun, lintas sekolah ditolak', async () => {
    expect(
      (await call('POST', `/v1/tahfidz/halaqah/${ids.a}/members`, otherTeacherCookie, { studentIds: [ani] }))
        .statusCode,
    ).toBe(403);
    const add = await call('POST', `/v1/tahfidz/halaqah/${ids.a}/members`, mentorCookie, {
      studentIds: [ani, budi],
    });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toEqual({ added: 2, skipped: [] });

    // Mentor halaqah B (guru lain) menambah Citra; Ani sudah di halaqah A sehingga dilewati.
    const b = await call('POST', `/v1/tahfidz/halaqah/${ids.b}/members`, otherTeacherCookie, {
      studentIds: [citra, ani],
    });
    expect(b.statusCode).toBe(200);
    expect(b.json().added).toBe(1);
    expect(b.json().skipped).toEqual([{ studentId: ani, name: 'Ani', halaqahName: 'Halaqah Al-Fatih' }]);
    // Menambah ulang ke halaqah yang sama juga dilewati.
    const again = await call('POST', `/v1/tahfidz/halaqah/${ids.a}/members`, adminCookie, {
      studentIds: [budi],
    });
    expect(again.json().added).toBe(0);
    expect(again.json().skipped).toHaveLength(1);

    const foreign = await call('POST', `/v1/tahfidz/halaqah/${ids.a}/members`, adminCookie, {
      studentIds: [foreignStudent],
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('invalid_reference');

    const list = (await call('GET', `/v1/tahfidz/halaqah/${ids.a}/members`, principalCookie)).json();
    expect(list.map((m: { name: string }) => m.name)).toEqual(['Ani', 'Budi']);
    const halaqahs = (await call('GET', '/v1/tahfidz/halaqah', adminCookie)).json();
    expect(halaqahs.find((h: { id: string }) => h.id === ids.a).memberCount).toBe(2);
  });

  it('mengeluarkan anggota hanya oleh mentor atau pengelola', async () => {
    const url = (sid: string) => `/v1/tahfidz/halaqah/${ids.b}/members/${sid}`;
    expect((await call('DELETE', url(citra), mentorCookie)).statusCode).toBe(403);
    expect((await call('DELETE', url(budi), otherTeacherCookie)).statusCode).toBe(404);
    expect((await call('DELETE', url(citra), otherTeacherCookie)).statusCode).toBe(200);
    // Kembalikan Citra oleh pengelola untuk pengujian berikutnya.
    const back = await call('POST', `/v1/tahfidz/halaqah/${ids.b}/members`, adminCookie, {
      studentIds: [citra],
    });
    expect(back.json().added).toBe(1);
  });
});

describe('setoran hafalan', () => {
  it('validasi rentang ayat dan tanggal', async () => {
    const bad = await call('POST', '/v1/tahfidz/entries', mentorCookie, entry(ani, today(), { ayahTo: 8 }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_range');
    const reversed = await call(
      'POST',
      '/v1/tahfidz/entries',
      mentorCookie,
      entry(ani, today(), { surahFrom: 2, ayahFrom: 10, surahTo: 2, ayahTo: 9 }),
    );
    expect(reversed.json().error.code).toBe('invalid_range');
    const reversedSurah = await call(
      'POST',
      '/v1/tahfidz/entries',
      mentorCookie,
      entry(ani, today(), { surahFrom: 3, ayahFrom: 1, surahTo: 2, ayahTo: 5 }),
    );
    expect(reversedSurah.json().error.code).toBe('invalid_range');
    const future = await call('POST', '/v1/tahfidz/entries', mentorCookie, entry(ani, daysAhead(1)));
    expect(future.statusCode).toBe(409);
    expect(future.json().error.code).toBe('future_date');
    const missing = await call('POST', '/v1/tahfidz/entries', mentorCookie, {
      ...entry(ani, today()),
      surahFrom: 115,
    });
    expect(missing.statusCode).toBe(400);
  });

  it('mentor mencatat untuk siswanya; guru lain dan non-anggota ditolak', async () => {
    const first = await call('POST', '/v1/tahfidz/entries', mentorCookie, entry(ani, daysAgo(3)));
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      studentName: 'Ani',
      halaqahId: ids.a,
      ayahCount: 7,
      quality: 'fluent',
      kind: 'ziyadah',
    });
    ids.entryOld = first.json().id;
    const rec = (date: string, extra: object) =>
      call('POST', '/v1/tahfidz/entries', mentorCookie, entry(ani, date, extra));
    expect((await rec(daysAgo(2), { surahFrom: 2, ayahFrom: 1, surahTo: 2, ayahTo: 10 })).statusCode).toBe(
      201,
    );
    // Tumpang tindih dengan setoran sebelumnya (2:5-2:20 vs 2:1-2:10): ayat unik tidak menggandakan.
    expect(
      (await rec(daysAgo(1), { surahFrom: 2, ayahFrom: 5, surahTo: 2, ayahTo: 20, quality: 'fair' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await rec(daysAgo(1), { kind: 'murajaah', surahFrom: 1, ayahFrom: 1, surahTo: 1, ayahTo: 7 }))
        .statusCode,
    ).toBe(201);
    // Setoran yang harus diulang tidak dihitung sebagai hafalan baru.
    expect(
      (await rec(today(), { surahFrom: 2, ayahFrom: 21, surahTo: 2, ayahTo: 25, quality: 'repeat' }))
        .statusCode,
    ).toBe(201);

    // Kepala sekolah hanya membaca: tidak bisa mencatat setoran.
    expect((await call('POST', '/v1/tahfidz/entries', principalCookie, entry(ani, today()))).statusCode).toBe(
      403,
    );
    const byOther = await call('POST', '/v1/tahfidz/entries', otherTeacherCookie, entry(ani, today()));
    expect(byOther.statusCode).toBe(403);
    expect(byOther.json().error.code).toBe('forbidden');
    // Citra di halaqah milik guru lain.
    expect((await call('POST', '/v1/tahfidz/entries', mentorCookie, entry(citra, today()))).statusCode).toBe(
      403,
    );
    // Dewi bukan anggota halaqah mana pun: guru ditolak, pengelola boleh (tanpa halaqah).
    const nonMember = await call('POST', '/v1/tahfidz/entries', mentorCookie, entry(dewi, today()));
    expect(nonMember.statusCode).toBe(400);
    const byAdmin = await call('POST', '/v1/tahfidz/entries', adminCookie, entry(dewi, today()));
    expect(byAdmin.statusCode).toBe(201);
    expect(byAdmin.json().halaqahId).toBeNull();
    ids.entryDewi = byAdmin.json().id;
  });

  it('daftar setoran dengan saringan dan halaman', async () => {
    const all = (await call('GET', `/v1/tahfidz/entries?studentId=${ani}`, principalCookie)).json();
    expect(all.total).toBe(5);
    expect(all.items[0].date).toBe(today());
    const page = (
      await call('GET', `/v1/tahfidz/entries?studentId=${ani}&limit=2&offset=4`, principalCookie)
    ).json();
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(1);
    const range = (
      await call(
        'GET',
        `/v1/tahfidz/entries?halaqahId=${ids.a}&from=${daysAgo(1)}&to=${daysAgo(1)}`,
        principalCookie,
      )
    ).json();
    expect(range.total).toBe(2);
    expect(range.items.every((e: { halaqahId: string }) => e.halaqahId === ids.a)).toBe(true);
  });

  it('menghapus setoran: guru lain 403, setoran tanpa halaqah hanya pengelola', async () => {
    expect((await call('DELETE', `/v1/tahfidz/entries/${ids.entryDewi}`, mentorCookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/v1/tahfidz/entries/${ids.entryDewi}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/tahfidz/entries/${ids.entryOld}`, otherTeacherCookie)).statusCode).toBe(
      403,
    );
    expect((await call('DELETE', `/v1/tahfidz/entries/${ids.entryDewi}`, adminCookie)).statusCode).toBe(404);
  });
});

describe('target dan progres', () => {
  it('menyimpan target: mentor vs guru lain', async () => {
    const body = (studentId: string, ziyadahAyahs: number, murajaahAyahs: number) => ({
      semesterId,
      records: [{ studentId, ziyadahAyahs, murajaahAyahs }],
    });
    expect(
      (await call('PUT', '/v1/tahfidz/targets', otherTeacherCookie, body(ani, 100, 10))).statusCode,
    ).toBe(403);
    const ok = await call('PUT', '/v1/tahfidz/targets', mentorCookie, body(ani, 100, 10));
    expect(ok.statusCode).toBe(200);
    expect(ok.json().saved).toBe(1);
    // Dewi tanpa halaqah: guru ditolak (bukan anggota), pengelola boleh.
    expect((await call('PUT', '/v1/tahfidz/targets', mentorCookie, body(dewi, 5, 0))).statusCode).toBe(400);
    expect((await call('PUT', '/v1/tahfidz/targets', adminCookie, body(budi, 4, 0))).statusCode).toBe(200);
    // Menimpa target yang sama.
    expect((await call('PUT', '/v1/tahfidz/targets', mentorCookie, body(ani, 100, 10))).statusCode).toBe(200);
    const list = (
      await call('GET', `/v1/tahfidz/targets?semesterId=${semesterId}&halaqahId=${ids.a}`, mentorCookie)
    ).json();
    expect(list).toEqual([
      expect.objectContaining({ studentId: ani, ziyadahAyahs: 100, murajaahAyahs: 10, set: true }),
      expect.objectContaining({ studentId: budi, ziyadahAyahs: 4, murajaahAyahs: 0, set: true }),
    ]);
    const unset = (
      await call('GET', `/v1/tahfidz/targets?semesterId=${semesterId}&halaqahId=${ids.b}`, mentorCookie)
    ).json();
    expect(unset[0]).toMatchObject({ studentId: citra, ziyadahAyahs: 0, set: false });
    const bad = await call('PUT', '/v1/tahfidz/targets', adminCookie, {
      semesterId: otherSemesterId,
      records: [{ studentId: ani, ziyadahAyahs: 1, murajaahAyahs: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('progres siswa dengan angka yang diketahui', async () => {
    const res = await call('GET', `/v1/tahfidz/students/${ani}/progress`, principalCookie);
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.student).toEqual({ id: ani, name: 'Ani', className: null });
    expect(p.halaqah).toEqual({ id: ids.a, name: 'Halaqah Al-Fatih' });
    // Ziyadah unik: 1:1-7 (7 ayat) + 2:1-20 (20 ayat); setoran `repeat` tidak dihitung.
    expect(p.coverage.ayahs).toBe(27);
    expect(p.coverage.percent).toBe(0.43);
    expect(p.coverage.perSurah).toEqual([
      { surah: 1, ayahs: 7, complete: true },
      { surah: 2, ayahs: 20, complete: false },
    ]);
    expect(p.coverage.juzComplete).toBe(0);
    expect(p.semester).toMatchObject({
      id: semesterId,
      target: { ziyadahAyahs: 100, murajaahAyahs: 10 },
      done: { ziyadahAyahs: 27, murajaahAyahs: 7 },
      percentOfTarget: 30.91,
    });
    expect(p.last30Days).toHaveLength(30);
    expect(p.last30Days[29]).toEqual({ date: today(), ziyadahAyahs: 0, murajaahAyahs: 0 });
    expect(p.last30Days[28]).toEqual({ date: daysAgo(1), ziyadahAyahs: 16, murajaahAyahs: 7 });
    expect(p.last30Days[26]).toEqual({ date: daysAgo(3), ziyadahAyahs: 7, murajaahAyahs: 0 });
    expect(p.streakDays).toBe(4);
    expect(p.lastEntryDate).toBe(today());
    // Setoran ziyadah terakhir (2:21-25) harus diulang: lanjutannya kembali ke awalnya.
    expect(p.next).toEqual({ surah: 2, ayah: 21 });
  });

  it('siswa tanpa setoran, dan siswa sekolah lain tidak ditemukan', async () => {
    const p = (await call('GET', `/v1/tahfidz/students/${citra}/progress`, principalCookie)).json();
    expect(p.student.className).toBe('VII-A');
    expect(p.halaqah).toMatchObject({ name: 'Halaqah An-Nur 2' });
    expect(p).toMatchObject({
      coverage: { ayahs: 0, percent: 0, perSurah: [] },
      streakDays: 0,
      lastEntryDate: null,
      next: null,
    });
    expect(p.semester.percentOfTarget).toBeNull();
    expect(
      (await call('GET', `/v1/tahfidz/students/${foreignStudent}/progress`, adminCookie)).statusCode,
    ).toBe(404);
    const unknownSemester = await call(
      'GET',
      `/v1/tahfidz/students/${ani}/progress?semesterId=${otherSemesterId}`,
      adminCookie,
    );
    expect(unknownSemester.statusCode).toBe(400);
  });

  it('lanjutan setelah setoran selesai menunjuk ayat berikutnya, termasuk lintas surah', async () => {
    const rec = await call(
      'POST',
      '/v1/tahfidz/entries',
      mentorCookie,
      entry(budi, today(), { surahFrom: 114, ayahFrom: 1, surahTo: 114, ayahTo: 6 }),
    );
    expect(rec.statusCode).toBe(201);
    const end = (await call('GET', `/v1/tahfidz/students/${budi}/progress`, adminCookie)).json();
    expect(end.next).toBeNull();
    expect(end.coverage.ayahs).toBe(6);
    const cross = await call(
      'POST',
      '/v1/tahfidz/entries',
      mentorCookie,
      entry(budi, daysAgo(1), { surahFrom: 1, ayahFrom: 5, surahTo: 2, ayahTo: 2 }),
    );
    expect(cross.json().ayahCount).toBe(5);
    const p = (await call('GET', `/v1/tahfidz/students/${budi}/progress`, adminCookie)).json();
    // Setoran ziyadah dengan tanggal terbaru adalah 114:1-6, jadi lanjutan tetap kosong.
    expect(p.next).toBeNull();
    expect(p.coverage.ayahs).toBe(11);
  });
});

describe('ringkasan halaqah', () => {
  it('menghitung per anggota dan status target', async () => {
    const res = await call('GET', `/v1/tahfidz/halaqah/${ids.a}/summary`, principalCookie);
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.halaqah).toEqual({ id: ids.a, name: 'Halaqah Al-Fatih' });
    expect(s.semester).toMatchObject({ id: semesterId });
    const byName = (name: string) => s.students.find((x: { name: string }) => x.name === name);
    expect(byName('Ani')).toMatchObject({
      ayahsTotal: 27,
      percent: 0.43,
      ziyadahInRange: 27,
      murajaahInRange: 7,
      lastEntryDate: today(),
      daysSinceLast: 0,
      // Separuh semester berlalu: target prorata 50 ayat baru dan 5 murajaah; capaian 27 dan 7.
      onTarget: false,
    });
    // Budi: target 4 ayat baru (prorata 2); sudah 11 ayat unik.
    expect(byName('Budi')).toMatchObject({ ayahsTotal: 11, onTarget: true });
    const narrow = (
      await call('GET', `/v1/tahfidz/halaqah/${ids.a}/summary?from=${today()}&to=${today()}`, principalCookie)
    ).json();
    expect(narrow.students.find((x: { name: string }) => x.name === 'Ani').ziyadahInRange).toBe(0);
    expect(
      (
        await call(
          'GET',
          `/v1/tahfidz/halaqah/${ids.a}/summary?from=2000-01-01&to=2020-01-01`,
          principalCookie,
        )
      ).json().error.code,
    ).toBe('invalid_range');
    const empty = (await call('GET', `/v1/tahfidz/halaqah/${ids.b}/summary`, principalCookie)).json();
    expect(empty.students[0]).toMatchObject({
      name: 'Citra',
      ayahsTotal: 0,
      lastEntryDate: null,
      daysSinceLast: null,
      onTarget: null,
    });
  });
});

describe('ibadah', () => {
  it('butir ibadah: hanya pengelola, nama unik', async () => {
    const mk = async (name: string, extra: object = {}) =>
      call('POST', '/v1/tahfidz/ibadah-items', adminCookie, { name, ...extra });
    const dhuha = await mk('Shalat Dhuha', { sort: 1 });
    expect(dhuha.statusCode).toBe(201);
    ids.dhuha = dhuha.json().id;
    const tilawah = await mk('Tilawah', { sort: 2 });
    ids.tilawah = tilawah.json().id;
    const puasa = await mk('Puasa Senin-Kamis', { sort: 3, kind: 'weekly' });
    expect(puasa.json().kind).toBe('weekly');
    ids.puasa = puasa.json().id;
    expect((await mk('Tilawah')).statusCode).toBe(409);
    const upd = await call('PUT', `/v1/tahfidz/ibadah-items/${ids.puasa}`, adminCookie, {
      name: 'Puasa Senin-Kamis',
      kind: 'weekly',
      sort: 3,
      active: false,
    });
    expect(upd.json().active).toBe(false);
    const list = (await call('GET', '/v1/tahfidz/ibadah-items', mentorCookie)).json();
    expect(list.map((i: { name: string }) => i.name)).toEqual([
      'Shalat Dhuha',
      'Tilawah',
      'Puasa Senin-Kamis',
    ]);
    expect(
      (await call('PUT', `/v1/tahfidz/ibadah-items/${ids.dhuha}`, mentorCookie, { name: 'Dhuha' }))
        .statusCode,
    ).toBe(403);
  });

  it('lembar harian: butir aktif, canRecord, dan lingkup wajib', async () => {
    const sheet = (await call('GET', `/v1/tahfidz/ibadah-sheet?halaqahId=${ids.a}`, mentorCookie)).json();
    expect(sheet.date).toBe(today());
    expect(sheet.items.map((i: { name: string }) => i.name)).toEqual(['Shalat Dhuha', 'Tilawah']);
    expect(sheet.canRecord).toBe(true);
    expect(sheet.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Budi']);
    expect(sheet.students[0].done).toEqual({ [ids.dhuha]: null, [ids.tilawah]: null });
    const other = (
      await call('GET', `/v1/tahfidz/ibadah-sheet?halaqahId=${ids.a}`, otherTeacherCookie)
    ).json();
    expect(other.canRecord).toBe(false);
    const none = await call('GET', '/v1/tahfidz/ibadah-sheet', mentorCookie);
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('invalid_scope');
    const both = await call(
      'GET',
      `/v1/tahfidz/ibadah-sheet?halaqahId=${ids.a}&classId=${classId}`,
      mentorCookie,
    );
    expect(both.json().error.code).toBe('invalid_scope');
  });

  it('menyimpan lembar: mentor, guru lain, tanggal dan keanggotaan', async () => {
    const records = (rows: Array<[string, string, boolean]>) =>
      rows.map(([studentId, itemId, done]) => ({ studentId, itemId, done }));
    const save = (cookie: string, date: string, rows: Array<[string, string, boolean]>) =>
      call('PUT', '/v1/tahfidz/ibadah-sheet', cookie, { date, records: records(rows) });

    const ok = await save(mentorCookie, today(), [
      [ani, ids.dhuha, true],
      [ani, ids.tilawah, false],
      [budi, ids.dhuha, true],
    ]);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().saved).toBe(3);
    expect((await save(mentorCookie, daysAgo(1), [[ani, ids.dhuha, true]])).statusCode).toBe(200);
    // Menimpa catatan yang sama tidak menggandakan.
    expect((await save(mentorCookie, daysAgo(1), [[ani, ids.dhuha, true]])).statusCode).toBe(200);

    expect((await save(otherTeacherCookie, today(), [[ani, ids.dhuha, true]])).statusCode).toBe(403);
    expect((await save(mentorCookie, today(), [[citra, ids.dhuha, true]])).statusCode).toBe(403);
    expect((await save(mentorCookie, today(), [[dewi, ids.dhuha, true]])).statusCode).toBe(400);
    const future = await save(mentorCookie, daysAhead(1), [[ani, ids.dhuha, true]]);
    expect(future.statusCode).toBe(409);
    expect(future.json().error.code).toBe('future_date');
    // Butir nonaktif ditolak.
    expect((await save(mentorCookie, today(), [[ani, ids.puasa, true]])).statusCode).toBe(400);
    // Pengelola boleh untuk siswa kelas (Dewi tidak punya halaqah tetapi terdaftar di kelas).
    expect((await save(adminCookie, today(), [[dewi, ids.dhuha, false]])).statusCode).toBe(200);

    const sheet = (await call('GET', `/v1/tahfidz/ibadah-sheet?halaqahId=${ids.a}`, mentorCookie)).json();
    expect(sheet.students[0].done).toEqual({ [ids.dhuha]: true, [ids.tilawah]: false });
    expect(sheet.students[1].done).toEqual({ [ids.dhuha]: true, [ids.tilawah]: null });
    const byClass = (await call('GET', `/v1/tahfidz/ibadah-sheet?classId=${classId}`, adminCookie)).json();
    expect(byClass.students.map((s: { name: string }) => s.name)).toEqual(['Citra', 'Dewi']);
    expect(byClass.students[1].done[ids.dhuha]).toBe(false);
    expect(byClass.canRecord).toBe(true);
    const mentorClass = (
      await call('GET', `/v1/tahfidz/ibadah-sheet?classId=${classId}`, mentorCookie)
    ).json();
    expect(mentorClass.canRecord).toBe(false);
  });

  it('laporan ibadah per siswa per butir', async () => {
    const report = (
      await call(
        'GET',
        `/v1/tahfidz/ibadah-report?halaqahId=${ids.a}&from=${daysAgo(2)}&to=${today()}`,
        principalCookie,
      )
    ).json();
    expect(report.items.map((i: { name: string }) => i.name)).toEqual(['Shalat Dhuha', 'Tilawah']);
    const a = report.students.find((s: { name: string }) => s.name === 'Ani');
    expect(a.items).toEqual([
      { itemId: ids.dhuha, done: 2, total: 2, percent: 100 },
      { itemId: ids.tilawah, done: 0, total: 1, percent: 0 },
    ]);
    expect(a).toMatchObject({ done: 2, total: 3, percent: 66.67 });
    const b = report.students.find((s: { name: string }) => s.name === 'Budi');
    expect(b.items[0]).toEqual({ itemId: ids.dhuha, done: 1, total: 1, percent: 100 });
    expect(b.items[1]).toEqual({ itemId: ids.tilawah, done: 0, total: 0, percent: 0 });

    const one = (
      await call(
        'GET',
        `/v1/tahfidz/ibadah-report?studentId=${ani}&from=${today()}&to=${today()}`,
        principalCookie,
      )
    ).json();
    expect(one.students).toHaveLength(1);
    expect(one.students[0]).toMatchObject({ done: 1, total: 2, percent: 50 });
    const byClass = (
      await call('GET', `/v1/tahfidz/ibadah-report?classId=${classId}`, principalCookie)
    ).json();
    expect(byClass.students.map((s: { name: string }) => s.name)).toEqual(['Citra', 'Dewi']);

    expect((await call('GET', '/v1/tahfidz/ibadah-report', principalCookie)).json().error.code).toBe(
      'invalid_scope',
    );
    const long = await call(
      'GET',
      `/v1/tahfidz/ibadah-report?studentId=${ani}&from=2000-01-01&to=2020-01-01`,
      principalCookie,
    );
    expect(long.json().error.code).toBe('invalid_range');
  });

  it('butir yang sudah punya catatan tidak bisa dihapus', async () => {
    const used = await call('DELETE', `/v1/tahfidz/ibadah-items/${ids.dhuha}`, adminCookie);
    expect(used.statusCode).toBe(409);
    expect(used.json().error.code).toBe('in_use');
    expect((await call('DELETE', `/v1/tahfidz/ibadah-items/${ids.puasa}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/tahfidz/ibadah-items/${ids.puasa}`, adminCookie)).statusCode).toBe(404);
  });
});

describe('lintas sekolah', () => {
  it('data sekolah lain tidak bocor dan rujukan lintas sekolah ditolak', async () => {
    expect((await call('GET', '/v1/tahfidz/halaqah', otherCookie, undefined, otherId)).json()).toEqual([]);
    expect((await call('GET', '/v1/tahfidz/ibadah-items', otherCookie, undefined, otherId)).json()).toEqual(
      [],
    );
    expect(
      (await call('GET', `/v1/tahfidz/entries?studentId=${ani}`, otherCookie, undefined, otherId)).json(),
    ).toEqual({
      total: 0,
      items: [],
    });
    expect(
      (await call('GET', `/v1/tahfidz/halaqah/${ids.a}/members`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/tahfidz/halaqah/${ids.a}/summary`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/tahfidz/students/${ani}/progress`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/tahfidz/ibadah-sheet?halaqahId=${ids.a}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    const write = await call('POST', '/v1/tahfidz/entries', otherCookie, entry(ani, today()), otherId);
    expect(write.statusCode).toBe(400);
    expect(
      (await call('DELETE', `/v1/tahfidz/entries/${ids.entryOld}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('PUT', `/v1/tahfidz/halaqah/${ids.a}`, otherCookie, { name: 'Curian' }, otherId))
        .statusCode,
    ).toBe(404);
    const crossMember = await call(
      'POST',
      '/v1/tahfidz/halaqah',
      otherCookie,
      { name: 'Halaqah Lain', mentorTeacherId },
      otherId,
    );
    expect(crossMember.statusCode).toBe(400);
  });
});

describe('hapus halaqah', () => {
  it('ditolak bila punya setoran; yang kosong terhapus beserta anggotanya', async () => {
    const used = await call('DELETE', `/v1/tahfidz/halaqah/${ids.a}`, adminCookie);
    expect(used.statusCode).toBe(409);
    expect(used.json().error.code).toBe('in_use');
    expect((await call('DELETE', `/v1/tahfidz/halaqah/${ids.b}`, mentorCookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/v1/tahfidz/halaqah/${ids.b}`, adminCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/tahfidz/halaqah/${ids.b}/members`, adminCookie)).statusCode).toBe(404);
    // Setelah dihapus, Citra bebas masuk halaqah lain pada tahun yang sama.
    const add = await call('POST', `/v1/tahfidz/halaqah/${ids.a}/members`, adminCookie, {
      studentIds: [citra],
    });
    expect(add.json().added).toBe(1);
  });
});
