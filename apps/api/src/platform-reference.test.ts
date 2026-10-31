import {
  assignRoles,
  eq,
  foundation,
  inArray,
  member,
  platformStaff,
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
const json = { origin, 'content-type': 'application/json' };
const levelKey = `lv${run}`;
const curKey = `kur-${run}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
const userIds: string[] = [];
let adminCookie = '';
let viewerCookie = '';
let plainCookie = '';
let opCookie = '';

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return { id: res.user.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  withSchool = false,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      origin,
      ...(withSchool ? { 'x-school-id': schoolId } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const school_ = (method: 'GET' | 'POST', url: string, payload?: object) =>
  call(method, url, opCookie, payload, true);
const overview = async () => (await call('GET', '/v1/platform/reference', viewerCookie)).json();

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Acuan', slug: `ya-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `acuan-${run}`, name: 'Sekolah Acuan' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(app.platformDb, schoolId);

  const admin = await makeUser('staf-admin');
  const viewer = await makeUser('staf-baca');
  const plain = await makeUser('bukan-staf');
  const op = await makeUser('operator-acuan');
  await app.platformDb.insert(platformStaff).values([
    { userId: admin.id, role: 'admin' },
    { userId: viewer.id, role: 'read_only' },
  ]);
  const [m] = await app.platformDb.insert(member).values({ userId: op.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, ['operator']);
  adminCookie = admin.cookie;
  viewerCookie = viewer.cookie;
  plainCookie = plain.cookie;
  opCookie = op.cookie;
});

