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

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
const cookies = {
  admin: '',
  operator: '',
  principal: '',
  sup: '',
  otherTeacher: '',
  noModule: '',
  other: '',
};
const ids = {
  year: '',
  class: '',
  ani: '',
  budi: '',
  citra: '',
  dewi: '',
  foreign: '',
  supTeacher: '',
  otherTeacher: '',
  pOpen: '',
  pPast: '',
  partnerA: '',
  partnerB: '',
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
const pub = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    ...(payload ? { headers: { 'content-type': 'application/json' }, payload } : {}),
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
    .values({ name: 'Yayasan PKL', slug: `ypkl-${run}` })
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
  schoolId = await make(`smk-pkl-${run}`, 'SMK PKL Uji', ['internship']);
  noModuleId = await make(`pkl-nomod-${run}`, 'Tanpa Modul', []);
  otherId = await make(`pkl-lain-${run}`, 'Sekolah Lain PKL', ['internship']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  ids.year = y!.id;
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
  const [c] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.year, name: 'XI RPL', level: '11' })
    .returning();
  ids.class = c!.id;
  const names: [keyof typeof ids, string, string][] = [
    ['ani', 'Ani Wijaya', 'P1'],
    ['budi', 'Budi Santoso', 'P2'],
    ['citra', 'Citra Lestari', 'P3'],
    ['dewi', 'Dewi Anggraini', 'P4'],
  ];
  for (const [key, name, nis] of names) {
    const [s] = await db
      .insert(student)
      .values({ schoolId, name, nis, gender: 'P', status: 'active' })
      .returning();
    ids[key] = s!.id;
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: ids.class, academicYearId: ids.year });
  }
  const [fs] = await db
    .insert(student)
    .values({ schoolId: otherId, name: 'Siswa Lain', nis: 'X1', gender: 'L', status: 'active' })
    .returning();
  ids.foreign = fs!.id;
  void oy;

  const admin = await join('admin-pkl', schoolId, ['school_admin']);
  const operator = await join('operator-pkl', schoolId, ['operator']);
  const principal = await join('kepsek-pkl', schoolId, ['principal']);
  const sup = await join('pembimbing-pkl', schoolId, ['teacher']);
  const otherTeacher = await join('guru-lain-pkl', schoolId, ['teacher']);
  const noModule = await join('admin-nomod-pkl', noModuleId, ['school_admin']);
  const other = await join('admin-lain-pkl', otherId, ['school_admin']);
  Object.assign(cookies, {
    admin: admin.cookie,
    operator: operator.cookie,
    principal: principal.cookie,
    sup: sup.cookie,
    otherTeacher: otherTeacher.cookie,
    noModule: noModule.cookie,
    other: other.cookie,
  });
  const [t1] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Pembimbing', memberId: sup.memberId })
    .returning();
  const [t2] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Guru Lain', memberId: otherTeacher.memberId })
    .returning();
  ids.supTeacher = t1!.id;
  ids.otherTeacher = t2!.id;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'pkl_setting',
      'pkl_score',
      'pkl_visit',
      'pkl_journal',
      'pkl_placement',
      'pkl_aspect',
      'pkl_period',
      'pkl_partner',
      'teacher',
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
  it('modul harus aktif, sesi wajib, dan read berbeda dari manage', async () => {
    const blocked = await call('GET', '/v1/pkl/partners', cookies.noModule, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    expect((await app.inject('/v1/pkl/partners')).statusCode).toBe(401);
    for (const c of [cookies.admin, cookies.operator, cookies.principal, cookies.sup]) {
      expect((await call('GET', '/v1/pkl/partners', c)).statusCode).toBe(200);
    }
    // Kepala sekolah dan guru hanya membaca.
    for (const c of [cookies.principal, cookies.sup]) {
      expect((await call('POST', '/v1/pkl/partners', c, { name: 'X' })).statusCode).toBe(403);
      expect((await call('POST', '/v1/pkl/aspects/defaults', c)).statusCode).toBe(403);
    }
  });
});

