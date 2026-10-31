import { schoolCodeFromSlug } from '@edusync/contracts';
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
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SLUG = `smpit-surat-${run}`;
const CODE = schoolCodeFromSlug(SLUG);
const OTHER_CODE = schoolCodeFromSlug(`surat-lain-${run}`);
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
const cookies = { admin: '', principal: '', operator: '', teacher: '', noModule: '', other: '' };
const members = { admin: '', principal: '', operator: '', other: '' };
const ids = { year: '', class7A: '', ani: '', foreignStudent: '' };

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

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Surat', slug: `ys-${run}` })
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
  const make = async (slug: string, name: string, modules: string[]) => {
    const [s] = await db.insert(school).values({ foundationId, slug, name }).returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(SLUG, 'SMP IT Surat', ['administration']);
  noModuleId = await make(`surat-nomod-${run}`, 'Tanpa Modul', []);
  otherId = await make(`surat-lain-${run}`, 'Sekolah Lain', ['administration']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  ids.year = y!.id;
  const [c] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.year, name: '7A', level: '7' })
    .returning();
  ids.class7A = c!.id;
  const [ani] = await db
    .insert(student)
    .values({ schoolId, name: 'Ani Wijaya', nis: 'S1', gender: 'P', status: 'active' })
    .returning();
  ids.ani = ani!.id;
  await db
    .insert(enrollment)
    .values({ schoolId, studentId: ani!.id, classId: ids.class7A, academicYearId: ids.year });
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
  void oy;
  const [fs] = await db
    .insert(student)
    .values({ schoolId: otherId, name: 'Siswa Lain', nis: 'X1', gender: 'L', status: 'active' })
    .returning();
  ids.foreignStudent = fs!.id;

  const admin = await join('admin-surat', schoolId, ['school_admin']);
  const principal = await join('kepsek-surat', schoolId, ['principal']);
  const operator = await join('operator-surat', schoolId, ['operator']);
  const teacher = await join('guru-surat', schoolId, ['teacher']);
  const noModule = await join('admin-tanpa-modul-surat', noModuleId, ['school_admin']);
  const other = await join('admin-surat-lain', otherId, ['school_admin']);
  cookies.admin = admin.cookie;
  cookies.principal = principal.cookie;
  cookies.operator = operator.cookie;
  cookies.teacher = teacher.cookie;
  cookies.noModule = noModule.cookie;
  cookies.other = other.cookie;
  members.admin = admin.memberId;
  members.principal = principal.memberId;
  members.operator = operator.memberId;
  members.other = other.memberId;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'signed_document',
      'letter',
      'letter_counter',
      'letter_setting',
      'letter_template',
      'signer_credential',
      'enrollment',
      'class_room',
      'student',
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

const newLetter = (extra: object = {}, cookie = cookies.admin) =>
  call('POST', '/v1/letters', cookie, {
    direction: 'outgoing',
    subject: 'Keterangan siswa',
    party: 'Dinas Pendidikan',
    letterDate: '2031-03-05',
    ...extra,
  });

describe('modul dan izin', () => {
  it('modul harus aktif, sesi wajib, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/letters', cookies.noModule, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    expect((await app.inject('/v1/letters')).statusCode).toBe(401);
    expect((await call('GET', '/v1/letters', cookies.teacher)).statusCode).toBe(403);
    for (const c of [cookies.admin, cookies.principal, cookies.operator]) {
      expect((await call('GET', '/v1/letters', c)).statusCode).toBe(200);
    }
    // Kepala sekolah hanya membaca dan menandatangani; tidak boleh membuat surat atau templat.
    expect((await newLetter({}, cookies.principal)).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/letters/templates', cookies.principal, { name: 'x', body: 'y' })).statusCode,
    ).toBe(403);
    expect((await call('GET', '/v1/letters/signers', cookies.principal)).statusCode).toBe(200);
  });
});