afterAll(async () => {
  const db = app.platformDb;
  await db.execute(sql`delete from school_curriculum where school_id = ${schoolId}`);
  await db.execute(sql`delete from subject where school_id = ${schoolId}`);
  await db.execute(sql`delete from ref_subject where curriculum_key = ${curKey}`);
  await db.execute(sql`delete from ref_curriculum where key = ${curKey}`);
  await db.execute(sql`delete from ref_school_level where key = ${levelKey}`);
  await db.execute(sql`delete from audit_log where school_id = ${schoolId}`);
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from audit_log where actor_id in (${sql.join(
        userIds.map((u) => sql`${u}`),
        sql`, `,
      )})`,
    );
    await db.delete(platformStaff).where(inArray(platformStaff.userId, userIds));
  }
  await db.execute(sql`delete from member_role where school_id = ${schoolId}`);
  await db.execute(sql`delete from role_permission where school_id = ${schoolId}`);
  await db.execute(sql`delete from member where school_id = ${schoolId}`);
  await db.execute(sql`delete from role where school_id = ${schoolId}`);
  await db.delete(school).where(eq(school.id, schoolId));
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('izin konsol bank kurikulum', () => {
  it('hanya staf yang boleh melihat; hanya admin yang boleh menulis', async () => {
    expect((await app.inject('/v1/platform/reference')).statusCode).toBe(401);
    expect((await call('GET', '/v1/platform/reference', plainCookie)).statusCode).toBe(403);
    const view = await call('GET', '/v1/platform/reference', viewerCookie);
    expect(view.statusCode).toBe(200);
    expect(view.json().levels.map((l: { key: string }) => l.key)).toEqual(
      expect.arrayContaining(['sd', 'smp', 'sma', 'smk']),
    );
    for (const [method, url, body] of [
      ['POST', '/v1/platform/reference/levels', { key: levelKey, name: 'X', sort: 1 }],
      ['POST', '/v1/platform/reference/curricula', { key: curKey, name: 'X' }],
      ['DELETE', '/v1/platform/reference/levels/sd', undefined],
    ] as const) {
      expect((await call(method, url, viewerCookie, body)).statusCode, url).toBe(403);
    }
  });
});

describe('jenjang, kurikulum, dan mapel acuan', () => {
  it('admin membuat jenjang, kurikulum, mapel, dan impor; kunci ganda ditolak', async () => {
    const lv = await call('POST', '/v1/platform/reference/levels', adminCookie, {
      key: levelKey,
      name: 'Jenjang Uji',
      sort: 90,
    });
    expect(lv.statusCode).toBe(201);
    expect(
      (
        await call('POST', '/v1/platform/reference/levels', adminCookie, {
          key: levelKey,
          name: 'Lagi',
          sort: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('POST', '/v1/platform/reference/levels', adminCookie, {
          key: 'Salah Kunci',
          name: 'X',
          sort: 1,
        })
      ).statusCode,
    ).toBe(400);

    const cur = await call('POST', '/v1/platform/reference/curricula', adminCookie, {
      key: curKey,
      name: 'Kurikulum Uji',
      description: 'Untuk tes',
    });
    expect(cur.statusCode).toBe(201);

    const mk = (levelGroup: string, code: string, name: string, sort = 1) =>
      call('POST', `/v1/platform/reference/curricula/${curKey}/subjects`, adminCookie, {
        levelGroup,
        code,
        name,
        sort,
      });
    expect((await mk(levelKey, 'AAA', 'Mapel A', 1)).statusCode).toBe(201);
    expect((await mk(levelKey, 'AAA', 'Ganda', 2)).statusCode).toBe(409);
    expect((await mk('tidak-ada', 'ZZZ', 'Z')).statusCode).toBe(400);

    const imp = await call(
      'POST',
      `/v1/platform/reference/curricula/${curKey}/subjects/import`,
      adminCookie,
      {
        levelGroup: levelKey,
        rows: [
          { code: 'AAA', name: 'Mapel A (rev)' },
          { code: 'BBB', name: 'Mapel B' },
          { code: 'CCC', name: 'Mapel C' },
        ],
      },
    );
    expect(imp.json()).toEqual({ created: 2, updated: 1 });
    expect(
      (
        await call('POST', `/v1/platform/reference/curricula/${curKey}/subjects/import`, adminCookie, {
          levelGroup: levelKey,
          rows: [
            { code: 'X', name: 'a' },
            { code: 'X', name: 'b' },
          ],
        })
      ).statusCode,
    ).toBe(400);

    const data = await overview();
    const mine = data.subjects.filter((s: { curriculumKey: string }) => s.curriculumKey === curKey);
    expect(mine.map((s: { code: string }) => s.code)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(mine[0].name).toBe('Mapel A (rev)');
    expect(data.curricula.find((c: { key: string }) => c.key === curKey)).toMatchObject({
      subjectCount: 3,
      schoolCount: 0,
    });
  });

  it('mengubah mapel, menolak kode bentrok, dan setiap perubahan tercatat di audit', async () => {
    const data = await overview();
    const b = data.subjects.find(
      (s: { code: string; curriculumKey: string }) => s.code === 'BBB' && s.curriculumKey === curKey,
    );
    const ok = await call('PUT', `/v1/platform/reference/subjects/${b.id}`, adminCookie, {
      levelGroup: levelKey,
      code: 'BBB',
      name: 'Mapel B baru',
      sort: 5,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('Mapel B baru');
    expect(
      (
        await call('PUT', `/v1/platform/reference/subjects/${b.id}`, adminCookie, {
          levelGroup: levelKey,
          code: 'AAA',
          name: 'Bentrok',
          sort: 5,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('PUT', `/v1/platform/reference/levels/${levelKey}`, adminCookie, {
          name: 'Jenjang Uji 2',
          sort: 91,
          active: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call('PUT', `/v1/platform/reference/curricula/${curKey}`, adminCookie, {
          name: 'Kurikulum Uji 2',
          description: '',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call('PUT', '/v1/platform/reference/levels/tidak-ada', adminCookie, {
          name: 'x',
          sort: 1,
          active: true,
        })
      ).statusCode,
    ).toBe(404);

    const { rows } = await app.platformDb.execute<{ action: string }>(
      sql`select distinct action from audit_log where action like 'reference.%' and (details::text like ${`%${run}%`} or entity_id like ${`%${run}%`})`,
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'reference.level.create',
        'reference.level.update',
        'reference.curriculum.create',
        'reference.curriculum.update',
        'reference.subject.create',
        'reference.subject.update',
        'reference.subject.import',
      ]),
    );
  });
});

describe('sisi sekolah: jenjang dinamis, adopsi, dan perbandingan acuan baru', () => {
  it('daftar jenjang dibaca dari API dan jenjang nonaktif disembunyikan', async () => {
    const lv = (await school_('GET', '/v1/reference/levels')).json().levels;
    expect(lv.map((l: { key: string }) => l.key)).toEqual(expect.arrayContaining(['sd', 'smp', levelKey]));

    const off = await call('PUT', `/v1/platform/reference/levels/${levelKey}`, adminCookie, {
      name: 'Jenjang Uji 2',
      sort: 91,
      active: false,
    });
    expect(off.json().active).toBe(false);
    expect(
      (await school_('GET', '/v1/reference/levels')).json().levels.map((l: { key: string }) => l.key),
    ).not.toContain(levelKey);
    const hidden = await school_('POST', '/v1/curricula/adopt', {
      curriculumKey: curKey,
      levelGroup: levelKey,
    });
    expect(hidden.statusCode).toBe(404);
    await call('PUT', `/v1/platform/reference/levels/${levelKey}`, adminCookie, {
      name: 'Jenjang Uji 2',
      sort: 91,
      active: true,
    });
  });

  it('mapel acuan baru muncul sebagai pembaruan, diadopsi tanpa menimpa mapel sekolah yang diubah', async () => {
    // Adopsi sebagian: hanya AAA dan BBB; CCC sengaja tidak diambil.
    const adopt = await school_('POST', '/v1/curricula/adopt', {
      curriculumKey: curKey,
      levelGroup: levelKey,
      subjectCodes: ['AAA', 'BBB'],
    });
    expect(adopt.json()).toEqual({ created: 2, skipped: 0 });
    // Mapel acuan yang sudah ada sebelum adopsi bukan "baru".
    expect((await school_('GET', '/v1/reference/curricula/updates')).json().updates).toEqual([]);

    // Sekolah mengubah nama mapelnya sendiri.
    const subjects = (await school_('GET', '/v1/subjects')).json();
    const aaa = (subjects.items ?? subjects).find((s: { code: string }) => s.code === 'AAA');
    const renamed = await call(
      'PUT',
      `/v1/subjects/${aaa.id}`,
      opCookie,
      { code: 'AAA', name: 'Nama Sekolah' },
      true,
    );
    expect(renamed.statusCode).toBe(200);

    // Platform menambah mapel baru dan mengubah nama acuan AAA.
    await call('POST', `/v1/platform/reference/curricula/${curKey}/subjects`, adminCookie, {
      levelGroup: levelKey,
      code: 'DDD',
      name: 'Mapel D',
      sort: 9,
    });
    await call('POST', `/v1/platform/reference/curricula/${curKey}/subjects/import`, adminCookie, {
      levelGroup: levelKey,
      rows: [{ code: 'AAA', name: 'Nama Acuan Baru' }],
    });

    const upd = (await school_('GET', '/v1/reference/curricula/updates')).json().updates;
    expect(upd).toHaveLength(1);
    expect(upd[0]).toMatchObject({ curriculumKey: curKey, levelGroup: levelKey });
    expect(upd[0].newSubjects).toEqual([{ code: 'DDD', name: 'Mapel D' }]);

    const take = await school_('POST', '/v1/curricula/adopt', {
      curriculumKey: curKey,
      levelGroup: levelKey,
      subjectCodes: ['DDD', 'AAA'],
    });
    expect(take.json()).toEqual({ created: 1, skipped: 1 });
    expect((await school_('GET', '/v1/reference/curricula/updates')).json().updates).toEqual([]);
    const after = (await school_('GET', '/v1/subjects')).json();
    const list = after.items ?? after;
    expect(list.find((s: { code: string }) => s.code === 'AAA').name).toBe('Nama Sekolah');
    expect(list.map((s: { code: string }) => s.code)).toEqual(expect.arrayContaining(['DDD']));
  });
});

describe('larangan hapus bila dipakai', () => {
  it('jenjang, kurikulum, dan mapel yang diadopsi sekolah tidak bisa dihapus', async () => {
    expect((await call('DELETE', `/v1/platform/reference/levels/${levelKey}`, adminCookie)).statusCode).toBe(
      409,
    );
    expect((await call('DELETE', `/v1/platform/reference/curricula/${curKey}`, adminCookie)).statusCode).toBe(
      409,
    );
    const data = await overview();
    const d = data.subjects.find(
      (s: { code: string; curriculumKey: string }) => s.code === 'DDD' && s.curriculumKey === curKey,
    );
    expect((await call('DELETE', `/v1/platform/reference/subjects/${d.id}`, adminCookie)).statusCode).toBe(
      409,
    );
    expect(data.levels.find((l: { key: string }) => l.key === levelKey).schoolCount).toBe(1);
  });

  it('setelah tidak dipakai, mapel, kurikulum, dan jenjang bisa dihapus', async () => {
    await app.platformDb.execute(sql`delete from school_curriculum where school_id = ${schoolId}`);
    const data = await overview();
    const one = data.subjects.find(
      (s: { code: string; curriculumKey: string }) => s.code === 'CCC' && s.curriculumKey === curKey,
    );
    expect((await call('DELETE', `/v1/platform/reference/subjects/${one.id}`, adminCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/platform/reference/subjects/${one.id}`, adminCookie)).statusCode).toBe(
      404,
    );
    // Jenjang masih punya mapel acuan: ditolak sampai kurikulumnya dihapus.
    expect((await call('DELETE', `/v1/platform/reference/levels/${levelKey}`, adminCookie)).statusCode).toBe(
      409,
    );
    expect((await call('DELETE', `/v1/platform/reference/curricula/${curKey}`, adminCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/platform/reference/levels/${levelKey}`, adminCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/platform/reference/levels/${levelKey}`, adminCookie)).statusCode).toBe(
      404,
    );
  });
});