describe('mitra dan periode', () => {
  it('CRUD mitra, nama unik, dan validasi', async () => {
    const a = await call('POST', '/v1/pkl/partners', cookies.admin, {
      name: 'PT Teknologi Maju',
      field: 'TI',
      email: 'HRD@Maju.test',
    });
    expect(a.statusCode).toBe(201);
    expect(a.json().email).toBe('hrd@maju.test');
    expect(a.json().placementCount).toBe(0);
    ids.partnerA = a.json().id;
    const b = await call('POST', '/v1/pkl/partners', cookies.operator, { name: 'CV Karya Bersama' });
    ids.partnerB = b.json().id;
    const dup = await call('POST', '/v1/pkl/partners', cookies.admin, { name: 'PT Teknologi Maju' });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('conflict');
    expect((await call('POST', '/v1/pkl/partners', cookies.admin, { name: ' ' })).statusCode).toBe(400);
    const upd = await call('PUT', `/v1/pkl/partners/${ids.partnerB}`, cookies.admin, {
      name: 'CV Karya Bersama',
      field: 'Manufaktur',
    });
    expect(upd.json().field).toBe('Manufaktur');
    expect((await call('PUT', `/v1/pkl/partners/${ids.year}`, cookies.admin, { name: 'Z' })).statusCode).toBe(
      404,
    );
  });

  it('periode: validasi tanggal dan tahun ajaran lintas sekolah', async () => {
    const bad = await call('POST', '/v1/pkl/periods', cookies.admin, {
      academicYearId: ids.year,
      name: 'Terbalik',
      startsOn: '2025-05-01',
      endsOn: '2025-04-01',
    });
    expect(bad.statusCode).toBe(400);
    const foreignYear = await app.platformDb.execute(
      sql`select id from academic_year where school_id = ${otherId} limit 1`,
    );
    const fy = (foreignYear.rows[0] as { id: string }).id;
    const cross = await call('POST', '/v1/pkl/periods', cookies.admin, {
      academicYearId: fy,
      name: 'Lintas',
      startsOn: '2025-01-01',
      endsOn: '2025-02-01',
    });
    expect(cross.statusCode).toBe(400);
    expect(code(cross)).toBe('invalid_reference');
    const open = await call('POST', '/v1/pkl/periods', cookies.admin, {
      academicYearId: ids.year,
      name: 'PKL Terbuka',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
    });
    expect(open.statusCode).toBe(201);
    ids.pOpen = open.json().id;
    const past = await call('POST', '/v1/pkl/periods', cookies.operator, {
      academicYearId: ids.year,
      name: 'PKL Lampau',
      startsOn: '2020-01-01',
      endsOn: '2020-03-01',
    });
    ids.pPast = past.json().id;
    const dup = await call('POST', '/v1/pkl/periods', cookies.admin, {
      academicYearId: ids.year,
      name: 'PKL Terbuka',
      startsOn: '2000-01-01',
      endsOn: '2000-02-01',
    });
    expect(dup.statusCode).toBe(409);
    const list = await call('GET', '/v1/pkl/periods', cookies.principal);
    expect(list.json()).toHaveLength(2);
  });
});

describe('aspek', () => {
  it('bawaan hanya bila kosong, tambah/ubah, dan hapus', async () => {
    const d = await call('POST', '/v1/pkl/aspects/defaults', cookies.admin);
    expect(d.statusCode).toBe(201);
    expect(d.json().map((a: { name: string; weight: number }) => [a.name, a.weight])).toEqual([
      ['Disiplin', 20],
      ['Kompetensi teknis', 30],
      ['Etika kerja', 20],
      ['Kerja sama', 15],
      ['Laporan', 15],
    ]);
    const again = await call('POST', '/v1/pkl/aspects/defaults', cookies.admin);
    expect(again.statusCode).toBe(409);
    expect(code(again)).toBe('not_empty');
    const extra = await call('POST', '/v1/pkl/aspects', cookies.admin, { name: 'Inisiatif', weight: 10 });
    expect(extra.statusCode).toBe(201);
    expect(
      (await call('POST', '/v1/pkl/aspects', cookies.admin, { name: 'Inisiatif', weight: 5 })).statusCode,
    ).toBe(409);
    const upd = await call('PUT', `/v1/pkl/aspects/${extra.json().id}`, cookies.admin, {
      name: 'Inisiatif',
      weight: 12,
    });
    expect(upd.json().weight).toBe(12);
    expect((await call('DELETE', `/v1/pkl/aspects/${extra.json().id}`, cookies.admin)).statusCode).toBe(200);
  });
});

