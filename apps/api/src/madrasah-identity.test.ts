import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  guardian,
  member,
  portalLink,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
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

/**
 * Tahap 4.5: NSM madrasah (tabel `school_identifier`, bukan kolom `school`), tampil di dokumen rapor (sparse, beku di snapshot),
 * dan adopsi `kma` untuk MI/MA (nama rumpun PAI/Arab, `subjectGroup` pai_arabic). Sekolah tanpa NSM: dokumen persis seperti sebelumnya.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
// NSM unik lintas sekolah: angka acak 12 digit supaya tidak bentrok dengan data lain.
const rnd = () => String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const nsmA = `131${rnd()}`;
const nsmB = `132${rnd()}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let mts = ''; // MTs (otoritas kemenag)
let smp = ''; // SMP (kemendikdasmen)
let mtsB = '';
let mi = '';
let ma = '';
let semId = '';
let classId = '';
let ani = '';
let cookieAdmin = '';
let cookieAdminSmp = '';
let cookieAdminB = '';
let cookieAdminMi = '';
let cookieAdminMa = '';
let cookieTeacher = '';
let cookieGuardian = '';
const userIds: string[] = [];
const schoolIds: string[] = [];
const db = () => app.platformDb;

async function join(label: string, schoolId: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}
const call = (
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  cookie: string,
  schoolId: string,
  payload?: object,
) =>
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

const putNsm = (cookie: string, schoolId: string, nsm: string | null) =>
  call('PUT', '/v1/school/identifier', cookie, schoolId, { nsm });
const getDoc = async () =>
  (await call('GET', `/v1/report-cards/${ani}?semesterId=${semId}`, cookieAdmin, mts)).json();

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Madrasah', slug: `ym-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const mk = async (slug: string, profile: string) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: profile })
      .returning();
    schoolIds.push(s!.id);
    await seedSchoolRoles(db(), s!.id);
    for (const moduleKey of ['grades', 'parent_portal']) {
      await db().insert(entitlement).values({
        schoolId: s!.id,
        moduleKey,
        subscriptionId: sub!.id,
        validUntil: sub!.currentPeriodEnd,
      });
    }
    return s!.id;
  };
  mts = await mk('mts-a', 'mts');
  smp = await mk('smp-a', 'smp');
  mtsB = await mk('mts-b', 'mts');
  mi = await mk('mi-a', 'mi');
  ma = await mk('ma-a', 'ma');
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: mts,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();
  const [sm] = await db()
    .insert(semester)
    .values({
      schoolId: mts,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
    })
    .returning();
  semId = sm!.id;
  const [c] = await db()
    .insert(classRoom)
    .values({ schoolId: mts, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  classId = c!.id;
  const [s] = await db().insert(student).values({ schoolId: mts, name: 'Ani', gender: 'P' }).returning();
  ani = s!.id;
  await db().insert(enrollment).values({ schoolId: mts, studentId: ani, classId, academicYearId: y!.id });
  cookieAdmin = (await join('admin', mts, ['school_admin'])).cookie;
  cookieAdminSmp = (await join('adminsmp', smp, ['school_admin'])).cookie;
  cookieAdminB = (await join('adminb', mtsB, ['school_admin'])).cookie;
  cookieAdminMi = (await join('adminmi', mi, ['school_admin'])).cookie;
  cookieAdminMa = (await join('adminma', ma, ['school_admin'])).cookie;
  cookieTeacher = (await join('guru', mts, ['teacher'])).cookie;
  const g = await join('wali', mts, ['guardian']);
  cookieGuardian = g.cookie;
  const [gd] = await db().insert(guardian).values({ schoolId: mts, name: 'Wali Ani' }).returning();
  await db()
    .insert(studentGuardian)
    .values({ schoolId: mts, studentId: ani, guardianId: gd!.id, relation: 'mother' });
  await db()
    .insert(portalLink)
    .values({ schoolId: mts, memberId: g.memberId, kind: 'guardian', guardianId: gd!.id });
});

afterAll(async () => {
  const tables = await db().execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  for (let pass = 0; pass < 5; pass++) {
    for (const sId of schoolIds) {
      for (const { table_name } of tables.rows) {
        await db()
          .execute(sql`delete from ${sql.identifier(table_name)} where school_id = ${sId}`)
          .catch(() => undefined);
      }
    }
  }
  for (const sId of schoolIds) await db().delete(school).where(eq(school.id, sId));
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('API NSM', () => {
  it('belum diisi: nsm null tanpa baris otomatis; applicable menurut otoritas jenjang', async () => {
    const a = await call('GET', '/v1/school/identifier', cookieAdmin, mts);
    expect(a.json()).toEqual({ nsm: null, applicable: true });
    expect((await call('GET', '/v1/school/identifier', cookieAdminSmp, smp)).json()).toEqual({
      nsm: null,
      applicable: false,
    });
    const rows = await db().execute(sql`select 1 from school_identifier where school_id = ${mts}`);
    expect(rows.rows).toHaveLength(0);
  });

  it('guru boleh membaca tetapi tidak menulis (403)', async () => {
    expect((await call('GET', '/v1/school/identifier', cookieTeacher, mts)).statusCode).toBe(200);
    expect((await putNsm(cookieTeacher, mts, nsmA)).statusCode).toBe(403);
  });

  it('format salah 400 invalid_nsm; jenjang non-madrasah 400 nsm_not_applicable tetapi boleh mengosongkan', async () => {
    for (const bad of ['1234567', '12345678901234567', 'abcdefgh']) {
      const r = await putNsm(cookieAdmin, mts, bad);
      expect([r.statusCode, r.json().error.code], bad).toEqual([400, 'invalid_nsm']);
    }
    const na = await putNsm(cookieAdminSmp, smp, nsmA);
    expect([na.statusCode, na.json().error.code]).toEqual([400, 'nsm_not_applicable']);
    expect((await putNsm(cookieAdminSmp, smp, null)).statusCode).toBe(200);
  });

  it('menyimpan (pemisah dibuang), unik lintas sekolah (409 nsm_taken), terisolasi per sekolah, bukan kolom school', async () => {
    const ok = await putNsm(cookieAdmin, mts, `${nsmA.slice(0, 4)} ${nsmA.slice(4)}`);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ nsm: nsmA, applicable: true });
    const dup = await putNsm(cookieAdminB, mtsB, nsmA);
    expect([dup.statusCode, dup.json().error.code]).toEqual([409, 'nsm_taken']);
    expect((await call('GET', '/v1/school/identifier', cookieAdminB, mtsB)).json().nsm).toBeNull();
    const cols = await db().execute(
      sql`select 1 from information_schema.columns where table_name = 'school' and column_name = 'nsm'`,
    );
    expect(cols.rows).toHaveLength(0);
  });
});

describe('NSM di dokumen rapor', () => {
  it('draf memuat schoolNsm dan schemaVersion 2; snapshot membekukannya; portal membacanya', async () => {
    const draft = await getDoc();
    expect(draft).toMatchObject({ schoolNsm: nsmA, schemaVersion: 2 });
    const fin = await call('POST', '/v1/report-cards/finalize', cookieAdmin, mts, {
      semesterId: semId,
      classId,
      force: true,
    });
    expect(fin.statusCode, fin.body).toBe(200);
    // NSM diganti sesudah final: rapor final tetap NSM lama.
    expect((await putNsm(cookieAdmin, mts, nsmB)).statusCode).toBe(200);
    expect((await getDoc()).schoolNsm).toBe(nsmA);
    const portal = await call('GET', `/v1/portal/children/${ani}/report-cards/${semId}`, cookieGuardian, mts);
    expect(portal.statusCode, portal.body).toBe(200);
    expect(portal.json().schoolNsm).toBe(nsmA);
    const reopen = await call('POST', '/v1/report-cards/reopen', cookieAdmin, mts, {
      semesterId: semId,
      classId,
    });
    expect(reopen.statusCode).toBe(200);
    expect((await getDoc()).schoolNsm).toBe(nsmB);
  });

  it('NSM dikosongkan: dokumen persis v1 (tanpa schoolNsm dan schemaVersion)', async () => {
    expect((await putNsm(cookieAdmin, mts, null)).statusCode).toBe(200);
    const doc = await getDoc();
    expect(doc).not.toHaveProperty('schoolNsm');
    expect(doc).not.toHaveProperty('schemaVersion');
  });
});

describe('adopsi kma untuk MI dan MA', () => {
  const adopt = (cookie: string, schoolId: string, curriculumKey: string, levelGroup: string) =>
    call('POST', '/v1/curricula/adopt', cookie, schoolId, { curriculumKey, levelGroup });
  const subjectsOf = (schoolId: string) =>
    db()
      .select({ code: subject.code, group: subject.subjectGroup, ref: subject.refSubjectId })
      .from(subject)
      .where(eq(subject.schoolId, schoolId));

  it('MI: lima mapel PAI/Arab bergrup pai_arabic dan tertaut acuan; idempoten', async () => {
    const a = await adopt(cookieAdminMi, mi, 'kma', 'sd');
    expect([a.statusCode, a.json()]).toEqual([200, { created: 5, skipped: 0 }]);
    const rows = await subjectsOf(mi);
    expect(rows.map((r) => r.code).sort()).toEqual(['AKH', 'AQH', 'BAR', 'FQH', 'SKI']);
    expect(rows.every((r) => r.group === 'pai_arabic' && r.ref !== null)).toBe(true);
    const again = await adopt(cookieAdminMi, mi, 'kma', 'sd');
    expect(again.json()).toEqual({ created: 0, skipped: 5 });
    expect(await subjectsOf(mi)).toHaveLength(5);
  });

  it('MA: merdeka (mapel umum) dan kma (rumpun PAI/Arab) diadopsi bersamaan; hanya kma yang bergrup', async () => {
    expect((await adopt(cookieAdminMa, ma, 'merdeka', 'sma')).statusCode).toBe(200);
    expect((await adopt(cookieAdminMa, ma, 'kma', 'sma')).json()).toEqual({ created: 5, skipped: 0 });
    const rows = await subjectsOf(ma);
    expect(
      rows
        .filter((r) => r.group === 'pai_arabic')
        .map((r) => r.code)
        .sort(),
    ).toEqual(['AKH', 'AQH', 'BAR', 'FQH', 'SKI']);
    expect(rows.filter((r) => r.group === null).length).toBeGreaterThan(5);
    const curricula = await db().execute(
      sql`select curriculum_key, level_group from school_curriculum where school_id = ${ma} order by 1`,
    );
    expect(curricula.rows).toEqual([
      { curriculum_key: 'kma', level_group: 'sma' },
      { curriculum_key: 'merdeka', level_group: 'sma' },
    ]);
  });

  it('MTs (smp): kode kma di luar lima PAI/Arab tidak diberi kelompok', async () => {
    const a = await call('POST', '/v1/curricula/adopt', cookieAdminSmp, smp, {
      curriculumKey: 'kma',
      levelGroup: 'smp',
      subjectCodes: ['MTK', 'AQH'],
    });
    expect(a.json()).toEqual({ created: 2, skipped: 0 });
    const rows = await subjectsOf(smp);
    expect(rows.find((r) => r.code === 'MTK')?.group).toBeNull();
    expect(rows.find((r) => r.code === 'AQH')?.group).toBe('pai_arabic');
  });
});
