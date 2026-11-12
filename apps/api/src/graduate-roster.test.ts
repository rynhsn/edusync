import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  guardian,
  member,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { historicalRosterOf, rosterOf } from './attendance-lib';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Siswa berstatus `graduated` (ditetapkan lulus oleh kenaikan kelas) tetap punya enrollment tahun terakhirnya, jadi
 * rapor dan rekap nilai tahun itu harus tetap memuatnya dan dapat difinalkan (`historicalRosterOf`). Jalur operasional
 * dan penulisan (`rosterOf`) tetap hanya siswa aktif. Siswa pindah dan keluar dikecualikan di semua jalur.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
let adminCookie = '';
let guardianCookie = '';
const userIds: string[] = [];

const ids = {
  semester: '',
  cls: '',
  oldCls: '',
  mat: '',
  tugas: '',
  matTugas: '',
  ani: '',
  gita: '',
  hana: '',
  tono: '',
  dodi: '',
  guardianId: '',
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

const call = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: object) =>
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

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const listUrl = () => `/v1/report-cards?semesterId=${ids.semester}&classId=${ids.cls}`;
const docUrl = (studentId: string) => `/v1/report-cards/${studentId}?semesterId=${ids.semester}`;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Lulusan', slug: `yl-${run}` })
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
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug: `lul-${run}`, name: 'Sekolah Lulusan' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  for (const moduleKey of ['grades', 'attendance', 'parent_portal']) {
    await db
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  }

  const mkYear = async (name: string, startsOn: string, endsOn: string, isActive: boolean) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId, name, startsOn, endsOn, isActive })
      .returning();
    return y!.id;
  };
  const lastYear = await mkYear('2000-2099', '2000-01-01', '2099-12-31', true);
  const oldYear = await mkYear('1990-1999', '1990-01-01', '1999-12-31', false);
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: lastYear,
      name: 'Genap',
      startsOn: '2026-01-05',
      endsOn: '2026-06-30',
      isActive: true,
    })
    .returning();
  ids.semester = sem!.id;

  const mkClass = async (yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: 'XII' })
      .returning();
    return c!.id;
  };
  ids.cls = await mkClass(lastYear, 'XII A');
  ids.oldCls = await mkClass(oldYear, 'XI A');

  const mkStudent = async (
    name: string,
    status: 'active' | 'graduated' | 'transferred' | 'dropped',
    enrol: { academicYearId: string; classId: string } | null,
  ) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', status, nis: `${name}-${run}`, nisn: `N-${name}-${run}` })
      .returning();
    if (enrol) await db.insert(enrollment).values({ schoolId, studentId: st!.id, ...enrol });
    return st!.id;
  };
  const here = { academicYearId: lastYear, classId: ids.cls };
  ids.ani = await mkStudent('Ani', 'active', here);
  ids.gita = await mkStudent('Gita', 'graduated', here);
  // Lulusan yang hanya terdaftar di kelas tahun lain: tidak ikut kelas ini.
  ids.hana = await mkStudent('Hana', 'graduated', { academicYearId: oldYear, classId: ids.oldCls });
  ids.tono = await mkStudent('Tono', 'transferred', here);
  ids.dodi = await mkStudent('Dodi', 'dropped', here);

  const [mat] = await db.insert(subject).values({ schoolId, code: 'MAT', name: 'Matematika' }).returning();
  ids.mat = mat!.id;
  const [tugas] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  ids.tugas = tugas!.id;
  const [asm] = await db
    .insert(assessment)
    .values({
      schoolId,
      semesterId: ids.semester,
      classId: ids.cls,
      subjectId: ids.mat,
      componentId: ids.tugas,
      title: 'Tugas Mat',
      date: '2026-02-01',
    })
    .returning();
  ids.matTugas = asm!.id;
  // Nilai dimasukkan sebelum kelulusan ditetapkan; Tono (pindah) punya nilai tetapi tidak ikut roster.
  for (const [studentId, value] of [
    [ids.ani, 90],
    [ids.gita, 80],
    [ids.tono, 70],
  ] as const) {
    await db
      .insert(score)
      .values({ schoolId, assessmentId: ids.matTugas, studentId, value, updatedBy: 'uji' });
  }

  const admin = await makeUser('admin-lulusan');
  const [m] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);

  // Wali siswa lulusan lewat undangan portal yang sebenarnya.
  const [g] = await db.insert(guardian).values({ schoolId, name: 'Ibu Gita' }).returning();
  ids.guardianId = g!.id;
  await db
    .insert(studentGuardian)
    .values({ schoolId, studentId: ids.gita, guardianId: g!.id, relation: 'mother', isPrimary: true });
}, 90_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'outbox',
    'portal_link',
    'portal_invite',
    'report_card_snapshot',
    'report_card',
    'report_setting',
    'score',
    'assessment',
    'grade_component',
    'grading_setting',
    'student_guardian',
    'guardian',
    'enrollment',
    'class_room',
    'subject',
    'student',
    'semester',
    'academic_year',
    'member',
    'role',
    'entitlement',
  ]) {
    await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
}, 60_000);