describe('penempatan', () => {
  it('massal: bentrok dilaporkan, referensi lintas sekolah ditolak', async () => {
    const first = await call('POST', '/v1/pkl/placements', cookies.admin, {
      periodId: ids.pOpen,
      partnerId: ids.partnerA,
      studentIds: [ids.ani, ids.budi],
      supervisorTeacherId: ids.supTeacher,
      industrySupervisorName: 'Pak Industri',
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().created).toHaveLength(2);
    expect(first.json().skipped).toEqual([]);

    const second = await call('POST', '/v1/pkl/placements', cookies.admin, {
      periodId: ids.pOpen,
      partnerId: ids.partnerB,
      studentIds: [ids.budi, ids.citra, ids.citra],
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().created).toHaveLength(1);
    expect(second.json().skipped).toEqual([{ studentId: ids.budi, reason: 'already_placed' }]);

    const foreign = await call('POST', '/v1/pkl/placements', cookies.admin, {
      periodId: ids.pOpen,
      partnerId: ids.partnerA,
      studentIds: [ids.foreign],
    });
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('invalid_reference');
    expect((await call('POST', '/v1/pkl/placements', cookies.principal, {})).statusCode).toBe(403);

    const list = await call('GET', `/v1/pkl/placements?periodId=${ids.pOpen}`, cookies.principal);
    expect(list.json().total).toBe(3);
    const ani = list.json().items.find((i: { studentName: string }) => i.studentName === 'Ani Wijaya');
    expect(ani).toMatchObject({
      className: 'XI RPL',
      partnerName: 'PT Teknologi Maju',
      supervisorName: 'Pak Pembimbing',
      status: 'planned',
      journalCount: 0,
      lastJournalDate: null,
      finalScore: null,
      canWrite: false,
    });
    const q = await call('GET', '/v1/pkl/placements?q=karya', cookies.admin);
    expect(q.json().items.map((i: { studentName: string }) => i.studentName)).toEqual(['Citra Lestari']);
    const partners = await call('GET', '/v1/pkl/partners', cookies.admin);
    expect(partners.json().find((p: { id: string }) => p.id === ids.partnerA).placementCount).toBe(2);
  });

  it('hapus mitra/periode yang dipakai: 409 in_use', async () => {
    const p = await call('DELETE', `/v1/pkl/partners/${ids.partnerA}`, cookies.admin);
    expect(p.statusCode).toBe(409);
    expect(code(p)).toBe('in_use');
    const pe = await call('DELETE', `/v1/pkl/periods/${ids.pOpen}`, cookies.admin);
    expect(pe.statusCode).toBe(409);
    expect(code(pe)).toBe('in_use');
  });

  it('transisi status dan hapus penempatan', async () => {
    const list = await call('GET', `/v1/pkl/placements?periodId=${ids.pOpen}`, cookies.admin);
    const byName = (n: string) => list.json().items.find((i: { studentName: string }) => i.studentName === n);
    const citra = byName('Citra Lestari').id;
    const bad = await call('PUT', `/v1/pkl/placements/${citra}`, cookies.admin, { status: 'completed' });
    expect(bad.statusCode).toBe(409);
    expect(code(bad)).toBe('invalid_transition');
    const moved = await call('PUT', `/v1/pkl/placements/${citra}`, cookies.admin, {
      partnerId: ids.partnerA,
      status: 'active',
    });
    expect(moved.json()).toMatchObject({ status: 'active', partnerName: 'PT Teknologi Maju' });
    const done = await call('PUT', `/v1/pkl/placements/${citra}`, cookies.admin, { status: 'completed' });
    expect(done.json().status).toBe('completed');
    const back = await call('PUT', `/v1/pkl/placements/${citra}`, cookies.admin, { status: 'active' });
    expect(back.statusCode).toBe(409);
    // Hanya planned tanpa jurnal yang bisa dihapus.
    expect((await call('DELETE', `/v1/pkl/placements/${citra}`, cookies.admin)).statusCode).toBe(409);
    const extra = await call('POST', '/v1/pkl/placements', cookies.admin, {
      periodId: ids.pOpen,
      partnerId: ids.partnerB,
      studentIds: [ids.dewi],
    });
    const dewi = extra.json().created[0].id;
    expect((await call('DELETE', `/v1/pkl/placements/${dewi}`, cookies.principal)).statusCode).toBe(403);
    expect((await call('DELETE', `/v1/pkl/placements/${dewi}`, cookies.admin)).statusCode).toBe(200);
    expect((await call('GET', `/v1/pkl/placements/${dewi}`, cookies.admin)).statusCode).toBe(404);
  });
});

describe('otorisasi tulis, jurnal, kunjungan, tautan', () => {
  let aniId = '';
  let budiId = '';
  it('guru pembimbing boleh, guru lain dan kepala sekolah tidak', async () => {
    const list = await call('GET', `/v1/pkl/placements?periodId=${ids.pOpen}`, cookies.admin);
    const items = list.json().items as { id: string; studentName: string }[];
    aniId = items.find((i) => i.studentName === 'Ani Wijaya')!.id;
    budiId = items.find((i) => i.studentName === 'Budi Santoso')!.id;
    await call('PUT', `/v1/pkl/placements/${aniId}`, cookies.admin, { status: 'active' });
    await call('PUT', `/v1/pkl/placements/${budiId}`, cookies.admin, { status: 'active' });

    const body = { date: '2025-03-05', activity: 'Instalasi jaringan', present: true };
    expect(
      (await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.otherTeacher, body)).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.principal, body)).statusCode,
    ).toBe(403);
    const ok = await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.sup, body);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ date: '2025-03-05', source: 'staff' });
    // Admin (pkl:manage) boleh di penempatan mana pun.
    expect(
      (await call('POST', `/v1/pkl/placements/${budiId}/journals`, cookies.admin, body)).statusCode,
    ).toBe(200);
    // Penempatan Citra tidak punya guru pembimbing: guru pembimbing Ani tidak boleh menulis di sana.
    const citra = items.find((i) => i.studentName === 'Citra Lestari')!.id;
    expect((await call('POST', `/v1/pkl/placements/${citra}/journals`, cookies.sup, body)).statusCode).toBe(
      403,
    );

    const mine = await call('GET', `/v1/pkl/placements/${aniId}`, cookies.sup);
    expect(mine.json().canWrite).toBe(true);
  });

  it('jurnal: upsert harian, masa depan dan luar periode ditolak, hapus', async () => {
    const day = { date: '2025-03-06', activity: 'Awal', present: true };
    await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.sup, day);
    const up = await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.sup, {
      ...day,
      activity: 'Diperbarui',
      present: false,
    });
    expect(up.statusCode).toBe(200);
    const list = await call('GET', `/v1/pkl/placements/${aniId}/journals`, cookies.principal);
    expect(list.json()).toHaveLength(2);
    expect(list.json()[0]).toMatchObject({ date: '2025-03-06', activity: 'Diperbarui', present: false });
    const ranged = await call(
      'GET',
      `/v1/pkl/placements/${aniId}/journals?from=2025-03-06&to=2025-03-10`,
      cookies.principal,
    );
    expect(ranged.json()).toHaveLength(1);

    const future = await call('POST', `/v1/pkl/placements/${aniId}/journals`, cookies.sup, {
      date: '2099-12-31',
      activity: 'Besok',
    });
    expect(future.statusCode).toBe(400);
    expect(code(future)).toBe('date_in_future');
    const sheet = await call('GET', `/v1/pkl/placements/${aniId}`, cookies.admin);
    expect(sheet.json().journalCount).toBe(2);
    expect(sheet.json().lastJournalDate).toBe('2025-03-06');

    const del = await call('DELETE', `/v1/pkl/journals/${up.json().id}`, cookies.otherTeacher);
    expect(del.statusCode).toBe(403);
    expect((await call('DELETE', `/v1/pkl/journals/${up.json().id}`, cookies.sup)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/pkl/journals/${up.json().id}`, cookies.sup)).statusCode).toBe(404);
  });

  it('kunjungan monitoring', async () => {
    const v = await call('POST', `/v1/pkl/placements/${aniId}/visits`, cookies.sup, {
      date: '2025-03-10',
      notes: 'Kondisi baik',
    });
    expect(v.statusCode).toBe(201);
    expect(v.json().teacherName).toBe('Pak Pembimbing');
    expect(
      (
        await call('POST', `/v1/pkl/placements/${aniId}/visits`, cookies.otherTeacher, {
          date: '2025-03-10',
          notes: 'x',
        })
      ).statusCode,
    ).toBe(403);
    const list = await call('GET', `/v1/pkl/placements/${aniId}/visits`, cookies.principal);
    expect(list.json()).toHaveLength(1);
    expect((await call('DELETE', `/v1/pkl/visits/${v.json().id}`, cookies.otherTeacher)).statusCode).toBe(
      403,
    );
    expect((await call('DELETE', `/v1/pkl/visits/${v.json().id}`, cookies.admin)).statusCode).toBe(200);
    await call('POST', `/v1/pkl/placements/${aniId}/visits`, cookies.admin, {
      date: '2025-03-11',
      teacherId: ids.otherTeacher,
      notes: 'Kunjungan kedua',
    });
  });

  it('tautan: token sekali, rotasi mencabut yang lama, cabut', async () => {
    expect(
      (await call('POST', `/v1/pkl/placements/${aniId}/access-link`, cookies.otherTeacher)).statusCode,
    ).toBe(403);
    const l1 = await call('POST', `/v1/pkl/placements/${aniId}/access-link`, cookies.sup);
    expect(l1.statusCode).toBe(201);
    const t1 = l1.json().token as string;
    expect(Buffer.from(t1, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(l1.json().path).toBe(`/pkl/${t1}`);
    // Token asli tidak tersimpan: hanya hash.
    const stored = await app.platformDb.execute(
      sql`select access_token_hash h from pkl_placement where id = ${aniId}`,
    );
    const hash = (stored.rows[0] as { h: string }).h;
    expect(hash).not.toBe(t1);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await call('GET', `/v1/pkl/placements/${aniId}`, cookies.admin)).json().hasAccessLink).toBe(true);
    expect((await pub('GET', `/v1/public/pkl/${t1}`)).statusCode).toBe(200);

    const l2 = await call('POST', `/v1/pkl/placements/${aniId}/access-link`, cookies.admin);
    const t2 = l2.json().token as string;
    expect(t2).not.toBe(t1);
    expect((await pub('GET', `/v1/public/pkl/${t1}`)).statusCode).toBe(404);
    expect((await pub('GET', `/v1/public/pkl/${t2}`)).statusCode).toBe(200);

    expect(
      (await call('DELETE', `/v1/pkl/placements/${aniId}/access-link`, cookies.otherTeacher)).statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/pkl/placements/${aniId}/access-link`, cookies.sup)).statusCode).toBe(
      200,
    );
    const gone = await pub('GET', `/v1/public/pkl/${t2}`);
    expect(gone.statusCode).toBe(404);
    expect(code(gone)).toBe('not_found');
  });
});

