import {
  academicYear,
  admissionDocumentType,
  admissionPeriod,
  application,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  guardian,
  member,
  program,
  school,
  seedSchoolRoles,
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

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
const slugs = { main: `spmb-${run}`, noModule: `spmb-nomod-${run}`, other: `spmb-lain-${run}` };
const userIds: string[] = [];
let adminCookie = '';
let operatorCookie = '';
let principalCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
let otherCookie = '';

const ids = {
  year: '',
  foreignYear: '',
  class7A: '',
  foreignClass: '',
  program: '',
  openPeriod: '',
  closedPeriod: '',
  inactivePeriod: '',
  foreignPeriod: '',
};

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
  return login(u.email);
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

// Rute publik dibatasi per IP: tiap pemanggilan memakai IP uji sendiri kecuali tes membatasi diri.
let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 65_536) % 256}.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
};
const pub = (method: 'GET' | 'POST', url: string, payload?: object, remoteAddress = freshIp()) =>
  app.inject({
    method,
    url,
    remoteAddress,
    headers: { origin, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

const pdf = (extra = 64) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(extra, 7)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const doc = (bytes: Buffer, kind = 'kk', fileName = 'berkas.pdf') => ({
  kind,
  fileName,
  dataBase64: bytes.toString('base64'),
});

let nameSeq = 0;
const applyBody = (over: Record<string, unknown> = {}) => {
  nameSeq += 1;
  return {
    periodId: ids.openPeriod,
    fullName: `Calon Siswa ${run} ${nameSeq}`,
    gender: 'P',
    birthPlace: 'Bandung',
    birthDate: '2012-05-17',
    previousSchool: 'SDN 1 Contoh',
    address: 'Jl. Mawar 1',
    guardianName: 'Ibu Calon',
    guardianPhone: '0812-3456-7890',
    guardianEmail: 'Wali@Example.test',
    documents: [],
    website: '',
    ...over,
  };
};
const apply = (over: Record<string, unknown> = {}, slug = slugs.main, ip = freshIp()) =>
  pub('POST', `/v1/public/admission/${slug}/apply`, applyBody(over), ip);

interface Created {
  id: string;
  regNumber: string;
  trackingCode: string;
  fullName: string;
}
async function createApplication(over: Record<string, unknown> = {}): Promise<Created> {
  const body = applyBody(over);
  const res = await pub('POST', `/v1/public/admission/${slugs.main}/apply`, body);
  expect(res.statusCode, res.body).toBe(201);
  const json = res.json() as { regNumber: string; trackingCode: string };
  const list = await call(
    'GET',
    `/v1/admissions/applications?q=${encodeURIComponent(json.regNumber)}`,
    adminCookie,
  );
  const item = (list.json().items as { id: string; regNumber: string }[]).find(
    (i) => i.regNumber === json.regNumber,
  )!;
  return { id: item.id, regNumber: json.regNumber, trackingCode: json.trackingCode, fullName: body.fullName };
}
const setStatus = (id: string, to: string, note?: string, cookie = adminCookie) =>
  call('POST', `/v1/admissions/applications/${id}/status`, cookie, { to, ...(note ? { note } : {}) });
const toAccepted = async (a: Created) => {
  expect((await setStatus(a.id, 'verified')).statusCode).toBe(200);
  expect((await setStatus(a.id, 'accepted', 'Selamat')).statusCode).toBe(200);
};
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

const insertPeriod = async (
  sid: string,
  yearId: string,
  name: string,
  over: Record<string, unknown> = {},
) => {
  const [p] = await app.platformDb
    .insert(admissionPeriod)
    .values({
      schoolId: sid,
      academicYearId: yearId,
      name,
      level: '7',
      opensOn: '2000-01-01',
      closesOn: '2099-12-31',
      ...over,
    })
    .returning();
  return p!.id;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan SPMB', slug: `ys-${run}` })
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
  schoolId = await make(slugs.main, ['admissions']);
  noModuleId = await make(slugs.noModule, []);
  otherId = await make(slugs.other, ['admissions']);

  const year = async (sid: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2000-2099',
        startsOn: '2000-01-01',
        endsOn: '2099-12-31',
        isActive: true,
      })
      .returning();
    return y!.id;
  };
  ids.year = await year(schoolId);
  ids.foreignYear = await year(otherId);
  const [c1] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.year, name: '7A', level: '7' })
    .returning();
  ids.class7A = c1!.id;
  const [c2] = await db
    .insert(classRoom)
    .values({ schoolId: otherId, academicYearId: ids.foreignYear, name: '7A', level: '7' })
    .returning();
  ids.foreignClass = c2!.id;
  const [pr] = await db.insert(program).values({ schoolId, code: 'IPA', name: 'IPA' }).returning();
  ids.program = pr!.id;

  // Sekolah utama: jenis dokumen bawaan tetapi tidak wajib, agar pendaftaran di tes lain tidak perlu melampirkan berkas.
  await db.insert(admissionDocumentType).values(
    [
      ['kk', 'Kartu Keluarga'],
      ['birth_certificate', 'Akta kelahiran'],
      ['previous_certificate', 'Ijazah / SKL'],
      ['photo', 'Pas foto'],
      ['other', 'Lainnya'],
    ].map(([key, label], i) => ({ schoolId, key: key!, label: label!, required: false, sort: i + 1 })),
  );

  ids.openPeriod = await insertPeriod(schoolId, ids.year, 'Gelombang 1');
  ids.closedPeriod = await insertPeriod(schoolId, ids.year, 'Gelombang Lama', {
    opensOn: '2000-01-01',
    closesOn: '2000-12-31',
  });
  ids.inactivePeriod = await insertPeriod(schoolId, ids.year, 'Gelombang Nonaktif', { active: false });
  ids.foreignPeriod = await insertPeriod(otherId, ids.foreignYear, 'Gelombang Sekolah Lain');

  adminCookie = await join('admin-spmb', schoolId, ['school_admin']);
  operatorCookie = await join('operator-spmb', schoolId, ['operator']);
  principalCookie = await join('kepsek-spmb', schoolId, ['principal']);
  teacherCookie = await join('guru-spmb', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul-spmb', noModuleId, ['school_admin']);
  otherCookie = await join('admin-spmb-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'application_document',
      'application_status_log',
      'application',
      'admission_counter',
      'admission_document_type',
      'admission_period',
      'program',
      'student_guardian',
      'guardian',
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

describe('modul dan izin', () => {
  it('modul harus aktif, sesi wajib, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/admissions/periods', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    expect((await app.inject('/v1/admissions/periods')).statusCode).toBe(401);
    expect((await call('GET', '/v1/admissions/periods', teacherCookie)).statusCode).toBe(403);
    for (const cookie of [adminCookie, operatorCookie, principalCookie]) {
      expect((await call('GET', '/v1/admissions/periods', cookie)).statusCode).toBe(200);
      expect((await call('GET', '/v1/admissions/applications', cookie)).statusCode).toBe(200);
      expect((await call('GET', '/v1/admissions/stats', cookie)).statusCode).toBe(200);
    }
    // Kepala sekolah hanya membaca.
    const body = {
      academicYearId: ids.year,
      name: 'Tidak Boleh',
      level: '7',
      opensOn: '2030-01-01',
      closesOn: '2030-02-01',
    };
    expect((await call('POST', '/v1/admissions/periods', principalCookie, body)).statusCode).toBe(403);
    expect(
      (
        await call('POST', '/v1/admissions/applications/bulk-status', principalCookie, {
          ids: [ids.year],
          to: 'verified',
        })
      ).statusCode,
    ).toBe(403);
    // Operator boleh mengelola.
    expect((await call('POST', '/v1/admissions/periods', operatorCookie, body)).statusCode).toBe(201);
  });
});

describe('periode', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    academicYearId: ids.year,
    name: `Periode Uji ${run}`,
    level: '7',
    opensOn: '2030-01-01',
    closesOn: '2030-03-01',
    quota: 30,
    ...over,
  });

  it('validasi tanggal, tahun ajaran, dan nama unik', async () => {
    expect(
      (await call('POST', '/v1/admissions/periods', adminCookie, body({ opensOn: '2030-04-01' }))).statusCode,
    ).toBe(400);
    expect((await call('POST', '/v1/admissions/periods', adminCookie, body({ level: '' }))).statusCode).toBe(
      400,
    );
    expect((await call('POST', '/v1/admissions/periods', adminCookie, body({ quota: 0 }))).statusCode).toBe(
      400,
    );
    const foreign = await call(
      'POST',
      '/v1/admissions/periods',
      adminCookie,
      body({ academicYearId: ids.foreignYear }),
    );
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('invalid_reference');
    const created = await call('POST', '/v1/admissions/periods', adminCookie, body());
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ quota: 30, open: false, applicationCount: 0, quotaUsed: 0 });
    expect((await call('POST', '/v1/admissions/periods', adminCookie, body())).statusCode).toBe(409);
  });

  it('ubah, daftar, dan hapus; hapus ditolak bila ada pendaftar', async () => {
    const created = await call('POST', '/v1/admissions/periods', adminCookie, body({ name: `Ubah ${run}` }));
    const id = created.json().id as string;
    const updated = await call(
      'PUT',
      `/v1/admissions/periods/${id}`,
      adminCookie,
      body({ name: `Ubah ${run}`, quota: null, opensOn: '2000-01-01', closesOn: '2099-01-01' }),
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ quota: null, open: true });
    expect(
      (await call('PUT', `/v1/admissions/periods/${id}`, adminCookie, body({ opensOn: '2031-01-01' })))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('PUT', `/v1/admissions/periods/${crypto.randomUUID()}`, adminCookie, body())).statusCode,
    ).toBe(404);

    const list = await call('GET', '/v1/admissions/periods', adminCookie);
    const names = (list.json() as { name: string }[]).map((p) => p.name);
    expect(names).toContain(`Ubah ${run}`);
    expect(names).not.toContain('Gelombang Sekolah Lain');

    // Periode dengan pendaftar tidak bisa dihapus.
    const withApp = await call(
      'POST',
      '/v1/admissions/periods',
      adminCookie,
      body({ name: `Berisi ${run}` }),
    );
    await insertApplicationDirect(withApp.json().id);
    const blocked = await call('DELETE', `/v1/admissions/periods/${withApp.json().id}`, adminCookie);
    expect(blocked.statusCode).toBe(409);
    expect(code(blocked)).toBe('in_use');

    expect((await call('DELETE', `/v1/admissions/periods/${id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/admissions/periods/${id}`, adminCookie)).statusCode).toBe(404);
  });
});

