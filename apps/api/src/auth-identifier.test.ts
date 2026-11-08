import {
  eq,
  foundation,
  guardian,
  member,
  portalLink,
  school,
  sql,
  student,
  teacher,
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
// NIK uji: 16 digit acak berawalan 99 agar tidak bertabrakan dengan data lain di database bersama.
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const nikSolo = `99${digits(14)}`;
const nikShared = `99${digits(14)}`;
const nikOrphan = `99${digits(14)}`;
const nikGuardian = `99${digits(14)}`;
const nikTeacher = `99${digits(14)}`;
const nikGuardianShared = `99${digits(14)}`;
const nikBoth = `99${digits(14)}`;
const nikCross = `99${digits(14)}`;
const nikMulti = `99${digits(14)}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherSchoolId = '';
const userIds: string[] = [];
const emailOf = (label: string) => `${label}-${run}@example.test`;

async function makeUser(label: string) {
  const res = await app.auth.api.signUpEmail({ body: { name: label, email: emailOf(label), password } });
  userIds.push(res.user.id);
  return res.user.id;
}

/** Akun siswa: siswa ber-NIK + keanggotaan + tautan portal. */
async function studentAccount(label: string, nik: string | null, inSchool = schoolId) {
  const userId = await makeUser(label);
  const [s] = await app.platformDb
    .insert(student)
    .values({ schoolId: inSchool, name: `Siswa ${label}`, gender: 'L', nik })
    .returning();
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId: inSchool }).returning();
  await app.platformDb.insert(portalLink).values({
    schoolId: inSchool,
    memberId: m?.id as string,
    kind: 'student',
    studentId: s?.id as string,
  });
  return userId;
}

/** Akun wali: wali ber-NIK + keanggotaan + tautan portal wali. */
async function guardianAccount(label: string, nik: string | null, inSchool = schoolId) {
  const userId = await makeUser(label);
  const [g] = await app.platformDb
    .insert(guardian)
    .values({ schoolId: inSchool, name: `Wali ${label}`, nik })
    .returning();
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId: inSchool }).returning();
  await app.platformDb.insert(portalLink).values({
    schoolId: inSchool,
    memberId: m?.id as string,
    kind: 'guardian',
    guardianId: g?.id as string,
  });
  return userId;
}

/** Akun guru: guru ber-NIK yang tertaut ke keanggotaan (teacher.member_id). */
async function teacherAccount(label: string, nik: string | null, inSchool = schoolId) {
  const userId = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId: inSchool }).returning();
  await app.platformDb
    .insert(teacher)
    .values({ schoolId: inSchool, name: `Guru ${label}`, nik, memberId: m?.id as string });
  return userId;
}

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    payload,
  });
const signIn = (identifier: string, pass = password) =>
  post('/api/auth/sign-in/email', { email: identifier, password: pass });
const cookieOf = (res: Awaited<ReturnType<typeof signIn>>) =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Identitas', slug: `ident-${run}` })
    .returning();
  foundationId = f?.id as string;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `ident-${run}`, name: 'Sekolah Identitas' })
    .returning();
  schoolId = s?.id as string;
  const [s2] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `ident2-${run}`, name: 'Sekolah Identitas Dua' })
    .returning();
  otherSchoolId = s2?.id as string;

  await makeUser('akun-a');
  await studentAccount('siswa-solo', nikSolo);
  // NIK siswa unik per sekolah, jadi dua akun ber-NIK sama hanya bisa berada di dua sekolah berbeda.
  await studentAccount('siswa-kembar-1', nikShared);
  await studentAccount('siswa-kembar-2', nikShared, otherSchoolId);
  await guardianAccount('wali-solo', nikGuardian);
  await teacherAccount('guru-solo', nikTeacher);
  // NIK wali sama di dua sekolah dengan dua akun berbeda: ambigu.
  await guardianAccount('wali-kembar-1', nikGuardianShared);
  await guardianAccount('wali-kembar-2', nikGuardianShared, otherSchoolId);
  // Satu akun yang sekaligus guru dan wali (NIK sama di dua tabel): tetap satu pengguna.
  const both = await makeUser('guru-wali');
  const [bothMember] = await app.platformDb.insert(member).values({ userId: both, schoolId }).returning();
  await app.platformDb
    .insert(teacher)
    .values({ schoolId, name: 'Guru Wali', nik: nikBoth, memberId: bothMember?.id as string });
  const [bothGuardian] = await app.platformDb
    .insert(guardian)
    .values({ schoolId, name: 'Guru Wali', nik: nikBoth })
    .returning();
  await app.platformDb.insert(portalLink).values({
    schoolId,
    memberId: bothMember?.id as string,
    kind: 'guardian',
    guardianId: bothGuardian?.id as string,
  });
  // Satu akun dengan keanggotaan di dua sekolah: wali di sekolah A dan guru di sekolah B dengan NIK sama,
  // tetap satu pengguna sehingga NIK berhasil dipakai masuk.
  const multi = await guardianAccount('multi-sekolah', nikMulti);
  const [multiMember] = await app.platformDb
    .insert(member)
    .values({ userId: multi, schoolId: otherSchoolId })
    .returning();
  await app.platformDb.insert(teacher).values({
    schoolId: otherSchoolId,
    name: 'Guru Multi',
    nik: nikMulti,
    memberId: multiMember?.id as string,
  });
  // NIK sama pada guru (akun X) dan wali (akun Y): dua pengguna berbeda, ambigu.
  await teacherAccount('silang-guru', nikCross);
  await guardianAccount('silang-wali', nikCross);
  // NIK ada di data siswa, tetapi siswanya tidak punya akun.
  await app.platformDb
    .insert(student)
    .values({ schoolId, name: 'Siswa tanpa akun', gender: 'P', nik: nikOrphan });
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of ['portal_link', 'teacher', 'guardian', 'student', 'member']) {
      await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${sid}'`));
    }
    await app.platformDb.delete(school).where(eq(school.id, sid));
  }
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('masuk dengan email atau NIK', () => {
  it('email (huruf besar diabaikan)', async () => {
    expect((await signIn(emailOf('akun-a').toUpperCase())).statusCode).toBe(200);
  });

  it('NIK yang tepat dimiliki satu akun siswa', async () => {
    const res = await signIn(nikSolo);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(emailOf('siswa-solo'));
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieOf(res), origin },
    });
    expect(session.json().user.email).toBe(emailOf('siswa-solo'));
  });

  it('NIK wali masuk ke akun wali itu', async () => {
    const res = await signIn(nikGuardian);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(emailOf('wali-solo'));
  });

  it('NIK guru (teacher.member_id) masuk ke akun guru itu', async () => {
    const res = await signIn(nikTeacher);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(emailOf('guru-solo'));
  });

  it('NIK yang sama di tabel guru dan wali milik satu akun tetap terselesaikan', async () => {
    const res = await signIn(nikBoth);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(emailOf('guru-wali'));
  });

  it('NIK yang menunjuk akun sama di dua sekolah berhasil; akun berbeda di dua sekolah gagal seragam', async () => {
    const same = await signIn(nikMulti);
    expect(same.statusCode).toBe(200);
    expect(same.json().user.email).toBe(emailOf('multi-sekolah'));
    expect((await signIn(nikGuardianShared)).statusCode).toBe(401);
  });

  it('semua kegagalan dijawab sama: kata sandi salah, tak dikenal, NIK ambigu, NIK tanpa akun, bukan email/NIK', async () => {
    const failures = await Promise.all([
      signIn(nikGuardianShared),
      signIn(nikCross),
      signIn(emailOf('akun-a'), 'salah-salah-salah-1'),
      signIn(nikSolo, 'salah-salah-salah-1'),
      signIn(`tidak.ada.${run}`),
      signIn(emailOf('tidak-ada')),
      signIn(nikShared),
      signIn(nikOrphan),
      signIn(`99${digits(14)}`),
      signIn('dua kata'),
      signIn('3201'),
    ]);
    for (const res of failures) expect(res.statusCode).toBe(401);
    const bodies = failures.map((r) => r.body);
    expect(new Set(bodies).size).toBe(1);
    const text = bodies.join('');
    // Tidak ada email atau NIK di jawaban kegagalan.
    expect(text).not.toContain('@example.test');
    expect(text).not.toContain(nikShared);
  });

  it('isian kosong atau tanpa kata sandi tidak menghasilkan sesi', async () => {
    expect((await signIn('')).statusCode).toBe(401);
    expect((await signIn(emailOf('akun-a'), '')).statusCode).not.toBe(200);
  });

  it('percobaan gagal berulang pada satu isian dibatasi (429) walau kata sandi akhirnya benar', async () => {
    await makeUser('akun-batas');
    const target = emailOf('akun-batas');
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min; i++) {
      expect((await signIn(target, 'salah-salah-salah-1')).statusCode).toBe(401);
    }
    const blocked = await signIn(target);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    // Isian lain tidak terpengaruh.
    expect((await signIn(emailOf('akun-a'))).statusCode).toBe(200);
  });

  it('masuk berhasil mengosongkan hitungan gagal isian itu', async () => {
    await makeUser('akun-kosong');
    const target = emailOf('akun-kosong');
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min - 1; i++)
      await signIn(target, 'salah-salah-salah-1');
    expect((await signIn(target)).statusCode).toBe(200);
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min - 1; i++)
      await signIn(target, 'salah-salah-salah-1');
    expect((await signIn(target)).statusCode).toBe(200);
  });
});

describe('nama pengguna sudah dicabut', () => {
  it('kolom tidak ada, endpoint cek tidak ada, dan update-user tidak menyimpannya', async () => {
    const cols = await app.platformDb.execute(
      sql`select 1 from information_schema.columns where table_name = 'user' and column_name = 'username'`,
    );
    expect(cols.rows).toHaveLength(0);
    const cookie = cookieOf(await signIn(emailOf('akun-a')));
    const check = await app.inject({
      method: 'GET',
      url: '/v1/account/username-check?username=abc',
      headers: { cookie, origin },
    });
    expect(check.statusCode).toBe(404);
  });
});