describe('nilai sekolah dan industri', () => {
  it('hasil tertimbang dengan angka diketahui', async () => {
    const list = await call('GET', `/v1/pkl/placements?q=Ani`, cookies.admin);
    const id = list.json().items[0].id as string;
    const aspects = (await call('GET', '/v1/pkl/aspects', cookies.admin)).json() as {
      id: string;
      name: string;
    }[];
    const idOf = (n: string) => aspects.find((a) => a.name === n)!.id;

    expect(
      (
        await call('PUT', `/v1/pkl/placements/${id}/scores`, cookies.otherTeacher, {
          records: [{ aspectId: idOf('Disiplin'), value: 80 }],
        })
      ).statusCode,
    ).toBe(403);
    const out = await call('PUT', `/v1/pkl/placements/${id}/scores`, cookies.sup, {
      records: [{ aspectId: idOf('Disiplin'), value: 101 }],
    });
    expect(out.statusCode).toBe(400);

    const school = await call('PUT', `/v1/pkl/placements/${id}/scores`, cookies.sup, {
      records: [
        { aspectId: idOf('Disiplin'), value: 80, note: 'Tepat waktu' },
        { aspectId: idOf('Kompetensi teknis'), value: 90 },
      ],
    });
    expect(school.statusCode).toBe(200);
    expect(school.json().result.final).toBe(86); // (80*20 + 90*30) / 50

    // Pembimbing industri lewat tautan.
    const link = (await call('POST', `/v1/pkl/placements/${id}/access-link`, cookies.admin)).json()
      .token as string;
    const view = await pub('GET', `/v1/public/pkl/${link}`);
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      school: { name: 'SMK PKL Uji' },
      student: { name: 'Ani Wijaya', className: 'XI RPL' },
      partner: { name: 'PT Teknologi Maju' },
      status: 'active',
      canWrite: true,
    });
    expect(view.json().aspects).toHaveLength(5);
    expect(JSON.stringify(view.json())).not.toContain(schoolId);
    const ind = await pub('PUT', `/v1/public/pkl/${link}/scores`, {
      records: [
        { aspectId: idOf('Disiplin'), value: 90 },
        { aspectId: idOf('Kompetensi teknis'), value: 70, note: 'Perlu latihan' },
      ],
    });
    expect(ind.statusCode).toBe(200);
    const sheet = await call('GET', `/v1/pkl/placements/${id}/scores`, cookies.principal);
    const body = sheet.json();
    const dis = body.aspects.find((a: { name: string }) => a.name === 'Disiplin');
    expect(dis.school).toEqual({ value: 80, note: 'Tepat waktu' });
    expect(dis.industry).toEqual({ value: 90, note: null });
    // Disiplin (80+90)/2 = 85, Kompetensi (90+70)/2 = 80 -> (85*20 + 80*30) / 50 = 82.
    expect(body.result.final).toBe(82);
    expect(body.result.predicate).toBe('B');
    const withScore = await call('GET', `/v1/pkl/placements/${id}`, cookies.admin);
    expect(withScore.json()).toMatchObject({ finalScore: 82, predicate: 'B' });

    // Aspek yang sudah bernilai tidak bisa dihapus.
    const del = await call('DELETE', `/v1/pkl/aspects/${idOf('Disiplin')}`, cookies.admin);
    expect(del.statusCode).toBe(409);
    expect(code(del)).toBe('in_use');

    // Aspek milik sekolah lain ditolak.
    const alien = await call('PUT', `/v1/pkl/placements/${id}/scores`, cookies.admin, {
      records: [{ aspectId: ids.year, value: 50 }],
    });
    expect(alien.statusCode).toBe(400);
  });
});