async function insertApplicationDirect(periodId: string) {
  await app.platformDb.insert(application).values({
    schoolId,
    periodId,
    regNumber: `TEST-${Math.random().toString(36).slice(2, 10)}`,
    trackingCodeHash: 'x',
    fullName: 'Langsung',
    gender: 'L',
    birthDate: '2012-01-01',
    guardianName: 'Wali',
    guardianPhone: '6281200000000',
  });
}

describe('info publik', () => {
  it('hanya sekolah aktif ber-modul; hanya periode yang sedang dibuka', async () => {
    const res = await pub('GET', `/v1/public/admission/${slugs.main}`);
    expect(res.statusCode).toBe(200);
    const json = res.json() as {
      school: { name: string };
      periods: { id: string; open: boolean }[];
      programs: { id: string; name: string }[];
    };
    expect(json.school.name).toBe(`Sekolah ${slugs.main}`);
    const periodIds = json.periods.map((p) => p.id);
    expect(periodIds).toContain(ids.openPeriod);
    expect(periodIds).not.toContain(ids.closedPeriod);
    expect(periodIds).not.toContain(ids.inactivePeriod);
    expect(periodIds).not.toContain(ids.foreignPeriod);
    expect(json.periods.every((p) => p.open)).toBe(true);
    expect(json.programs).toEqual([{ id: ids.program, name: 'IPA' }]);

    expect((await pub('GET', `/v1/public/admission/${slugs.noModule}`)).statusCode).toBe(404);
    const missing = await pub('GET', '/v1/public/admission/tidak-ada-sekolah');
    expect(missing.statusCode).toBe(404);
    expect(code(missing)).toBe('not_found');
  });

  it('sekolah ditangguhkan tidak melayani pendaftaran', async () => {
    await app.platformDb.update(school).set({ status: 'suspended' }).where(eq(school.id, otherId));
    try {
      expect((await pub('GET', `/v1/public/admission/${slugs.other}`)).statusCode).toBe(404);
    } finally {
      await app.platformDb.update(school).set({ status: 'active' }).where(eq(school.id, otherId));
    }
  });
});

