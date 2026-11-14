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
  reportCard,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
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
 * Tahap 4.4: rapor kokurikuler. Bagian `cocurricular` hanya ada bila murid punya penilaian (sparse), dibekukan di snapshot
 * (label tidak ikut berubah), terbaca di portal, tidak menghalangi finalisasi (hanya lencana info), dan tidak pernah mengisi
 * `cocurricularNote` otomatis. Murid tanpa penilaian: dokumen dan snapshot v1 seperti sebelumnya.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let sid = '';
let sidB = '';
let semId = '';
let yearId = '';
let classId = '';
let ani = '';
let budi = '';
let programId = '';
let itemIds: string[] = [];
let levelIds: string[] = [];
let cookieAdmin = '';
let cookieAdminB = '';
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  schoolId = sid,
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

const docUrl = (studentId: string) => `/v1/report-cards/${studentId}?semesterId=${semId}`;
const portalUrl = (studentId: string) => `/v1/portal/children/${studentId}/report-cards/${semId}`;
const getDoc = async (studentId: string) => (await call('GET', docUrl(studentId), cookieAdmin)).json();
const listRows = async () =>
  (await call('GET', `/v1/report-cards?semesterId=${semId}&classId=${classId}`, cookieAdmin)).json() as {
    studentId: string;
    cocurricularMissing?: true;
  }[];
const finalize = () =>
  call('POST', '/v1/report-cards/finalize', cookieAdmin, { semesterId: semId, classId, force: true });
const reopen = () => call('POST', '/v1/report-cards/reopen', cookieAdmin, { semesterId: semId, classId });
const assess = (cells: object[]) =>
  call('PUT', `/v1/cocurricular/programs/${programId}/assessments`, cookieAdmin, {
    semesterId: semId,
    classId,
    cells,
  });

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Rapor Kokurikuler', slug: `yrk-${run}` })
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
  const mkSchool = async (slug: string) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: 'smp' })
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
  sid = await mkSchool('rk-a');
  sidB = await mkSchool('rk-b');
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: sid,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();
  yearId = y!.id;
  const [sm] = await db()
    .insert(semester)
    .values({
      schoolId: sid,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
    })
    .returning();
  semId = sm!.id;
  const [c] = await db()
    .insert(classRoom)
    .values({ schoolId: sid, academicYearId: yearId, name: '7A', level: '7' })
    .returning();
  classId = c!.id;
  const mkStudent = async (name: string) => {
    const [s] = await db().insert(student).values({ schoolId: sid, name, gender: 'L' }).returning();
    await db()
      .insert(enrollment)
      .values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ani = await mkStudent('Ani');
  budi = await mkStudent('Budi');
  cookieAdmin = (await join('admin', sid, ['school_admin'])).cookie;
  cookieAdminB = (await join('adminb', sidB, ['school_admin'])).cookie;
  const g = await join('wali', sid, ['guardian']);
  cookieGuardian = g.cookie;
  const [gd] = await db().insert(guardian).values({ schoolId: sid, name: 'Wali Ani' }).returning();
  await db()
    .insert(studentGuardian)
    .values({ schoolId: sid, studentId: ani, guardianId: gd!.id, relation: 'mother' });
  await db()
    .insert(portalLink)
    .values({ schoolId: sid, memberId: g.memberId, kind: 'guardian', guardianId: gd!.id });

  const adopt = await call('POST', '/v1/cocurricular/profile-items/adopt', cookieAdmin, {
    frameworkKey: 'profil_lulusan_2025',
  });
  itemIds = (adopt.json().items as { id: string }[]).map((i) => i.id);
  const lv = await call('PUT', '/v1/cocurricular/rubric-levels', cookieAdmin, {
    levels: [
      { code: 'SB', label: 'Sangat Baik', sort: 1 },
      { code: 'B', label: 'Baik', sort: 2 },
    ],
  });
  levelIds = (lv.json().levels as { id: string }[]).map((l) => l.id);
  const prog = await call('POST', '/v1/cocurricular/programs', cookieAdmin, {
    academicYearId: yearId,
    semesterId: null,
    form: 'collaborative',
    title: 'Gaya Hidup Berkelanjutan',
    status: 'active',
    classIds: [classId],
    profileItemIds: [itemIds[0], itemIds[1]],
  });
  expect(prog.statusCode, prog.body).toBe(201);
  programId = prog.json().id;
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

describe('murid tanpa penilaian: dokumen persis seperti sebelumnya', () => {
  it('draf tanpa kunci cocurricular/schemaVersion; semua murid berlencana info', async () => {
    const doc = await getDoc(ani);
    expect(doc).not.toHaveProperty('cocurricular');
    expect(doc).not.toHaveProperty('schemaVersion');
    expect(doc).not.toHaveProperty('cocurricularNote');
    expect((await listRows()).map((r) => r.cocurricularMissing)).toEqual([true, true]);
  });
});

describe('murid dengan penilaian', () => {
  it('draf memuat bagian terstruktur (sparse per murid); catatan teks tidak diisi server; lencana hanya untuk yang belum dinilai', async () => {
    const r = await assess([
      { profileItemId: itemIds[0], studentId: ani, rubricLevelId: levelIds[0], note: null },
      { profileItemId: itemIds[1], studentId: ani, rubricLevelId: null, note: 'aktif sekali' },
    ]);
    expect(r.statusCode, r.body).toBe(200);
    const doc = await getDoc(ani);
    expect(doc.schemaVersion).toBe(2);
    expect(doc).not.toHaveProperty('cocurricularNote');
    expect(doc.cocurricular).toHaveLength(1);
    expect(doc.cocurricular[0]).toMatchObject({
      programId,
      title: 'Gaya Hidup Berkelanjutan',
      form: 'collaborative',
    });
    const items = doc.cocurricular[0].items as {
      framework: string;
      level: { code: string; label: string } | null;
      note?: string;
    }[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      framework: 'profil_lulusan_2025',
      level: { code: 'SB', label: 'Sangat Baik' },
    });
    expect(items[0]).not.toHaveProperty('note');
    expect(items[1]).toMatchObject({ level: null, note: 'aktif sekali' });
    // Budi tidak punya penilaian: dokumennya tidak berubah.
    const other = await getDoc(budi);
    expect(other).not.toHaveProperty('cocurricular');
    expect(other).not.toHaveProperty('schemaVersion');
    const rows = await listRows();
    expect(rows.find((x) => x.studentId === ani)).not.toHaveProperty('cocurricularMissing');
    expect(rows.find((x) => x.studentId === budi)?.cocurricularMissing).toBe(true);
  });

  it('program yang tidak tampil di rapor tidak masuk dokumen', async () => {
    const body = {
      semesterId: null,
      form: 'collaborative',
      title: 'Gaya Hidup Berkelanjutan',
      status: 'active',
    };
    const put = (showInReport: boolean) =>
      call('PUT', `/v1/cocurricular/programs/${programId}`, cookieAdmin, { ...body, showInReport });
    const off = await put(false);
    expect(off.statusCode, off.body).toBe(200);
    expect(await getDoc(ani)).not.toHaveProperty('cocurricular');
    expect((await put(true)).statusCode).toBe(200);
    expect((await getDoc(ani)).cocurricular).toHaveLength(1);
  });
});

