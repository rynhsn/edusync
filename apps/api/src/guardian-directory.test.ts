import {
  assignRoles,
  eq,
  foundation,
  guardian,
  member,
  portalInvite,
  portalLink,
  school,
  seedSchoolRoles,
  sql,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { maskEmail, matchesGuardianQuery } from './guardian-directory';

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
const foundationIds: string[] = [];
const userIds: string[] = [];
const cookies: Record<'admin' | 'reader' | 'portal', string> = { admin: '', reader: '', portal: '' };
let portalMemberId = '';

type Who = keyof typeof cookies;
const call = (who: Who, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: cookies[who],
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

async function makeSchool(slug: string, name: string) {
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: `Yayasan ${name}`, slug })
    .returning();
  foundationIds.push(f!.id);
  const [s] = await app.platformDb.insert(school).values({ foundationId: f!.id, slug, name }).returning();
  await seedSchoolRoles(app.platformDb, s!.id);
  return s!.id;
}

async function makeUser(who: Who, role: 'school_admin' | 'treasurer' | 'guardian') {
  const email = `${who}-wdir-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Uji ${who}`, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, [role]);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  cookies[who] = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { memberId: m!.id, email };
}

async function newStudent(name: string) {
  const res = await call('admin', 'POST', '/v1/students', { name: `${name} ${run}`, gender: 'L' });
  return res.json().id as string;
}

async function addGuardian(studentId: string, body: Record<string, unknown>) {
  const res = await call('admin', 'POST', `/v1/students/${studentId}/guardians`, {
    relation: 'father',
    ...body,
  });
  expect(res.statusCode).toBe(201);
  const links = res.json() as { guardianId: string; name: string }[];
  return links.find((l) => l.name === body.name)?.guardianId as string;
}

const ids: Record<string, string> = {};
const NIK_A = '3201010101010011';

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  schoolId = await makeSchool(`wd-${run}`, 'Direktori Wali Uji');
  otherSchoolId = await makeSchool(`wx-${run}`, 'Sekolah Lain Uji');
  await makeUser('admin', 'school_admin');
  await makeUser('reader', 'treasurer');
  const portal = await makeUser('portal', 'guardian');
  portalMemberId = portal.memberId;

  // Anak dan wali: Ahmad (ayah Budi, dengan NIK dan akun portal), Siti (ibu Budi dan Cici, tanpa NIK, diundang),
  // Rudi (wali Dodi, tanpa NIK, tanpa akun; undangan lama kedaluwarsa), Lina (tanpa siswa).
  const budi = await newStudent('Budi Direktori');
  const cici = await newStudent('Cici Direktori');
  const dodi = await newStudent('Dodi Direktori');
  ids.budi = budi;
  ids.cici = cici;
  ids.dodi = dodi;
  ids.ahmad = await addGuardian(budi, {
    name: `Ahmad Wali ${run}`,
    nik: NIK_A,
    phone: '0812-5550-0001',
    email: `ahmad-${run}@example.test`,
  });
  ids.siti = await addGuardian(budi, { name: `Siti Wali ${run}`, relation: 'mother', phone: '081255500002' });
  await call('admin', 'POST', `/v1/students/${cici}/guardians`, { guardianId: ids.siti, relation: 'mother' });
  ids.rudi = await addGuardian(dodi, { name: `Rudi Wali ${run}`, relation: 'guardian' });
  const [lina] = await app.platformDb
    .insert(guardian)
    .values({ schoolId, name: `Lina Yatim ${run}` })
    .returning();
  ids.lina = lina!.id;

  await app.platformDb.insert(portalLink).values({
    schoolId,
    memberId: portalMemberId,
    kind: 'guardian',
    guardianId: ids.ahmad,
  });
  await app.platformDb.insert(portalInvite).values([
    {
      schoolId,
      kind: 'guardian',
      guardianId: ids.siti,
      tokenHash: `wd-open-${run}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: userIds[0]!,
    },
    {
      schoolId,
      kind: 'guardian',
      guardianId: ids.rudi,
      tokenHash: `wd-old-${run}`,
      expiresAt: new Date(Date.now() - 86_400_000),
      createdBy: userIds[0]!,
    },
  ]);

  // Wali sekolah lain: tidak boleh muncul.
  await app.platformDb
    .insert(guardian)
    .values({ schoolId: otherSchoolId, name: `Wali Sekolah Lain ${run}`, nik: '3201010101010099' });
});

afterAll(async () => {
  for (const id of [schoolId, otherSchoolId]) {
    for (const table of [
      'portal_invite',
      'portal_link',
      'student_guardian',
      'guardian',
      'enrollment',
      'student',
      'audit_log',
      'member',
      'role',
    ]) {
      await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${id}'`));
    }
    await app.platformDb.delete(school).where(eq(school.id, id));
  }
  for (const id of foundationIds)
    await app.platformDb.execute(sql.raw(`delete from foundation where id = '${id}'`));
  for (const id of userIds) await app.platformDb.delete(user).where(eq(user.id, id));
  await app.close();
});