describe('templat', () => {
  it('templat bawaan hanya bila kosong, CRUD, pengganti tak dikenal, dan hapus in_use', async () => {
    const defaults = await call('POST', '/v1/letters/templates/defaults', cookies.admin);
    expect(defaults.statusCode).toBe(201);
    expect(defaults.json()).toHaveLength(3);
    const again = await call('POST', '/v1/letters/templates/defaults', cookies.admin);
    expect(again.statusCode).toBe(409);
    expect(code(again)).toBe('not_empty');

    const bad = await call('POST', '/v1/letters/templates', cookies.admin, {
      name: 'Salah',
      body: 'Halo {{foo}}',
    });
    expect(bad.statusCode).toBe(400);
    expect(code(bad)).toBe('unknown_placeholder');

    const created = await call('POST', '/v1/letters/templates', cookies.admin, {
      name: 'Uji',
      body: 'Halo {{nama}}',
    });
    expect(created.statusCode).toBe(201);
    const dup = await call('POST', '/v1/letters/templates', cookies.admin, { name: 'Uji', body: 'x' });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('conflict');

    const id = created.json().id as string;
    const put = await call('PUT', `/v1/letters/templates/${id}`, cookies.operator, {
      name: 'Uji 2',
      kind: 'certificate',
      body: 'Halo {{nama}} di {{kelas}}',
      active: true,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().kind).toBe('certificate');

    const used = await newLetter({ templateId: id });
    expect(used.statusCode).toBe(201);
    const del = await call('DELETE', `/v1/letters/templates/${id}`, cookies.admin);
    expect(del.statusCode).toBe(409);
    expect(code(del)).toBe('in_use');
    // Templat tak terpakai bisa dihapus.
    const spare = await call('POST', '/v1/letters/templates', cookies.admin, { name: 'Cadangan', body: 'x' });
    expect((await call('DELETE', `/v1/letters/templates/${spare.json().id}`, cookies.admin)).statusCode).toBe(
      200,
    );

    // Templat nonaktif tidak bisa dipakai surat baru.
    await call('PUT', `/v1/letters/templates/${id}`, cookies.admin, {
      name: 'Uji 2',
      kind: 'certificate',
      body: 'x',
      active: false,
    });
    expect((await newLetter({ templateId: id })).statusCode).toBe(400);
  });
});

describe('penomoran', () => {
  it('berurutan, unik saat dibuat bersamaan, dan terpisah per tahun dan arah', async () => {
    const [a, b] = await Promise.all([
      newLetter({ letterDate: '2032-10-05' }),
      newLetter({ letterDate: '2032-10-06' }),
    ]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const nums = [a.json().number, b.json().number] as string[];
    expect(new Set(nums).size).toBe(2);
    for (const n of nums) expect(n).toMatch(new RegExp(`^00[12]/${CODE}/X/2032$`));
    expect(nums.map((n) => n.slice(0, 3)).sort()).toEqual(['001', '002']);

    const next = await newLetter({ letterDate: '2032-12-01' });
    expect(next.json().number).toBe(`003/${CODE}/XII/2032`);
    // Tahun lain mulai dari 001 lagi.
    expect((await newLetter({ letterDate: '2033-01-02' })).json().number).toBe(`001/${CODE}/I/2033`);
  });

  it('surat masuk: nomor agenda otomatis, nomor pengirim dicatat, disposisi dapat diubah kapan saja', async () => {
    const res = await call('POST', '/v1/letters', cookies.operator, {
      direction: 'incoming',
      number: '045/DIK/2032',
      subject: 'Undangan rapat',
      party: 'Dinas Pendidikan',
      letterDate: '2032-05-05',
      dispositionNote: 'Kepala sekolah',
    });
    expect(res.statusCode).toBe(201);
    const l = res.json();
    expect(l.number).toBe('AG/001/2032');
    expect(l.party).toBe('Dinas Pendidikan');
    expect(l.body).toContain('045/DIK/2032');
    const upd = await call('PUT', `/v1/letters/${l.id}`, cookies.operator, {
      subject: 'Undangan rapat',
      party: 'Dinas Pendidikan',
      letterDate: '2032-05-05',
      dispositionNote: 'Wakil kurikulum',
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().dispositionNote).toBe('Wakil kurikulum');
    // Surat masuk tidak bisa dirender atau ditandatangani.
    expect((await call('POST', `/v1/letters/${l.id}/render`, cookies.admin, {})).statusCode).toBe(409);
    const list = await call('GET', '/v1/letters?direction=incoming&q=undangan', cookies.admin);
    expect(list.json().total).toBeGreaterThanOrEqual(1);
    expect(list.json().items.every((i: { direction: string }) => i.direction === 'incoming')).toBe(true);
  });

  it('draf boleh diubah dan dihapus; rujukan siswa lintas sekolah ditolak', async () => {
    const res = await newLetter({ studentId: ids.ani });
    const id = res.json().id as string;
    expect(res.json().studentName).toBe('Ani Wijaya');
    const upd = await call('PUT', `/v1/letters/${id}`, cookies.admin, {
      subject: 'Baru',
      party: 'Pihak',
      letterDate: '2034-01-01',
      body: 'Isi',
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().subject).toBe('Baru');
    expect(upd.json().number).toBe(res.json().number);
    expect((await call('DELETE', `/v1/letters/${id}`, cookies.admin)).statusCode).toBe(200);
    expect((await call('GET', `/v1/letters/${id}`, cookies.admin)).statusCode).toBe(404);

    const foreign = await newLetter({ studentId: ids.foreignStudent });
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('invalid_reference');
  });
});

describe('render templat', () => {
  it('mengisi variabel siswa, sekolah, nomor, dan penandatangan', async () => {
    const tpl = await call('POST', '/v1/letters/templates', cookies.admin, {
      name: 'Render',
      body: '{{nomor}} | {{nama}} | {{nis}} | {{kelas}} | {{sekolah}} | {{tanggal}} | {{penandatangan}} | {{jabatan}}',
    });
    const signer = await call('POST', '/v1/letters/signers', cookies.admin, {
      memberId: members.admin,
      name: 'Admin Sekolah',
      title: 'Tata Usaha',
    });
    expect(signer.statusCode).toBe(201);
    const l = await newLetter({ templateId: tpl.json().id, studentId: ids.ani, letterDate: '2035-08-17' });
    const out = await call('POST', `/v1/letters/${l.json().id}/render`, cookies.admin, {});
    expect(out.statusCode).toBe(200);
    expect(out.json().text).toBe(
      `${l.json().number} | Ani Wijaya | S1 | 7A | SMP IT Surat | 17 Agustus 2035 | Admin Sekolah | Tata Usaha`,
    );
    const foreign = await call('POST', `/v1/letters/${l.json().id}/render`, cookies.admin, {
      studentId: ids.foreignStudent,
    });
    expect(foreign.statusCode).toBe(400);
  });
});

describe('penandatangan', () => {
  it('daftar tidak memuat gambar; /me dan unggah tanda tangan sendiri', async () => {
    const created = await call('POST', '/v1/letters/signers', cookies.admin, {
      memberId: members.principal,
      name: 'Drs. Kepala',
      nip: '1970',
      title: 'Kepala Sekolah',
      signatureData: PNG,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().hasSignature).toBe(true);
    expect(created.json()).not.toHaveProperty('signatureData');

    const list = await call('GET', '/v1/letters/signers', cookies.operator);
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain('base64');
    for (const s of list.json()) expect(s).not.toHaveProperty('signatureData');

    const me = await call('GET', '/v1/letters/signers/me', cookies.principal);
    expect(me.json().signer.signatureData).toBe(PNG);
    // Operator bukan penandatangan.
    expect((await call('GET', '/v1/letters/signers/me', cookies.operator)).json().signer).toBeNull();

    // Penandatangan mengunggah tanda tangannya sendiri tanpa izin kelola.
    expect(
      (
        await call('PUT', '/v1/letters/signers/me/signature', cookies.principal, { signatureData: null })
      ).json().hasSignature,
    ).toBe(false);
    const up = await call('PUT', '/v1/letters/signers/me/signature', cookies.principal, {
      signatureData: PNG,
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().signatureData).toBe(PNG);
    // Operator tanpa izin tanda tangan ditolak; admin tanpa kredensial ... punya kredensial dari tes render.
    expect(
      (await call('PUT', '/v1/letters/signers/me/signature', cookies.operator, { signatureData: PNG }))
        .statusCode,
    ).toBe(403);

    // Magic bytes, jenis, dan ukuran diperiksa.
    const fake = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
    for (const bad of [fake, 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'bukan-gambar']) {
      const r = await call('PUT', '/v1/letters/signers/me/signature', cookies.principal, {
        signatureData: bad,
      });
      expect(r.statusCode).toBe(400);
      expect(code(r)).toBe('invalid_signature');
    }
    const big = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(160 * 1024)]).toString('base64')}`;
    expect(
      (await call('PUT', '/v1/letters/signers/me/signature', cookies.principal, { signatureData: big }))
        .statusCode,
    ).toBe(400);

    // Anggota sekolah lain tidak bisa dijadikan penandatangan; satu anggota satu kredensial.
    const foreign = await call('POST', '/v1/letters/signers', cookies.admin, {
      memberId: members.other,
      name: 'X',
      title: 'Y',
    });
    expect(foreign.statusCode).toBe(400);
    const dup = await call('POST', '/v1/letters/signers', cookies.admin, {
      memberId: members.principal,
      name: 'Dobel',
      title: 'Y',
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe('tanda tangan, hash, cabut, dan verifikasi publik', () => {
  it('hanya penandatangan sah yang menandatangani; hash sekali; verifikasi publik', async () => {
    const l = await newLetter({ body: 'Isi surat rahasia', letterDate: '2036-02-02' });
    const id = l.json().id as string;
    const number = l.json().number as string;

    // Tanpa izin sign: 403; punya izin sign tetapi tanpa kredensial aktif: 403 not_a_signer.
    expect((await call('POST', `/v1/letters/${id}/sign`, cookies.operator)).statusCode).toBe(403);
    expect((await call('POST', `/v1/letters/${id}/sign`, cookies.teacher)).statusCode).toBe(403);
    const adminCred = (await call('GET', '/v1/letters/signers', cookies.admin))
      .json()
      .find((s: { memberId: string }) => s.memberId === members.admin);
    await call('PUT', `/v1/letters/signers/${adminCred.id}`, cookies.admin, {
      name: adminCred.name,
      title: adminCred.title,
      active: false,
    });
    const inactive = await call('POST', `/v1/letters/${id}/sign`, cookies.admin);
    expect(inactive.statusCode).toBe(403);

    // Belum ditandatangani: tanda tangan 404.
    expect((await call('GET', `/v1/letters/${id}/signature`, cookies.admin)).statusCode).toBe(404);

    const signed = await call('POST', `/v1/letters/${id}/sign`, cookies.principal);
    expect(signed.statusCode).toBe(200);
    const s = signed.json();
    expect(s.token.length).toBeGreaterThanOrEqual(43);
    expect(s.verifyPath).toBe(`/verify/${s.token}`);
    expect(s.signer).toMatchObject({
      name: 'Drs. Kepala',
      title: 'Kepala Sekolah',
      nip: '1970',
      signatureData: PNG,
    });
    expect(s.number).toBe(number);

    // Sekali saja, dan surat yang sudah bertanda tangan terkunci.
    const twice = await call('POST', `/v1/letters/${id}/sign`, cookies.principal);
    expect(twice.statusCode).toBe(409);
    expect(code(twice)).toBe('not_signable');
    const edit = await call('PUT', `/v1/letters/${id}`, cookies.admin, {
      subject: 'x',
      party: 'y',
      letterDate: '2036-02-02',
    });
    expect(code(edit)).toBe('not_draft');
    expect((await call('DELETE', `/v1/letters/${id}`, cookies.admin)).statusCode).toBe(409);

    const info = await call('GET', `/v1/letters/${id}/signature`, cookies.operator);
    expect(info.json()).toMatchObject({ token: s.token, revoked: false, hashRegistered: false });
    expect((await call('GET', `/v1/letters/${id}`, cookies.admin)).json().status).toBe('signed');

    // Hash: format, otorisasi, dan hanya sekali.
    const hashUrl = `/v1/signed-documents/${s.signedDocumentId}/hash`;
    expect((await call('PUT', hashUrl, cookies.principal, { sha256: 'xyz' })).statusCode).toBe(400);
    expect((await call('PUT', hashUrl, cookies.teacher, { sha256: SHA_A })).statusCode).toBe(403);
    const put = await call('PUT', hashUrl, cookies.principal, { sha256: SHA_A.toUpperCase() });
    expect(put.statusCode).toBe(200);
    const putAgain = await call('PUT', hashUrl, cookies.principal, { sha256: SHA_B });
    expect(putAgain.statusCode).toBe(409);
    expect(code(putAgain)).toBe('hash_already_set');
    expect((await call('GET', `/v1/letters/${id}/signature`, cookies.admin)).json().hashRegistered).toBe(
      true,
    );

    // Publik tanpa login.
    const pub = await app.inject(`/v1/public/verify/${s.token}`);
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({
      valid: true,
      status: 'valid',
      number,
      subject: 'Keterangan siswa',
      issuer: { schoolName: 'SMP IT Surat' },
      signer: { name: 'Drs. Kepala', title: 'Kepala Sekolah' },
      hashRegistered: true,
      revokedAt: null,
    });
    expect(pub.body).not.toContain('Isi surat rahasia');

    const check = (sha256: string, token = s.token) =>
      app.inject({
        method: 'POST',
        url: `/v1/public/verify/${token}/check`,
        headers: { 'content-type': 'application/json' },
        payload: { sha256 },
      });
    expect((await check(SHA_A)).json()).toEqual({ match: true });
    expect((await check(SHA_B)).json()).toEqual({ match: false });
    expect((await check(SHA_A, 'token-tak-dikenal')).json()).toEqual({ match: false });

    const unknown = await app.inject('/v1/public/verify/token-tak-dikenal');
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toMatchObject({ valid: false, status: 'unknown', number: null, signedAt: null });

    // Cabut: pengguna biasa ditolak; pengelola atau penandatangan boleh; hanya surat bertanda tangan.
    expect(
      (await call('POST', `/v1/letters/${id}/revoke`, cookies.teacher, { reason: 'salah' })).statusCode,
    ).toBe(403);
    expect((await call('POST', `/v1/letters/${id}/revoke`, cookies.admin, { reason: 'x' })).statusCode).toBe(
      400,
    );
    const revoked = await call('POST', `/v1/letters/${id}/revoke`, cookies.operator, {
      reason: 'Salah ketik nomor',
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ revoked: true, revokedReason: 'Salah ketik nomor' });
    expect((await call('GET', `/v1/letters/${id}`, cookies.admin)).json().status).toBe('revoked');
    const again = await call('POST', `/v1/letters/${id}/revoke`, cookies.admin, { reason: 'lagi' });
    expect(code(again)).toBe('not_signed');

    const after = await app.inject(`/v1/public/verify/${s.token}`);
    expect(after.json()).toMatchObject({
      valid: false,
      status: 'revoked',
      revokedReason: 'Salah ketik nomor',
    });
    expect((await call('GET', '/v1/letters?status=revoked', cookies.admin)).json().total).toBe(1);
  });

  it('penandatangan boleh mencabut suratnya sendiri, tetapi bukan surat orang lain', async () => {
    // Admin mengaktifkan kembali kredensialnya lalu menandatangani surat lain.
    const adminCred = (await call('GET', '/v1/letters/signers', cookies.admin))
      .json()
      .find((s: { memberId: string }) => s.memberId === members.admin);
    await call('PUT', `/v1/letters/signers/${adminCred.id}`, cookies.admin, {
      name: adminCred.name,
      title: adminCred.title,
      active: true,
    });
    const mine = (await newLetter({ letterDate: '2036-03-03' })).json().id as string;
    const theirs = (await newLetter({ letterDate: '2036-03-04' })).json().id as string;
    expect((await call('POST', `/v1/letters/${mine}/sign`, cookies.principal)).statusCode).toBe(200);
    expect((await call('POST', `/v1/letters/${theirs}/sign`, cookies.admin)).statusCode).toBe(200);
    // Kepala sekolah (penandatangan, tanpa izin kelola) mencabut miliknya sendiri; milik admin 403.
    expect(
      (await call('POST', `/v1/letters/${theirs}/revoke`, cookies.principal, { reason: 'bukan milik saya' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/letters/${mine}/revoke`, cookies.principal, { reason: 'salah' })).statusCode,
    ).toBe(200);
    // Penandatangan yang sudah menandatangani tidak bisa dihapus.
    const del = await call('DELETE', `/v1/letters/signers/${adminCred.id}`, cookies.admin);
    expect(code(del)).toBe('in_use');
  });
});