describe('finalisasi, snapshot beku, portal, buka kembali', () => {
  it('kokurikuler kosong tidak menghalangi finalisasi; snapshot v2 hanya untuk murid yang dinilai', async () => {
    expect((await finalize()).statusCode).toBe(200);
    const rows = await db().select().from(reportCard).where(eq(reportCard.semesterId, semId));
    const a = rows.find((r) => r.studentId === ani)!;
    const b = rows.find((r) => r.studentId === budi)!;
    expect(a.schemaVersion).toBe(2);
    expect((a.snapshot as { cocurricular?: unknown }).cocurricular).toBeDefined();
    expect(b.schemaVersion).toBe(1);
    expect(b.snapshot as object).not.toHaveProperty('cocurricular');
    // Final: tanpa lencana info.
    expect((await listRows()).every((r) => r.cocurricularMissing === undefined)).toBe(true);
  });

  it('label yang diganti sesudah final tidak mengubah rapor; portal membaca bagian yang sama', async () => {
    await db().execute(sql`update school_profile_item set label = 'Label baru' where school_id = ${sid}`);
    await db().execute(
      sql`update cocurricular_rubric_level set label = 'Tingkat baru' where school_id = ${sid}`,
    );
    const frozen = await getDoc(ani);
    expect(frozen.cocurricular[0].items[0].label).not.toBe('Label baru');
    expect(frozen.cocurricular[0].items[0].level.label).toBe('Sangat Baik');
    const portal = await call('GET', portalUrl(ani), cookieGuardian);
    expect(portal.statusCode, portal.body).toBe(200);
    expect(portal.json().cocurricular).toEqual(frozen.cocurricular);
  });

  it('buka kembali: draf memakai label terkini', async () => {
    expect((await reopen()).statusCode).toBe(200);
    const live = await getDoc(ani);
    expect(live.status).toBe('draft');
    expect(live.cocurricular[0].items[0].label).toBe('Label baru');
    expect(live.cocurricular[0].items[0].level.label).toBe('Tingkat baru');
  });
});

describe('isolasi tenant', () => {
  it('sekolah lain tidak dapat membaca dokumen murid ini', async () => {
    const res = await call('GET', docUrl(ani), cookieAdminB, undefined, sidB);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('cocurricular');
  });
});