type Item = {
  id: string;
  name: string;
  nik: string | null;
  nikMasked: string | null;
  childCount: number;
  children: { studentId: string; name: string; relation: string; isPrimary: boolean }[];
  portalStatus: string;
  portalEmailMasked: string | null;
};
interface Dir {
  items: Item[];
  total: number;
  page: number;
  limit: number;
  totals: { total: number; withoutNik: number; withoutPortal: number; invited: number };
}
const list = async (who: Who, qs = ''): Promise<Dir> => {
  const res = await call(who, 'GET', `/v1/guardians/directory${qs}`);
  expect(res.statusCode).toBe(200);
  return res.json();
};
const q = (extra: string) => `?q=${run}${extra}`;

describe('fungsi murni direktori wali', () => {
  it('menyamarkan email', () => {
    expect(maskEmail('budi@contoh.id')).toBe('b***@contoh.id');
    expect(maskEmail('tanpa-at')).toBe('***');
    expect(maskEmail(null)).toBeNull();
  });

  it('mencocokkan nama, email, anak, NIK, dan telepon (0812 = 62812)', () => {
    const g = {
      name: 'Ahmad',
      nik: '3201010101010011',
      phone: '6281255500001',
      email: 'a@x.id',
      childNames: ['Budi'],
    };
    expect(matchesGuardianQuery(g, 'ahm')).toBe(true);
    expect(matchesGuardianQuery(g, 'budi')).toBe(true);
    expect(matchesGuardianQuery(g, 'A@X.ID')).toBe(true);
    expect(matchesGuardianQuery(g, '3201 0101-0101')).toBe(true);
    expect(matchesGuardianQuery(g, '0812-5550')).toBe(true);
    expect(matchesGuardianQuery(g, '0899')).toBe(false);
    expect(matchesGuardianQuery(g, 'zzz')).toBe(false);
    expect(matchesGuardianQuery(g, '')).toBe(true);
  });
});