describe('pendaftaran publik', () => {
  it('berhasil: nomor berurutan, kode pelacakan acak, dokumen tersimpan dengan mime dari server', async () => {
    const a = await apply({
      programId: ids.program,
      nisn: `00${Math.floor(Math.random() * 1e8)}`,
      documents: [
        doc(pdf(), 'kk', 'kk.pdf'),
        // Nama berekstensi .png tetapi isinya JPEG: mime mengikuti isi berkas.
        doc(jpg(), 'photo', 'foto.png'),
        doc(png(), 'previous_certificate', 'ijazah.jpg'),
      ],
    });
    expect(a.statusCode, a.body).toBe(201);
    const first = a.json() as { regNumber: string; trackingCode: string; status: string };
    expect(first.status).toBe('submitted');
    expect(first.regNumber).toMatch(/^SPMB-\d{4}-\d{4}$/);
    expect(first.trackingCode.replace(/[^A-Z0-9]/g, '').length).toBeGreaterThanOrEqual(10);

    const b = await apply();
    const second = b.json() as { regNumber: string; trackingCode: string };
    const n = (r: string) => Number(r.split('-')[2]);
    expect(n(second.regNumber)).toBe(n(first.regNumber) + 1);
    expect(second.trackingCode).not.toBe(first.trackingCode);

    const list = await call('GET', `/v1/admissions/applications?q=${first.regNumber}`, adminCookie);
    const item = list.json().items[0] as Record<string, unknown>;
    expect(item).toMatchObject({
      regNumber: first.regNumber,
      guardianPhone: '6281234567890',
      documentCount: 3,
      programName: 'IPA',
      status: 'submitted',
    });
    const detail = await call('GET', `/v1/admissions/applications/${item.id}`, adminCookie);
    const d = detail.json() as {
      documents: { mime: string; fileName: string; id: string }[];
      guardianEmail: string;
    };
    expect(d.guardianEmail).toBe('wali@example.test');
    expect(d.documents.map((x) => x.mime).sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
    expect(detail.json().log).toHaveLength(1);
  });

  it('honeypot terisi: balasan sukses palsu tanpa menyimpan', async () => {
    const before = (await call('GET', '/v1/admissions/applications', adminCookie)).json().total as number;
    const res = await apply({ website: 'http://spam.example', fullName: `Bot ${run}` });
    expect(res.statusCode).toBe(201);
    expect(res.json().regNumber).toMatch(/^SPMB-\d{4}-\d{4}$/);
    const after = (await call('GET', '/v1/admissions/applications', adminCookie)).json().total as number;
    expect(after).toBe(before);
    const search = await call(
      'GET',
      `/v1/admissions/applications?q=${encodeURIComponent(`Bot ${run}`)}`,
      adminCookie,
    );
    expect(search.json().total).toBe(0);
  });

  it('menolak berkas yang magic bytes-nya salah, terlalu besar, atau terlalu banyak', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const fake = await apply({ documents: [doc(html, 'other', 'surat.pdf')] });
    expect(fake.statusCode).toBe(400);
    expect(code(fake)).toBe('invalid_file_type');
    const gif = await apply({ documents: [doc(Buffer.from('GIF89a....'), 'photo', 'a.png')] });
    expect(code(gif)).toBe('invalid_file_type');
    const notBase64 = await apply({ documents: [{ kind: 'other', fileName: 'x.pdf', dataBase64: '###' }] });
    expect(notBase64.statusCode).toBe(400);

    const big = await apply({ documents: [doc(pdf(2 * 1024 * 1024 + 1 - 9), 'other', 'besar.pdf')] });
    expect(big.statusCode).toBe(413);
    expect(code(big)).toBe('file_too_large');
    // Tepat 2 MB masih diterima.
    const exact = await apply({ documents: [doc(pdf(2 * 1024 * 1024 - 9), 'other', 'pas.pdf')] });
    expect(exact.statusCode, exact.body).toBe(201);

    const many = await apply({ documents: Array.from({ length: 9 }, () => doc(pdf())) });
    expect(many.statusCode).toBe(400);
  });

  it('periode tutup, nonaktif, tidak ada, atau milik sekolah lain', async () => {
    const closed = await apply({ periodId: ids.closedPeriod });
    expect(closed.statusCode).toBe(409);
    expect(code(closed)).toBe('period_closed');
    expect(code(await apply({ periodId: ids.inactivePeriod }))).toBe('period_closed');
    expect((await apply({ periodId: crypto.randomUUID() })).statusCode).toBe(404);
    // Periode sekolah lain lewat slug kita tidak bocor dan tidak bisa dipakai.
    expect((await apply({ periodId: ids.foreignPeriod })).statusCode).toBe(404);
    expect((await apply({}, slugs.noModule)).statusCode).toBe(404);
    expect((await apply({}, 'tidak-ada')).statusCode).toBe(404);
  });

  it('validasi isian dan duplikat nama + tanggal lahir dalam periode', async () => {
    expect((await apply({ guardianPhone: 'abc' })).statusCode).toBe(400);
    expect((await apply({ birthDate: '17-05-2012' })).statusCode).toBe(400);
    expect((await apply({ gender: 'X' })).statusCode).toBe(400);
    expect((await apply({ guardianEmail: 'bukan-email' })).statusCode).toBe(400);
    expect((await apply({ programId: crypto.randomUUID() })).statusCode).toBe(400);

    const name = `Rina Duplikat ${run}`;
    expect((await apply({ fullName: name })).statusCode).toBe(201);
    const dup = await apply({ fullName: `  ${name.toUpperCase()}  ` });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('duplicate_application');
    // Tanggal lahir lain bukan duplikat.
    expect((await apply({ fullName: name, birthDate: '2012-05-18' })).statusCode).toBe(201);
  });

  it('pendaftaran serentak mendapat nomor unik', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => apply()));
    for (const r of results) expect(r.statusCode, r.body).toBe(201);
    const regs = results.map((r) => r.json().regNumber as string);
    expect(new Set(regs).size).toBe(6);
  });

  it('rate limit ketat per IP: pendaftaran ke-6 dalam sejam ditolak', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      const res = await apply({ website: 'bot' }, slugs.main, ip);
      expect(res.statusCode).toBe(201);
    }
    const limited = await apply({ website: 'bot' }, slugs.main, ip);
    expect(limited.statusCode).toBe(429);
    // IP lain tidak terpengaruh.
    expect((await apply({ website: 'bot' })).statusCode).toBe(201);
  });
});