describe('ambang predikat', () => {
  it('bawaan 90/80/70, ubah mengubah predikat, validasi, dan terisolasi per sekolah', async () => {
    const get = (cookie: string, sid?: string) =>
      call('GET', '/v1/pkl/settings-thresholds', cookie, undefined, sid);
    const put = (cookie: string, body: object, sid?: string) =>
      call('PUT', '/v1/pkl/settings-thresholds', cookie, body, sid);
    const list = await call('GET', `/v1/pkl/placements?q=Ani`, cookies.admin);
    const id = list.json().items[0].id as string;

    expect((await get(cookies.principal)).json()).toEqual({ predicateA: 90, predicateB: 80, predicateC: 70 });
    // Nilai akhir 82 -> B dengan ambang bawaan.
    expect((await call('GET', `/v1/pkl/placements/${id}`, cookies.admin)).json().predicate).toBe('B');

    expect(
      (await put(cookies.principal, { predicateA: 90, predicateB: 80, predicateC: 70 })).statusCode,
    ).toBe(403);
    expect((await put(cookies.sup, { predicateA: 90, predicateB: 80, predicateC: 70 })).statusCode).toBe(403);
    for (const bad of [
      { predicateA: 80, predicateB: 80, predicateC: 70 },
      { predicateA: 90, predicateB: 70, predicateC: 80 },
      { predicateA: 101, predicateB: 80, predicateC: 70 },
      { predicateA: 90, predicateB: 80, predicateC: 0 },
      { predicateA: 90.5, predicateB: 80, predicateC: 70 },
    ]) {
      expect((await put(cookies.admin, bad)).statusCode).toBe(400);
    }
    expect(
      (await put(cookies.admin, { predicateA: 90, predicateB: 80, predicateC: 70 }, undefined)).statusCode,
    ).toBe(200);

    const changed = await put(cookies.admin, { predicateA: 95, predicateB: 85, predicateC: 75 });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ predicateA: 95, predicateB: 85, predicateC: 75 });
    // 82 sekarang di bawah B -> C; juga di lembar nilai.
    expect((await call('GET', `/v1/pkl/placements/${id}`, cookies.admin)).json().predicate).toBe('C');
    expect(
      (await call('GET', `/v1/pkl/placements/${id}/scores`, cookies.admin)).json().result.predicate,
    ).toBe('C');
    // Sekolah lain tidak terpengaruh.
    expect((await get(cookies.other, otherId)).json()).toEqual({
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
    expect((await get(cookies.noModule, noModuleId)).json().error.code).toBe('module_disabled');
    // Kembalikan ke bawaan agar pengujian berikutnya tidak terpengaruh.
    await put(cookies.admin, { predicateA: 90, predicateB: 80, predicateC: 70 });
  });
});