describe('GET /v1/guardians/directory', () => {
  it('mengurutkan menurut nama dan memuat anak, status portal, serta total header', async () => {
    const res = await list('admin', q(''));
    expect(res.items.map((i) => i.name)).toEqual([
      `Ahmad Wali ${run}`,
      `Lina Yatim ${run}`,
      `Rudi Wali ${run}`,
      `Siti Wali ${run}`,
    ]);
    expect(res.total).toBe(4);
    const byName = (n: string) => res.items.find((i) => i.name.startsWith(n)) as Item;
    expect(byName('Ahmad').portalStatus).toBe('active');
    expect(byName('Ahmad').portalEmailMasked).toBe(`p***@example.test`);
    expect(byName('Siti').portalStatus).toBe('invited');
    expect(byName('Rudi').portalStatus).toBe('none');
    expect(byName('Lina').portalStatus).toBe('none');
    expect(byName('Siti').childCount).toBe(2);
    expect(byName('Siti').children.map((c) => c.name)).toEqual([
      `Budi Direktori ${run}`,
      `Cici Direktori ${run}`,
    ]);
    expect(byName('Siti').children[0]).toMatchObject({ relation: 'mother', isPrimary: false });
    expect(byName('Ahmad').children[0]).toMatchObject({ relation: 'father', isPrimary: true });
    expect(byName('Lina').childCount).toBe(0);
  });

  it('totals mencakup seluruh sekolah ini saja (bukan sekolah lain)', async () => {
    const res = await list('admin');
    expect(res.totals).toEqual({ total: 4, withoutNik: 3, withoutPortal: 2, invited: 1 });
    expect(JSON.stringify(res)).not.toContain('Sekolah Lain');
  });

  it('menyaring wali tanpa NIK dan menurut status portal, dan total mengikuti saringan', async () => {
    const noNik = await list('admin', '?missingNik=true');
    expect(noNik.items.map((i) => i.name.split(' ')[0])).toEqual(['Lina', 'Rudi', 'Siti']);
    expect(noNik.total).toBe(3);
    expect(noNik.totals.total).toBe(4);
    expect((await list('admin', '?portal=has')).items.map((i) => i.name.split(' ')[0])).toEqual(['Ahmad']);
    expect((await list('admin', '?portal=invited')).items.map((i) => i.name.split(' ')[0])).toEqual(['Siti']);
    expect((await list('admin', '?portal=none')).items.map((i) => i.name.split(' ')[0])).toEqual([
      'Lina',
      'Rudi',
    ]);
    expect((await list('admin', '?portal=none&missingNik=true')).total).toBe(2);
  });

  it('menyaring menurut siswa', async () => {
    const res = await list('admin', `?studentId=${ids.cici}`);
    expect(res.items.map((i) => i.name.split(' ')[0])).toEqual(['Siti']);
  });

  it('mencari menurut nama, nama anak, NIK (angka dengan pemisah), telepon, dan email', async () => {
    const names = (r: Dir) => r.items.map((i) => i.name.split(' ')[0]);
    expect(names(await list('admin', `?q=${encodeURIComponent(`Rudi Wali ${run}`)}`))).toEqual(['Rudi']);
    expect(names(await list('admin', `?q=${encodeURIComponent(`Cici Direktori ${run}`)}`))).toEqual(['Siti']);
    expect(names(await list('admin', `?q=${encodeURIComponent('3201.0101 0101')}`))).toEqual(['Ahmad']);
    expect(names(await list('admin', `?q=${encodeURIComponent('0812-5550-0002')}`))).toEqual(['Siti']);
    expect(names(await list('admin', `?q=${encodeURIComponent(`ahmad-${run}@`)}`))).toEqual(['Ahmad']);
    expect((await list('admin', '?q=tidak-ada-yang-cocok-xyz')).total).toBe(0);
  });

  it('membagi halaman dan menolak batas di luar 1-100', async () => {
    const p1 = await list('admin', q('&limit=3&page=1'));
    const p2 = await list('admin', q('&limit=3&page=2'));
    expect(p1).toMatchObject({ total: 4, page: 1, limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0]?.name).toBe(`Siti Wali ${run}`);
    expect((await call('admin', 'GET', '/v1/guardians/directory?limit=101')).statusCode).toBe(400);
    expect((await call('admin', 'GET', '/v1/guardians/directory?limit=0')).statusCode).toBe(400);
    expect((await call('admin', 'GET', '/v1/guardians/directory?page=0')).statusCode).toBe(400);
    expect((await call('admin', 'GET', '/v1/guardians/directory?portal=lain')).statusCode).toBe(400);
  });

  it('membatasi anak yang ditampilkan 10 tetapi childCount penuh', async () => {
    const wali = await newStudent('Anak Banyak 0');
    const gid = await addGuardian(wali, { name: `Wali Banyak ${run}` });
    for (let i = 1; i <= 11; i++) {
      const sid = await newStudent(`Anak Banyak ${i}`);
      const r = await call('admin', 'POST', `/v1/students/${sid}/guardians`, {
        guardianId: gid,
        relation: 'father',
      });
      expect(r.statusCode).toBe(201);
    }
    const res = await list('admin', `?q=${encodeURIComponent(`Wali Banyak ${run}`)}`);
    expect(res.items[0]?.childCount).toBe(12);
    expect(res.items[0]?.children).toHaveLength(10);
  });

  it('NIK utuh hanya untuk pengelola; pembaca biasa menerima nikMasked', async () => {
    const admin = (await list('admin', q(''))).items.find((i) => i.name.startsWith('Ahmad')) as Item;
    expect(admin.nik).toBe(NIK_A);
    expect(admin.nikMasked).toBe('************0011');
    const reader = await list('reader', q(''));
    const ahmad = reader.items.find((i) => i.name.startsWith('Ahmad')) as Item;
    expect(ahmad.nik).toBeNull();
    expect(ahmad.nikMasked).toBe('************0011');
    expect(JSON.stringify(reader)).not.toContain(NIK_A);
    // Pembaca juga tidak bisa menemukan wali dengan mencari NIK utuh? Pencarian tetap boleh, tetapi tidak membocorkan nilainya.
    const byNik = await list('reader', `?q=${NIK_A}`);
    expect(JSON.stringify(byNik)).not.toContain(NIK_A);
  });

  it('akun tanpa izin student:read (peran wali) ditolak, tanpa login 401', async () => {
    expect((await call('portal', 'GET', '/v1/guardians/directory')).statusCode).toBe(403);
    const anon = await app.inject({
      method: 'GET',
      url: '/v1/guardians/directory',
      headers: { 'x-school-id': schoolId, origin },
    });
    expect(anon.statusCode).toBe(401);
  });
});