describe('roster historis dan roster operasional', () => {
  it('historicalRosterOf: aktif dan lulusan tahun kelas itu; rosterOf hanya aktif', async () => {
    const hist = await withTenant(app.tenantDb, [schoolId], (tx) => historicalRosterOf(tx, ids.cls));
    expect(names(hist.rows)).toEqual(['Ani', 'Gita']);
    const ops = await withTenant(app.tenantDb, [schoolId], (tx) => rosterOf(tx, ids.cls));
    expect(names(ops.rows)).toEqual(['Ani']);
    // Lulusan hanya ikut bila punya enrollment pada tahun kelas itu (Hana hanya di kelas tahun lama).
    const old = await withTenant(app.tenantDb, [schoolId], (tx) => historicalRosterOf(tx, ids.oldCls));
    expect(names(old.rows)).toEqual(['Hana']);
    await expect(
      withTenant(app.tenantDb, [schoolId], (tx) => historicalRosterOf(tx, crypto.randomUUID())),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('jalur tulis tetap menolak lulusan: PUT skor 400 invalid_reference', async () => {
    for (const studentId of [ids.gita, ids.tono, ids.dodi, ids.hana]) {
      const res = await call('PUT', `/v1/assessments/${ids.matTugas}/scores`, adminCookie, {
        records: [{ studentId, value: 10 }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    }
    // Siswa aktif tetap bisa dinilai.
    const ok = await call('PUT', `/v1/assessments/${ids.matTugas}/scores`, adminCookie, {
      records: [{ studentId: ids.ani, value: 90 }],
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('pembacaan memuat lulusan; pindah dan keluar tidak', () => {
  it('daftar rapor kelas, dokumen siswa, dan kelengkapan', async () => {
    const list = (await call('GET', listUrl(), adminCookie)).json();
    expect(names(list)).toEqual(['Ani', 'Gita']);
    expect(list.map((s: { average: number | null }) => s.average)).toEqual([90, 80]);
    expect(list.every((s: { subjectsGraded: number }) => s.subjectsGraded === 1)).toBe(true);

    const doc = await call('GET', docUrl(ids.gita), adminCookie);
    expect(doc.statusCode).toBe(200);
    expect(doc.json().subjects[0]).toMatchObject({ name: 'Matematika', final: 80 });
    expect(doc.json().status).toBe('draft');
  });

  it('rekap mapel dan matriks kelas', async () => {
    const recap = (
      await call(
        'GET',
        `/v1/grading/recap?semesterId=${ids.semester}&classId=${ids.cls}&subjectId=${ids.mat}`,
        adminCookie,
      )
    ).json();
    expect(names(recap.students)).toEqual(['Ani', 'Gita']);
    expect(recap.stats.filled).toBe(2);

    const matrix = (
      await call('GET', `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.cls}`, adminCookie)
    ).json();
    expect(names(matrix.students)).toEqual(['Ani', 'Gita']);
  });

  it('lembar skor (baca) dan hitungan total/terisi penilaian', async () => {
    const sheet = (await call('GET', `/v1/assessments/${ids.matTugas}/scores`, adminCookie)).json();
    expect(names(sheet.students)).toEqual(['Ani', 'Gita']);
    expect(sheet.students.map((s: { value: number | null }) => s.value)).toEqual([90, 80]);
    expect(sheet.assessment).toMatchObject({ total: 2, filled: 2 });

    const list = (await call('GET', `/v1/assessments?semesterId=${ids.semester}`, adminCookie)).json();
    const row = (Array.isArray(list) ? list : list.items).find((a: { id: string }) => a.id === ids.matTugas);
    expect(row).toMatchObject({ total: 2, filled: 2 });
  });

  it('peringkat memperhitungkan lulusan', async () => {
    await call('PUT', '/v1/report-cards/settings', adminCookie, {
      descA: 'a',
      descB: 'b',
      descC: 'c',
      descD: 'd',
      showRank: true,
    });
    const rank = async (id: string) => (await call('GET', docUrl(id), adminCookie)).json().rank;
    expect(await rank(ids.ani)).toEqual({ position: 1, of: 2 });
    expect(await rank(ids.gita)).toEqual({ position: 2, of: 2 });
  });
});

describe('finalisasi dan portal wali', () => {
  it('finalisasi memuat lulusan saja; pindah, keluar, dan lulusan tahun lain tidak', async () => {
    const res = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.semester,
      classId: ids.cls,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ finalized: 2 });

    const rows = await app.platformDb.execute(
      sql`select s.name, rc.status, rc.snapshot is not null as has_snapshot
          from report_card rc join student s on s.id = rc.student_id
          where rc.school_id = ${schoolId} order by s.name`,
    );
    expect(
      (rows.rows as { name: string; status: string; has_snapshot: boolean }[]).map((r) => [
        r.name,
        r.status,
        r.has_snapshot,
      ]),
    ).toEqual([
      ['Ani', 'final', true],
      ['Gita', 'final', true],
    ]);

    const doc = (await call('GET', docUrl(ids.gita), adminCookie)).json();
    expect(doc.status).toBe('final');
    expect(doc.student.name).toBe('Gita');
    expect(doc.subjects[0]).toMatchObject({ final: 80 });
  });

  it('rekap kelas menandai nilai sesuai rapor terbit untuk lulusan', async () => {
    const recap = (
      await call(
        'GET',
        `/v1/grading/recap?semesterId=${ids.semester}&classId=${ids.cls}&subjectId=${ids.mat}`,
        adminCookie,
      )
    ).json();
    expect(names(recap.students)).toEqual(['Ani', 'Gita']);
    expect(recap.source).toBe('report');
    expect(recap.students.find((s: { name: string }) => s.name === 'Gita')).toMatchObject({
      final: 80,
      source: 'report',
    });
    const matrix = (
      await call('GET', `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.cls}`, adminCookie)
    ).json();
    expect(matrix.students.find((s: { name: string }) => s.name === 'Gita')).toMatchObject({
      source: 'report',
    });
  });

  it('wali siswa lulusan tetap melihat nilai dan rapor final anaknya', async () => {
    const invite = await call('POST', '/v1/portal/invites', adminCookie, {
      kind: 'guardian',
      guardianId: ids.guardianId,
    });
    expect(invite.statusCode).toBe(201);
    const email = `wali-gita-${run}@example.test`;
    const accept = await app.inject({
      method: 'POST',
      url: `/v1/public/portal-invites/${invite.json().token}/accept`,
      payload: { name: 'Ibu Gita', email, password },
    });
    expect(accept.statusCode).toBe(201);
    const [u] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, email));
    userIds.push(u!.id);
    guardianCookie = await login(email);

    const me = (await call('GET', '/v1/portal/me', guardianCookie)).json();
    expect(me.children.map((c: { name: string }) => c.name)).toEqual(['Gita']);
    expect(me.children[0].status).toBe('graduated');

    const grades = (await call('GET', `/v1/portal/children/${ids.gita}/grades`, guardianCookie)).json();
    expect(grades.available).toBe(true);
    expect(grades.subjects[0]).toMatchObject({ name: 'Matematika', final: 80, source: 'report' });

    const cards = (await call('GET', `/v1/portal/children/${ids.gita}/report-cards`, guardianCookie)).json();
    expect(cards.items).toHaveLength(1);
    const doc = await call(
      'GET',
      `/v1/portal/children/${ids.gita}/report-cards/${ids.semester}`,
      guardianCookie,
    );
    expect(doc.statusCode).toBe(200);
    expect(doc.json()).toMatchObject({ status: 'final' });
    expect(doc.json().subjects[0]).toMatchObject({ name: 'Matematika', final: 80 });
  });
});