describe('cek status publik', () => {
  it('benar dan salah dijawab seragam', async () => {
    const a = await createApplication();
    const ok = await pub('POST', '/v1/public/admission/status', {
      slug: slugs.main,
      regNumber: a.regNumber,
      trackingCode: a.trackingCode,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({
      regNumber: a.regNumber,
      fullName: a.fullName,
      status: 'submitted',
      decisionNote: null,
    });
    expect(typeof ok.json().updatedAt).toBe('string');

    // Huruf kecil dan tanpa tanda hubung tetap dikenali.
    const loose = await pub('POST', '/v1/public/admission/status', {
      slug: slugs.main,
      regNumber: a.regNumber.toLowerCase(),
      trackingCode: a.trackingCode.replace('-', '').toLowerCase(),
    });
    expect(loose.statusCode).toBe(200);

    const attempts = [
      { slug: slugs.main, regNumber: a.regNumber, trackingCode: 'SALAH-SALAH' },
      { slug: slugs.main, regNumber: 'SPMB-2099-9999', trackingCode: a.trackingCode },
      { slug: slugs.other, regNumber: a.regNumber, trackingCode: a.trackingCode },
      { slug: 'tidak-ada', regNumber: a.regNumber, trackingCode: a.trackingCode },
      { slug: slugs.noModule, regNumber: a.regNumber, trackingCode: a.trackingCode },
    ];
    const bodies = new Set<string>();
    for (const body of attempts) {
      const res = await pub('POST', '/v1/public/admission/status', body);
      expect(res.statusCode).toBe(404);
      expect(code(res)).toBe('not_found');
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
  });

  it('keputusan dan catatan tampil ke pendaftar', async () => {
    const a = await createApplication();
    await toAccepted(a);
    const res = await pub('POST', '/v1/public/admission/status', {
      slug: slugs.main,
      regNumber: a.regNumber,
      trackingCode: a.trackingCode,
    });
    expect(res.json()).toMatchObject({ status: 'accepted', decisionNote: 'Selamat' });
  });

  it('rate limit: pengecekan ke-21 dalam sejam ditolak', async () => {
    const ip = freshIp();
    const body = { slug: slugs.main, regNumber: 'SPMB-2000-0001', trackingCode: 'AAAAAAAAAA' };
    for (let i = 0; i < 20; i++) {
      expect((await pub('POST', '/v1/public/admission/status', body, ip)).statusCode).toBe(404);
    }
    expect((await pub('POST', '/v1/public/admission/status', body, ip)).statusCode).toBe(429);
  });
});

describe('daftar, detail, dan dokumen (admin)', () => {
  it('daftar tanpa data dokumen; saringan dan hitungan per status', async () => {
    const tag = `Saring ${run}`;
    const a = await createApplication({ fullName: `${tag} Satu`, documents: [doc(pdf())] });
    const b = await createApplication({ fullName: `${tag} Dua` });
    expect((await setStatus(b.id, 'verified')).statusCode).toBe(200);

    const res = await call('GET', `/v1/admissions/applications?q=${encodeURIComponent(tag)}`, adminCookie);
    expect(res.statusCode).toBe(200);
    const json = res.json() as {
      items: Record<string, unknown>[];
      total: number;
      counts: Record<string, number>;
    };
    expect(json.total).toBe(2);
    expect(json.counts).toMatchObject({ submitted: 1, verified: 1, accepted: 0 });
    expect(res.body).not.toContain('dataBase64');
    expect(Object.keys(json.items[0]!).sort()).toEqual(
      [
        'birthDate',
        'createdAt',
        'documentCount',
        'fullName',
        'gender',
        'guardianName',
        'guardianPhone',
        'id',
        'previousSchool',
        'programName',
        'regNumber',
        'status',
      ].sort(),
    );

    const onlyVerified = await call(
      'GET',
      `/v1/admissions/applications?q=${encodeURIComponent(tag)}&status=verified`,
      adminCookie,
    );
    expect(onlyVerified.json().total).toBe(1);
    expect(onlyVerified.json().counts).toMatchObject({ submitted: 1, verified: 1 });
    const paged = await call(
      'GET',
      `/v1/admissions/applications?q=${encodeURIComponent(tag)}&limit=1&offset=1&periodId=${ids.openPeriod}`,
      adminCookie,
    );
    expect(paged.json().items).toHaveLength(1);
    expect(paged.json().total).toBe(2);
    expect(
      (await call('GET', `/v1/admissions/applications?periodId=${ids.closedPeriod}`, adminCookie)).json()
        .total,
    ).toBe(0);

    // Detail: metadata dokumen tanpa isi; unduh memberi byte yang sama.
    const detail = await call('GET', `/v1/admissions/applications/${a.id}`, adminCookie);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain('dataBase64');
    const docMeta = detail.json().documents[0] as { id: string; size: number; mime: string };
    expect(docMeta.mime).toBe('application/pdf');
    const file = await call(
      'GET',
      `/v1/admissions/applications/${a.id}/documents/${docMeta.id}`,
      adminCookie,
    );
    expect(file.statusCode).toBe(200);
    expect(file.json()).toMatchObject({
      fileName: 'berkas.pdf',
      mime: 'application/pdf',
      size: docMeta.size,
    });
    expect(Buffer.from(file.json().dataBase64, 'base64').equals(pdf())).toBe(true);
    // Dokumen milik pendaftar lain tidak bisa diambil lewat id pendaftar ini.
    expect(
      (await call('GET', `/v1/admissions/applications/${b.id}/documents/${docMeta.id}`, adminCookie))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/admissions/applications/${crypto.randomUUID()}`, adminCookie)).statusCode,
    ).toBe(404);
  });
});

describe('transisi status', () => {
  it('hanya peralihan sah, tercatat di log, banding dari rejected', async () => {
    const a = await createApplication();
    const skip = await setStatus(a.id, 'accepted');
    expect(skip.statusCode).toBe(409);
    expect(code(skip)).toBe('invalid_transition');
    expect(code(await setStatus(a.id, 'submitted'))).toBe('invalid_transition');
    expect((await setStatus(a.id, 'verified')).statusCode).toBe(200);
    // enrolled hanya lewat /enroll.
    expect(code(await setStatus(a.id, 'enrolled'))).toBe('use_enroll');
    const rejected = await setStatus(a.id, 'rejected', 'Berkas kurang');
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({ status: 'rejected', decisionNote: 'Berkas kurang' });
    expect(code(await setStatus(a.id, 'accepted'))).toBe('invalid_transition');
    const appeal = await setStatus(a.id, 'verified', 'Banding diterima');
    expect(appeal.statusCode).toBe(200);
    const log = appeal.json().log as { fromStatus: string | null; toStatus: string; note: string | null }[];
    expect(log.map((l) => `${l.fromStatus}>${l.toStatus}`)).toEqual([
      'null>submitted',
      'submitted>verified',
      'verified>rejected',
      'rejected>verified',
    ]);
    expect((await setStatus(a.id, 'withdrawn')).statusCode).toBe(200);
    // Terminal.
    expect(code(await setStatus(a.id, 'verified'))).toBe('invalid_transition');
    expect((await setStatus(crypto.randomUUID(), 'verified')).statusCode).toBe(404);
    // Kepala sekolah tidak boleh mengubah.
    expect((await setStatus(a.id, 'verified', undefined, principalCookie)).statusCode).toBe(403);
  });

  it('kuota: pendaftar diterima melebihi kuota ditolak, juga pada bulk', async () => {
    const pid = await insertPeriod(schoolId, ids.year, `Berkuota ${run}`, { quota: 2 });
    const mk = () => createApplication({ periodId: pid });
    const [a, b, c, d] = [await mk(), await mk(), await mk(), await mk()];
    for (const x of [a, b, c, d]) expect((await setStatus(x.id, 'verified')).statusCode).toBe(200);
    expect((await setStatus(a.id, 'accepted')).statusCode).toBe(200);
    expect((await setStatus(b.id, 'accepted')).statusCode).toBe(200);
    const full = await setStatus(c.id, 'accepted');
    expect(full.statusCode).toBe(409);
    expect(code(full)).toBe('quota_full');

    const bulk = await call('POST', '/v1/admissions/applications/bulk-status', adminCookie, {
      ids: [c.id, d.id],
      to: 'accepted',
    });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json()).toMatchObject({ updated: 0, failed: 2 });
    expect(bulk.json().results.map((r: { code: string }) => r.code)).toEqual(['quota_full', 'quota_full']);

    // Menolak satu yang diterima membebaskan kuota.
    expect((await setStatus(b.id, 'rejected')).statusCode).toBe(200);
    expect((await setStatus(c.id, 'accepted')).statusCode).toBe(200);
    const stats = await call('GET', `/v1/admissions/stats?periodId=${pid}`, adminCookie);
    expect(stats.json().quota).toEqual({ total: 2, used: 2 });
    const periods = await call('GET', '/v1/admissions/periods', adminCookie);
    expect((periods.json() as { id: string; quotaUsed: number }[]).find((p) => p.id === pid)!.quotaUsed).toBe(
      2,
    );
  });

  it('bulk: sebagian berhasil, sisanya dilaporkan; batas 200 id', async () => {
    const a = await createApplication();
    const b = await createApplication();
    const c = await createApplication();
    await setStatus(c.id, 'verified');
    await setStatus(c.id, 'accepted');
    const ghost = crypto.randomUUID();
    const res = await call('POST', '/v1/admissions/applications/bulk-status', adminCookie, {
      ids: [a.id, b.id, c.id, ghost, a.id],
      to: 'verified',
      note: 'Massal',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ updated: 2, failed: 2 });
    const byId = new Map(
      (res.json().results as { id: string; ok: boolean; code: string | null }[]).map((r) => [r.id, r]),
    );
    expect(byId.get(a.id)).toMatchObject({ ok: true });
    expect(byId.get(c.id)).toMatchObject({ ok: false, code: 'invalid_transition' });
    expect(byId.get(ghost)).toMatchObject({ ok: false, code: 'not_found' });
    expect((await call('GET', `/v1/admissions/applications/${b.id}`, adminCookie)).json().status).toBe(
      'verified',
    );

    const tooMany = await call('POST', '/v1/admissions/applications/bulk-status', adminCookie, {
      ids: Array.from({ length: 201 }, () => crypto.randomUUID()),
      to: 'verified',
    });
    expect(tooMany.statusCode).toBe(400);
    expect(
      (
        await call('POST', '/v1/admissions/applications/bulk-status', adminCookie, {
          ids: [],
          to: 'verified',
        })
      ).statusCode,
    ).toBe(400);
    const enrolled = await call('POST', '/v1/admissions/applications/bulk-status', adminCookie, {
      ids: [a.id],
      to: 'enrolled',
    });
    expect(enrolled.json().results[0].code).toBe('use_enroll');
  });
});

describe('daftar ulang (enroll)', () => {
  it('membuat siswa, wali utama, dan penempatan kelas dalam satu transaksi', async () => {
    const nisn = `99${Math.floor(Math.random() * 1e8)}`;
    const a = await createApplication({ nisn, guardianName: 'Bapak Daftar Ulang' });
    // Belum diterima: ditolak.
    const early = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {});
    expect(early.statusCode).toBe(409);
    expect(code(early)).toBe('invalid_transition');
    await toAccepted(a);

    const res = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {
      classId: ids.class7A,
    });
    expect(res.statusCode, res.body).toBe(200);
    const out = res.json() as { studentId: string; guardianId: string; status: string; classId: string };
    expect(out).toMatchObject({ status: 'enrolled', classId: ids.class7A });

    const [s] = await app.platformDb.select().from(student).where(eq(student.id, out.studentId));
    expect(s).toMatchObject({
      schoolId,
      name: a.fullName,
      nisn,
      gender: 'P',
      birthDate: '2012-05-17',
      status: 'active',
    });
    const [g] = await app.platformDb.select().from(guardian).where(eq(guardian.id, out.guardianId));
    expect(g).toMatchObject({
      name: 'Bapak Daftar Ulang',
      phone: '6281234567890',
      email: 'wali@example.test',
    });
    const links = await app.platformDb
      .select()
      .from(studentGuardian)
      .where(eq(studentGuardian.studentId, out.studentId));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ guardianId: out.guardianId, isPrimary: true });
    const enr = await app.platformDb.select().from(enrollment).where(eq(enrollment.studentId, out.studentId));
    expect(enr).toHaveLength(1);
    expect(enr[0]).toMatchObject({ classId: ids.class7A, academicYearId: ids.year });

    const detail = await call('GET', `/v1/admissions/applications/${a.id}`, adminCookie);
    expect(detail.json()).toMatchObject({ status: 'enrolled', studentId: out.studentId });
    const students = await call('GET', `/v1/students?q=${encodeURIComponent(a.fullName)}`, adminCookie);
    expect(students.json().items[0]).toMatchObject({ id: out.studentId, className: '7A' });

    // Tidak bisa dua kali.
    const again = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {});
    expect(again.statusCode).toBe(409);
    expect(code(again)).toBe('invalid_transition');
    expect(
      (await call('POST', `/v1/admissions/applications/${a.id}/enroll`, principalCookie, {})).statusCode,
    ).toBe(403);
  });

  it('tanpa kelas: siswa dibuat tanpa penempatan; body kosong {} diterima', async () => {
    const a = await createApplication();
    await toAccepted(a);
    const res = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().classId).toBeNull();
    const enr = await app.platformDb
      .select()
      .from(enrollment)
      .where(eq(enrollment.studentId, res.json().studentId));
    expect(enr).toHaveLength(0);
    // Siswa tanpa NISN pun bisa dibuat.
    const [s] = await app.platformDb.select().from(student).where(eq(student.id, res.json().studentId));
    expect(s!.nisn).toBeNull();
  });

  it('NISN bentrok: 409 nisn_taken dan tidak ada yang tersisa', async () => {
    const nisn = `88${Math.floor(Math.random() * 1e8)}`;
    await app.platformDb.insert(student).values({ schoolId, name: `Siswa Lama ${run}`, nisn, gender: 'L' });
    const a = await createApplication({ nisn, guardianName: `Wali Bentrok ${run}` });
    await toAccepted(a);
    const res = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {});
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('nisn_taken');
    const detail = await call('GET', `/v1/admissions/applications/${a.id}`, adminCookie);
    expect(detail.json()).toMatchObject({ status: 'accepted', studentId: null });
    const gs = await app.platformDb
      .select()
      .from(guardian)
      .where(eq(guardian.name, `Wali Bentrok ${run}`));
    expect(gs).toHaveLength(0);
  });

  it('atomik: kegagalan di tengah (kelas tidak valid) membatalkan siswa dan wali', async () => {
    const a = await createApplication({ guardianName: `Wali Atomik ${run}` });
    await toAccepted(a);
    // Kelas milik sekolah lain: tidak terlihat (RLS), penempatan gagal setelah siswa dan wali dibuat.
    const res = await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {
      classId: ids.foreignClass,
    });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('invalid_reference');
    const students = await app.platformDb.select().from(student).where(eq(student.name, a.fullName));
    expect(students).toHaveLength(0);
    const gs = await app.platformDb
      .select()
      .from(guardian)
      .where(eq(guardian.name, `Wali Atomik ${run}`));
    expect(gs).toHaveLength(0);
    const detail = await call('GET', `/v1/admissions/applications/${a.id}`, adminCookie);
    expect(detail.json()).toMatchObject({ status: 'accepted', studentId: null });
    expect(detail.json().log.map((l: { toStatus: string }) => l.toStatus)).not.toContain('enrolled');
    // Setelah dikoreksi, daftar ulang berhasil.
    expect(
      (
        await call('POST', `/v1/admissions/applications/${a.id}/enroll`, adminCookie, {
          classId: ids.class7A,
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe('statistik', () => {
  it('jumlah per status, 14 hari, dan kuota', async () => {
    const res = await call('GET', '/v1/admissions/stats', adminCookie);
    expect(res.statusCode).toBe(200);
    const json = res.json() as {
      total: number;
      counts: Record<string, number>;
      perDay: { date: string; count: number }[];
      quota: { total: number | null; used: number };
    };
    expect(json.perDay).toHaveLength(14);
    const dates = json.perDay.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(json.total).toBe(Object.values(json.counts).reduce((x, y) => x + y, 0));
    expect(json.counts.enrolled).toBeGreaterThanOrEqual(2);
    expect(json.quota.used).toBe((json.counts.accepted ?? 0) + (json.counts.enrolled ?? 0));
    // Pendaftaran baru dibuat dalam tes ini: semuanya jatuh pada 14 hari terakhir.
    const periodTotal = (
      await call('GET', `/v1/admissions/stats?periodId=${ids.openPeriod}`, adminCookie)
    ).json();
    const sum = (periodTotal.perDay as { count: number }[]).reduce((x, y) => x + y.count, 0);
    expect(sum).toBe(periodTotal.total);
    expect(periodTotal.quota.total).toBeNull();
  });
});

describe('isolasi antar sekolah', () => {
  it('admin sekolah lain tidak melihat atau mengubah pendaftar kita', async () => {
    const a = await createApplication();
    const detail = await call('GET', `/v1/admissions/applications/${a.id}`, otherCookie, undefined, otherId);
    expect(detail.statusCode).toBe(404);
    expect(
      (
        await call(
          'POST',
          `/v1/admissions/applications/${a.id}/status`,
          otherCookie,
          { to: 'verified' },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/admissions/applications/${a.id}/enroll`, otherCookie, {}, otherId)).statusCode,
    ).toBe(404);
    const list = await call('GET', '/v1/admissions/applications', otherCookie, undefined, otherId);
    expect(list.json().total).toBe(0);
    const bulk = await call(
      'POST',
      '/v1/admissions/applications/bulk-status',
      otherCookie,
      { ids: [a.id], to: 'verified' },
      otherId,
    );
    expect(bulk.json().results[0].code).toBe('not_found');
    expect(
      (await call('GET', '/v1/admissions/applications', otherCookie, undefined, schoolId)).statusCode,
    ).toBe(403);
    // Status tetap submitted.
    expect((await call('GET', `/v1/admissions/applications/${a.id}`, adminCookie)).json().status).toBe(
      'submitted',
    );
    // Periode sekolah lain tidak muncul di daftar kita dan tidak bisa diubah/dihapus.
    expect(
      (await call('DELETE', `/v1/admissions/periods/${ids.foreignPeriod}`, adminCookie)).statusCode,
    ).toBe(404);
  });
});

describe('jenis dokumen dinamis', () => {
  const types = (cookie = adminCookie, sid = schoolId) =>
    call('GET', '/v1/admissions/document-types', cookie, undefined, sid);
  const info = (slug: string) => pub('GET', `/v1/public/admission/${slug}`);

  it('sekolah tanpa baris diisi bawaan secara malas; publik hanya melihat yang aktif', async () => {
    const list = await types(otherCookie, otherId);
    expect(list.statusCode).toBe(200);
    expect(list.json().map((t: { key: string }) => t.key)).toEqual([
      'kk',
      'birth_certificate',
      'previous_certificate',
      'photo',
      'other',
    ]);
    expect(list.json().filter((t: { required: boolean }) => t.required)).toHaveLength(3);
    expect((await info(slugs.other)).json().documentTypes).toHaveLength(5);
    expect((await types(teacherCookie)).statusCode).toBe(403);
    expect((await types(noModuleCookie, noModuleId)).statusCode).toBe(403);
  });

  it('CRUD, izin, validasi, dan hapus ditolak bila dipakai', async () => {
    const body = { key: 'rapor', label: 'Rapor terakhir', required: false, sort: 9 };
    expect((await call('POST', '/v1/admissions/document-types', principalCookie, body)).statusCode).toBe(403);
    const made = await call('POST', '/v1/admissions/document-types', adminCookie, body);
    expect(made.statusCode).toBe(201);
    const id = made.json().id as string;
    expect((await call('POST', '/v1/admissions/document-types', adminCookie, body)).statusCode).toBe(409);
    expect(
      (await call('POST', '/v1/admissions/document-types', adminCookie, { ...body, key: 'Bad Key' }))
        .statusCode,
    ).toBe(400);
    // Batas jumlah jenis (5 bawaan + rapor = 6; tambah sampai 8 lalu ke-9 ditolak).
    for (const k of ['a1', 'a2']) {
      expect(
        (await call('POST', '/v1/admissions/document-types', adminCookie, { ...body, key: k })).statusCode,
      ).toBe(201);
    }
    const over = await call('POST', '/v1/admissions/document-types', adminCookie, { ...body, key: 'a3' });
    expect(over.statusCode).toBe(400);
    expect(code(over)).toBe('limit_reached');

    // Tampil di formulir publik, lalu dipakai sehingga tidak bisa dihapus.
    expect((await info(slugs.main)).json().documentTypes.map((t: { key: string }) => t.key)).toContain(
      'rapor',
    );
    expect((await apply({ documents: [doc(pdf(), 'rapor', 'rapor.pdf')] })).statusCode).toBe(201);
    const del = await call('DELETE', `/v1/admissions/document-types/${id}`, adminCookie);
    expect(del.statusCode).toBe(409);
    expect(code(del)).toBe('in_use');

    const off = await call('PUT', `/v1/admissions/document-types/${id}`, adminCookie, {
      label: 'Rapor',
      required: false,
      active: false,
      sort: 9,
    });
    expect(off.json().active).toBe(false);
    expect((await info(slugs.main)).json().documentTypes.map((t: { key: string }) => t.key)).not.toContain(
      'rapor',
    );
    const gone = await apply({ documents: [doc(pdf(), 'rapor', 'rapor.pdf')] });
    expect(code(gone)).toBe('invalid_reference');
    expect(
      (await call('DELETE', `/v1/admissions/document-types/${id}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    for (const k of ['a1', 'a2']) {
      const row = (await types()).json().find((t: { key: string }) => t.key === k);
      expect((await call('DELETE', `/v1/admissions/document-types/${row.id}`, adminCookie)).statusCode).toBe(
        200,
      );
    }
  });

  it('jenis wajib harus ada sebelum kirim', async () => {
    const all = (await types()).json() as { id: string; key: string; label: string }[];
    const kk = all.find((t) => t.key === 'kk')!;
    const set = (required: boolean) =>
      call('PUT', `/v1/admissions/document-types/${kk.id}`, adminCookie, {
        label: kk.label,
        required,
        active: true,
        sort: 1,
      });
    expect((await set(true)).json().required).toBe(true);
    const missing = await apply({ documents: [doc(pdf(), 'photo', 'foto.pdf')] });
    expect(missing.statusCode).toBe(400);
    expect(code(missing)).toBe('document_required');
    expect(missing.json().error.message).toContain('Kartu Keluarga');
    expect((await apply({ documents: [doc(pdf(), 'kk', 'kk.pdf')] })).statusCode).toBe(201);
    await set(false);
    expect((await apply()).statusCode).toBe(201);
  });
});