describe('rekap', () => {
  it('per penempatan dengan ringkasan', async () => {
    const res = await call('GET', `/v1/pkl/periods/${ids.pOpen}/report`, cookies.principal);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows.map((r: { studentName: string }) => r.studentName)).toEqual([
      'Ani Wijaya',
      'Budi Santoso',
      'Citra Lestari',
    ]);
    expect(body.rows[0]).toMatchObject({
      final: 82,
      predicate: 'B',
      journalDays: 1,
      presentDays: 1,
      visits: 1,
      className: 'XI RPL',
    });
    expect(body.rows[1]).toMatchObject({ final: null, journalDays: 1, visits: 0 });
    expect(body.summary).toEqual({ total: 3, scored: 1, unscored: 2, average: 82 });
    expect(
      (await call('GET', `/v1/pkl/periods/${ids.pPast}/report`, cookies.admin)).json().summary.total,
    ).toBe(0);
  });
});

describe('tautan publik', () => {
  it('token salah 404, tulis jurnal, periode lewat menjadi read-only', async () => {
    expect((await pub('GET', '/v1/public/pkl/token-ngawur')).statusCode).toBe(404);
    expect(
      (await pub('POST', '/v1/public/pkl/token-ngawur/journal', { date: '2025-03-05', activity: 'x' }))
        .statusCode,
    ).toBe(404);

    const list = await call('GET', `/v1/pkl/placements?periodId=${ids.pOpen}&q=Budi`, cookies.admin);
    const budi = list.json().items[0].id as string;
    const link = (await call('POST', `/v1/pkl/placements/${budi}/access-link`, cookies.admin)).json()
      .token as string;
    const w = await pub('POST', `/v1/public/pkl/${link}/journal`, {
      date: '2025-03-07',
      activity: 'Dari industri',
      present: true,
    });
    expect(w.statusCode).toBe(200);
    const future = await pub('POST', `/v1/public/pkl/${link}/journal`, { date: '2099-12-31', activity: 'x' });
    expect(future.statusCode).toBe(400);
    const view = await pub('GET', `/v1/public/pkl/${link}`);
    expect(view.json().journals[0]).toEqual({ date: '2025-03-07', activity: 'Dari industri', present: true });
    const staffView = await call('GET', `/v1/pkl/placements/${budi}/journals`, cookies.admin);
    expect(staffView.json().find((j: { date: string }) => j.date === '2025-03-07').source).toBe('industry');

    // Periode lampau (berakhir 2020): tautan hanya baca.
    const placed = await call('POST', '/v1/pkl/placements', cookies.admin, {
      periodId: ids.pPast,
      partnerId: ids.partnerB,
      studentIds: [ids.ani],
    });
    const past = placed.json().created[0].id as string;
    const staffJournal = await call('POST', `/v1/pkl/placements/${past}/journals`, cookies.admin, {
      date: '2020-02-01',
      activity: 'Masa lalu',
    });
    expect(staffJournal.statusCode).toBe(200);
    const outside = await call('POST', `/v1/pkl/placements/${past}/journals`, cookies.admin, {
      date: '2021-01-01',
      activity: 'Di luar periode',
    });
    expect(code(outside)).toBe('date_out_of_period');
    const pl = (await call('POST', `/v1/pkl/placements/${past}/access-link`, cookies.admin)).json()
      .token as string;
    const pv = await pub('GET', `/v1/public/pkl/${pl}`);
    expect(pv.statusCode).toBe(200);
    expect(pv.json().canWrite).toBe(false);
    const ro = await pub('POST', `/v1/public/pkl/${pl}/journal`, { date: '2020-02-02', activity: 'x' });
    expect(ro.statusCode).toBe(403);
    expect(code(ro)).toBe('link_read_only');
    const aspect = (await call('GET', '/v1/pkl/aspects', cookies.admin)).json()[0].id as string;
    const ro2 = await pub('PUT', `/v1/public/pkl/${pl}/scores`, {
      records: [{ aspectId: aspect, value: 80 }],
    });
    expect(code(ro2)).toBe('link_read_only');

    // Penempatan dibatalkan: tautan tidak berlaku lagi (404 seragam).
    await call('PUT', `/v1/pkl/placements/${past}`, cookies.admin, { status: 'cancelled' });
    expect((await pub('GET', `/v1/public/pkl/${pl}`)).statusCode).toBe(404);
  });

  it('sekolah tanpa modul: tautan 404', async () => {
    const list = await call('GET', `/v1/pkl/placements?q=Ani&periodId=${ids.pOpen}`, cookies.admin);
    const id = list.json().items[0].id as string;
    const t = (await call('POST', `/v1/pkl/placements/${id}/access-link`, cookies.admin)).json()
      .token as string;
    expect((await pub('GET', `/v1/public/pkl/${t}`)).statusCode).toBe(200);
    await app.platformDb.execute(
      sql`update entitlement set valid_until = now() - interval '1 day' where school_id = ${schoolId}`,
    );
    expect((await pub('GET', `/v1/public/pkl/${t}`)).statusCode).toBe(404);
  });
});

describe('lintas sekolah', () => {
  it('sekolah lain tidak melihat atau mengubah data', async () => {
    // Entitlement sekolah uji sudah kedaluwarsa pada tes sebelumnya; pakai sekolah lain untuk memeriksa isolasi.
    const list = await call('GET', '/v1/pkl/placements', cookies.other, undefined, otherId);
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(0);
    const partners = await call('GET', '/v1/pkl/partners', cookies.other, undefined, otherId);
    expect(partners.json()).toEqual([]);
    const any = (
      await app.platformDb.execute(sql`select id from pkl_placement where school_id = ${schoolId} limit 1`)
    ).rows[0] as { id: string };
    expect(
      (await call('GET', `/v1/pkl/placements/${any.id}`, cookies.other, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/pkl/placements/${any.id}/access-link`, cookies.other, undefined, otherId))
        .statusCode,
    ).toBe(404);
    // Admin sekolah lain tidak boleh memakai sekolah ini lewat header.
    expect((await call('GET', '/v1/pkl/partners', cookies.other, undefined, schoolId)).statusCode).toBe(403);
  });
});