describe('lintas sekolah', () => {
  it('data sekolah lain tidak terlihat dan tidak bisa diubah', async () => {
    const l = (await newLetter({ letterDate: '2037-01-01' })).json();
    expect((await call('GET', `/v1/letters/${l.id}`, cookies.other, undefined, otherId)).statusCode).toBe(
      404,
    );
    expect(
      (await call('POST', `/v1/letters/${l.id}/sign`, cookies.other, undefined, otherId)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'PUT',
          `/v1/letters/${l.id}`,
          cookies.other,
          { subject: 'x', party: 'y', letterDate: '2037-01-01' },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/v1/letters/${l.id}`, cookies.other, undefined, otherId)).statusCode).toBe(
      404,
    );
    const otherList = await call('GET', '/v1/letters', cookies.other, undefined, otherId);
    expect(otherList.json().total).toBe(0);
    expect((await call('GET', '/v1/letters/templates', cookies.other, undefined, otherId)).json()).toEqual(
      [],
    );
    expect((await call('GET', '/v1/letters/signers', cookies.other, undefined, otherId)).json()).toEqual([]);
    // Header sekolah lain tanpa keanggotaan ditolak.
    expect((await call('GET', '/v1/letters', cookies.other, undefined, schoolId)).statusCode).toBe(403);
    // Nomor sekolah lain mandiri.
    const o = await call(
      'POST',
      '/v1/letters',
      cookies.other,
      {
        direction: 'outgoing',
        subject: 's',
        party: 'p',
        letterDate: '2037-01-01',
      },
      otherId,
    );
    expect(o.json().number).toBe(`001/${OTHER_CODE}/I/2037`);
    // Token publik tetap hanya menampilkan sekolah penerbitnya.
    const sg = await call('POST', `/v1/letters/${l.id}/sign`, cookies.principal);
    const pub = await app.inject(`/v1/public/verify/${sg.json().token}`);
    expect(pub.json().issuer.schoolName).toBe('SMP IT Surat');
  });
});

describe('format nomor surat', () => {
  const put = (cookie: string, body: object, sid = schoolId) =>
    call('PUT', '/v1/letters/numbering', cookie, body, sid);
  const incoming = (letterDate: string) =>
    call('POST', '/v1/letters', cookies.admin, {
      direction: 'incoming',
      subject: 'Undangan',
      party: 'Dinas',
      letterDate,
    });

  it('bawaan, izin, dan validasi', async () => {
    const get = await call('GET', '/v1/letters/numbering', cookies.principal);
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({
      schoolCode: null,
      derivedCode: CODE,
      effectiveCode: CODE,
      numberPattern: '{seq}/{code}/{roman}/{year}',
      agendaPattern: 'AG/{seq}/{year}',
    });
    const ok = { schoolCode: 'SMP-1', numberPattern: '{seq}/{code}/{year}', agendaPattern: '{seq}/{year}' };
    expect((await put(cookies.principal, ok)).statusCode).toBe(403);
    expect((await put(cookies.teacher, ok)).statusCode).toBe(403);
    expect(
      (await call('GET', '/v1/letters/numbering', cookies.noModule, undefined, noModuleId)).statusCode,
    ).toBe(403);
    for (const bad of [
      { ...ok, numberPattern: '{code}/{year}' },
      { ...ok, agendaPattern: '' },
      { ...ok, numberPattern: '{seq}/{foo}' },
      { ...ok, agendaPattern: '{seq}/{year' },
    ]) {
      const res = await put(cookies.operator, bad);
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('invalid_pattern');
    }
    const badCode = await put(cookies.operator, { ...ok, schoolCode: 'a/b' });
    expect(badCode.statusCode).toBe(400);
    expect(code(badCode)).toBe('invalid_school_code');
  });

  it('pola dan kode kustom dipakai surat berikutnya; nomor lama tetap; sekolah lain terpisah', async () => {
    const before = await newLetter({ letterDate: '2040-02-03' });
    expect(before.json().number).toBe(`001/${CODE}/II/2040`);

    const saved = await put(cookies.operator, {
      schoolCode: 'smp-1',
      numberPattern: 'No. {seq}/{code}/{month}/{year}',
      agendaPattern: 'AGD-{seq}/{roman}/{year}',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ schoolCode: 'SMP-1', effectiveCode: 'SMP-1', derivedCode: CODE });

    // Urutan melanjutkan penghitung yang ada.
    expect((await newLetter({ letterDate: '2040-03-04' })).json().number).toBe('No. 002/SMP-1/03/2040');
    expect((await incoming('2040-04-01')).json().number).toBe('AGD-001/IV/2040');
    // Nomor yang sudah terbit tidak berubah.
    const old = await call('GET', `/v1/letters/${before.json().id}`, cookies.admin);
    expect(old.json().number).toBe(`001/${CODE}/II/2040`);

    // Sekolah lain tidak ikut berubah.
    const other = await call('GET', '/v1/letters/numbering', cookies.other, undefined, otherId);
    expect(other.json().numberPattern).toBe('{seq}/{code}/{roman}/{year}');
    expect(other.json().schoolCode).toBeNull();

    // Kode kosong kembali ke kode turunan dari alamat sekolah.
    const reset = await put(cookies.operator, {
      schoolCode: null,
      numberPattern: '{seq}/{code}/{roman}/{year}',
      agendaPattern: 'AG/{seq}/{year}',
    });
    expect(reset.json()).toMatchObject({ schoolCode: null, effectiveCode: CODE });
    expect((await newLetter({ letterDate: '2040-05-06' })).json().number).toBe(`003/${CODE}/V/2040`);
  });
});
