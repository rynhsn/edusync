import { signDevEvent } from '@edusync/billing';
import {
  assignRoles,
  entitlement,
  foundation,
  inArray,
  member,
  outbox,
  platformStaff,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { testNpsn } from './npsn-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/** Profil jenjang: satu unit satu jenjang. Daftar acuan, pendaftaran, aktivasi, /me, ganti oleh staf, dan tingkat bawaan. */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const json = { origin, 'content-type': 'application/json' };
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' });

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let foundationId = '';
let schoolId = '';
let adminCookie = '';
let staffAdmin = '';
let staffReadOnly = '';
const slug = `prof-${run}`;

const ids = (xs: string[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Uji ${label}`, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return { id: res.user.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

const unit = (key: string, over: Record<string, unknown> = {}) => ({
  name: 'SMP Uji Jenjang',
  slug: `${key}-${run}`,
  npsn: testNpsn(),
  educationProfile: 'smp',
  modules: ['attendance'],
  tier: 't300',
  ...over,
});

const register = (cookie: string, units: object[]) =>
  app.inject({
    method: 'POST',
    url: '/v1/registrations',
    headers: { ...json, cookie },
    payload: { foundationName: `Yayasan Jenjang ${run}`, period: 'monthly', units },
  });

const school$ = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { cookie: adminCookie, 'x-school-id': schoolId, ...(payload ? json : { origin }) },
    ...(payload ? { payload } : {}),
  });

const setProfile = (cookie: string, id: string, educationProfile: string) =>
  app.inject({
    method: 'PUT',
    url: `/v1/platform/schools/${id}/education-profile`,
    headers: { ...json, cookie },
    payload: { educationProfile },
  });

const profileOf = async (id: string) =>
  (
    await app.platformDb.execute<{ education_profile: string | null }>(
      sql`select education_profile from school where id = ${id}`,
    )
  ).rows[0]?.education_profile ?? null;

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Jenjang Uji', slug: `yjp-${run}` })
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
  // Sekolah lama: belum punya jenjang.
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug, name: `Sekolah ${slug}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  await db.insert(entitlement).values({
    schoolId,
    moduleKey: 'administration',
    subscriptionId: sub!.id,
    validUntil: sub!.currentPeriodEnd,
  });
  const admin = await makeUser('admin-jenjang');
  const [m] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  adminCookie = admin.cookie;
  const sa = await makeUser('staf-admin-jenjang');
  await db.insert(platformStaff).values({ userId: sa.id, role: 'admin' });
  staffAdmin = sa.cookie;
  const sr = await makeUser('staf-baca-jenjang');
  await db.insert(platformStaff).values({ userId: sr.id, role: 'read_only' });
  staffReadOnly = sr.cookie;
});

afterAll(async () => {
  const db = app.platformDb;
  const regSchoolIds = (
    await db.execute<{ id: string }>(sql`select id from school where slug like ${`%-${run}`}`)
  ).rows.map((r) => r.id);
  const regFoundationIds = (
    await db.execute<{ foundation_id: string }>(
      sql`select distinct foundation_id from school where slug like ${`%-${run}`}`,
    )
  ).rows.map((r) => r.foundation_id);
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from payment where invoice_id in (select i.id from invoice i join registration r on r.id = i.registration_id where r.user_id in (${ids(userIds)}))`,
    );
    await db.execute(
      sql`delete from invoice where registration_id in (select id from registration where user_id in (${ids(userIds)}))`,
    );
    await db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
    await db.delete(platformStaff).where(inArray(platformStaff.userId, userIds));
  }
  for (const sid of [...regSchoolIds, schoolId]) {
    for (const table of [
      'academic_year',
      'school_level',
      'entitlement',
      'audit_log',
      'member_role',
      'role_permission',
      'member',
      'role',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  await db.execute(sql`delete from school where slug like ${`%-${run}`} or id = ${schoolId}`);
  const allFoundations = [...regFoundationIds, foundationId];
  await db.execute(sql`delete from subscription where foundation_id in (${ids(allFoundations)})`);
  await db.execute(
    sql`update registration set foundation_id = null where foundation_id in (${ids(allFoundations)})`,
  );
  if (userIds.length > 0) await db.execute(sql`delete from registration where user_id in (${ids(userIds)})`);
  await db.execute(sql`delete from foundation_owner where foundation_id in (${ids(allFoundations)})`);
  await db.execute(sql`delete from foundation where id in (${ids(allFoundations)})`);
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('daftar profil jenjang', () => {
  it('publik, urut, dengan tingkat dan fase bawaan', async () => {
    const res = await app.inject('/v1/education-profiles');
    expect(res.statusCode).toBe(200);
    const list = res.json() as {
      key: string;
      teacherModel: string;
      vocational: boolean;
      authority: string;
      levels: { code: string; phase: string }[];
    }[];
    expect(list.map((p) => p.key)).toEqual(['sd', 'mi', 'smp', 'mts', 'sma', 'ma', 'smk', 'mak']);
    const by = Object.fromEntries(list.map((p) => [p.key, p]));
    expect(by.sd?.teacherModel).toBe('class');
    expect(by.mi?.authority).toBe('kemenag');
    expect(by.smp?.vocational).toBe(false);
    expect(by.smk?.vocational).toBe(true);
    expect(by.mak?.vocational).toBe(true);
    expect(by.sd?.levels.map((l) => `${l.code}:${l.phase}`)).toEqual([
      '1:A',
      '2:A',
      '3:B',
      '4:B',
      '5:C',
      '6:C',
    ]);
    expect(by.smp?.levels.every((l) => l.phase === 'D')).toBe(true);
    expect(by.sma?.levels.map((l) => `${l.code}:${l.phase}`)).toEqual(['X:E', 'XI:F', 'XII:F']);
  });
});

describe('jenjang pada pendaftaran', () => {
  it('wajib ada dan harus dikenal', async () => {
    const owner = await makeUser('reg-profil');
    const { educationProfile: _omit, ...none } = unit('tanpa');
    expect((await register(owner.cookie, [none])).statusCode).toBe(400);
    const unknown = await register(owner.cookie, [unit('asing', { educationProfile: 'paud' })]);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('invalid_education_profile');
  });

  it('disalin ke sekolah saat aktivasi dan tampil di /v1/me dan identitas', async () => {
    const owner = await makeUser('reg-aktif-profil');
    const res = await register(owner.cookie, [unit('aktif', { educationProfile: 'smk' })]);
    expect(res.statusCode).toBe(201);
    const created = res.json();
    const inv = (
      await app.platformDb.execute<{ provider_ref: string; amount: number }>(
        sql`select provider_ref, amount from invoice where registration_id = ${created.registrationId}`,
      )
    ).rows[0]!;
    const event = {
      eventId: `evt-prof-${run}`,
      orderId: inv.provider_ref,
      status: 'paid',
      amount: inv.amount,
    };
    const paid = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/payments/dev',
      headers: json,
      payload: {
        ...event,
        signature: signDevEvent(env.PAYMENT_DEV_SECRET, event as Parameters<typeof signDevEvent>[1]),
      },
    });
    expect(paid.json().outcome).toBe('activated');

    const [row] = (
      await app.platformDb.execute<{ id: string; education_profile: string | null }>(
        sql`select id, education_profile from school where slug = ${`aktif-${run}`}`,
      )
    ).rows;
    expect(row?.education_profile).toBe('smk');

    const me = (await app.inject({ url: '/v1/me', headers: { cookie: owner.cookie } })).json();
    const mine = me.memberships.find((m: { schoolSlug: string }) => m.schoolSlug === `aktif-${run}`);
    expect(mine.educationProfile).toEqual({
      key: 'smk',
      name: 'SMK',
      teacherModel: 'subject',
      vocational: true,
    });
    const identity = (
      await app.inject({
        url: '/v1/school/identity',
        headers: { cookie: owner.cookie, 'x-school-id': row!.id, origin },
      })
    ).json();
    expect(identity.educationProfile.key).toBe('smk');
  });
});

describe('mengatur jenjang oleh staf platform', () => {
  it('hanya staf admin; sekolah lama mulai tanpa jenjang', async () => {
    expect(await profileOf(schoolId)).toBeNull();
    const me = (await app.inject({ url: '/v1/me', headers: { cookie: adminCookie } })).json();
    expect(me.memberships[0].educationProfile).toBeNull();

    expect((await setProfile(staffReadOnly, schoolId, 'smp')).statusCode).toBe(403);
    expect((await setProfile(adminCookie, schoolId, 'smp')).statusCode).toBe(403);
    const bad = await setProfile(staffAdmin, schoolId, 'paud');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_education_profile');
    expect((await setProfile(staffAdmin, schoolId, 'smp')).statusCode).toBe(200);
    expect(await profileOf(schoolId)).toBe('smp');
    const audit = await app.platformDb.execute(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'school.education_profile'`,
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('bisa diganti selama belum ada tahun ajaran, lalu terkunci', async () => {
    expect((await setProfile(staffAdmin, schoolId, 'mts')).statusCode).toBe(200);
    expect(await profileOf(schoolId)).toBe('mts');
    // sama dengan yang sekarang: tidak ada perubahan dan tidak ditolak
    expect((await setProfile(staffAdmin, schoolId, 'mts')).statusCode).toBe(200);

    await app.platformDb.execute(
      sql`insert into academic_year (school_id, name, starts_on, ends_on) values (${schoolId}, ${`TA ${run}`}, '2026-07-13', '2027-06-26')`,
    );
    const locked = await setProfile(staffAdmin, schoolId, 'sma');
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('profile_locked');
    expect(await profileOf(schoolId)).toBe('mts');
  });

  it('jenjang yang masih kosong tetap bisa diisi walau sudah ada tahun ajaran', async () => {
    const [bare] = await app.platformDb
      .insert(school)
      .values({ foundationId, slug: `bare-${run}`, name: `Sekolah bare ${run}` })
      .returning();
    await app.platformDb.execute(
      sql`insert into academic_year (school_id, name, starts_on, ends_on) values (${bare!.id}, ${`TA bare ${run}`}, '2026-07-13', '2027-06-26')`,
    );
    expect((await setProfile(staffAdmin, bare!.id, 'sd')).statusCode).toBe(200);
    expect(await profileOf(bare!.id)).toBe('sd');
  });
});

describe('tingkat bawaan menurut jenjang unit', () => {
  it('tanpa stage memakai jenjang unit', async () => {
    const res = await school$('POST', '/v1/school/levels/defaults', {});
    expect(res.statusCode).toBe(200);
    expect(res.json().map((l: { code: string }) => l.code)).toEqual(['7', '8', '9']);
  });

  it('unit tanpa jenjang ditolak bila stage tidak dikirim, stage lama tetap jalan', async () => {
    const [bare] = (
      await app.platformDb.execute<{ id: string }>(sql`select id from school where slug = ${`bare-${run}`}`)
    ).rows;
    await app.platformDb.execute(sql`update school set education_profile = null where id = ${bare!.id}`);
    const [m] = await app.platformDb
      .insert(member)
      .values({ userId: userIds[0] as string, schoolId: bare!.id })
      .returning();
    await seedSchoolRoles(app.platformDb, bare!.id);
    await assignRoles(app.platformDb, m!.id, bare!.id, ['school_admin']);
    const call = (payload: object) =>
      app.inject({
        method: 'POST',
        url: '/v1/school/levels/defaults',
        headers: { ...json, cookie: adminCookie, 'x-school-id': bare!.id },
        payload,
      });
    const none = await call({});
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('no_education_profile');
    const stage = await call({ stage: 'smk' });
    expect(stage.statusCode).toBe(200);
    expect(stage.json().map((l: { code: string }) => l.code)).toEqual(['X', 'XI', 'XII']);
  });
});