describe('DELETE /v1/guardians/:id', () => {
  it('menolak wali yang masih punya siswa (409 guardian_in_use)', async () => {
    const res = await call('admin', 'DELETE', `/v1/guardians/${ids.rudi}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('guardian_in_use');
  });

  it('menolak wali yang punya akun portal walau tanpa siswa', async () => {
    const [g] = await app.platformDb
      .insert(guardian)
      .values({ schoolId, name: `Wali Akun ${run}` })
      .returning();
    const other = await app.platformDb.select().from(member).where(eq(member.id, portalMemberId));
    expect(other).toHaveLength(1);
    // Satu anggota hanya boleh satu tautan portal: pindahkan tautan Ahmad ke wali ini, lalu kembalikan.
    await app.platformDb
      .update(portalLink)
      .set({ guardianId: g!.id })
      .where(eq(portalLink.memberId, portalMemberId));
    const res = await call('admin', 'DELETE', `/v1/guardians/${g!.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('guardian_in_use');
    await app.platformDb
      .update(portalLink)
      .set({ guardianId: ids.ahmad })
      .where(eq(portalLink.memberId, portalMemberId));
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, g!.id))).toHaveLength(1);
  });

  it('menghapus wali tanpa siswa dan akun, termasuk undangannya, dan mencatat audit tanpa NIK', async () => {
    const [g] = await app.platformDb
      .insert(guardian)
      .values({ schoolId, name: `Wali Hapus ${run}`, nik: '3201010101010055' })
      .returning();
    await app.platformDb.insert(portalInvite).values({
      schoolId,
      kind: 'guardian',
      guardianId: g!.id,
      tokenHash: `wd-del-${run}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: userIds[0]!,
    });
    const res = await call('admin', 'DELETE', `/v1/guardians/${g!.id}`);
    expect(res.statusCode).toBe(200);
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, g!.id))).toHaveLength(0);
    const audit = await app.platformDb.execute(
      sql.raw(
        `select details from audit_log where school_id = '${schoolId}' and action = 'guardian.delete' and entity_id = '${g!.id}'`,
      ),
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0])).not.toContain('3201010101010055');
    expect((await call('admin', 'DELETE', `/v1/guardians/${g!.id}`)).statusCode).toBe(404);
  });

  it('tidak bisa menghapus wali sekolah lain (404) dan butuh student:manage (403 untuk pembaca)', async () => {
    const [other] = await app.platformDb.select().from(guardian).where(eq(guardian.schoolId, otherSchoolId));
    expect((await call('admin', 'DELETE', `/v1/guardians/${other!.id}`)).statusCode).toBe(404);
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, other!.id))).toHaveLength(1);
    expect((await call('reader', 'DELETE', `/v1/guardians/${ids.lina}`)).statusCode).toBe(403);
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, ids.lina!))).toHaveLength(1);
  });
});
