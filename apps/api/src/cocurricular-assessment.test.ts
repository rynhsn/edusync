import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  member,
  reportCard,
  school,
  seedSchoolRoles,
  semester,
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

/**
 * Tahap 4.3: penilaian kokurikuler. Menguji (1) sekolah tanpa penilaian tidak mendapat baris, (2) simpan/baca/hapus sel,
 * (3) hak menilai kontekstual (pengelola, koordinator, fasilitator rombelnya, guru lain 403), (4) 409 report_final lalu buka
 * kembali, (5) 409 cocurricular_assessed dan item_in_use, (6) program_closed, (7) bukti hanya tautan https, (8) isolasi sekolah.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const unknownId = '00000000-0000-7000-8000-000000000000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherId = '';
let yearId = '';
let semesterId = '';
let semester2Id = '';
let class7A = '';
let class7B = '';
let teacherCoord = '';
let teacherFacA = '';
let studentA1 = '';
let studentA2 = '';
let studentB1 = '';
let itemIds: string[] = [];
let levelIds: string[] = [];
const cookies: Record<string, string> = {};
const userIds: string[] = [];

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
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  sid: string,
  payload?: object,
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
const admin = () => cookies.admin as string;
const count = (table: string, sid = schoolId) =>
  app.platformDb
    .execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where school_id = ${sid}`,
    )
    .then((r) => r.rows[0]?.n ?? 0);

let programId = '';
const sheet = (cookie: string, classId = class7A, sem = semesterId, pid = programId, sid = schoolId) =>
  call(
    'GET',
    `/v1/cocurricular/programs/${pid}/assessments?semesterId=${sem}&classId=${classId}`,
    cookie,
    sid,
  );
const save = (
  cookie: string,
  cells: object[],
  over: { classId?: string; semesterId?: string; pid?: string } = {},
) =>
  call('PUT', `/v1/cocurricular/programs/${over.pid ?? programId}/assessments`, cookie, schoolId, {
    semesterId: over.semesterId ?? semesterId,
    classId: over.classId ?? class7A,
    cells,
  });
const cell = (studentId: string, itemIdx = 0, levelIdx: number | null = 0, note: string | null = null) => ({
  profileItemId: itemIds[itemIdx],
  studentId,
  rubricLevelId: levelIdx === null ? null : levelIds[levelIdx],
  note,
});
const newProgram = (extra: object) => ({
  academicYearId: yearId,
  form: 'other',
  title: 'Program uji',
  classIds: [class7A],
  profileItemIds: [itemIds[0]],
  ...extra,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Penilaian Kokurikuler', slug: `ypn-${run}` })
    .returning();
  foundationId = (f as { id: string }).id;
  const [sb] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const mkSchool = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: 'smp' })
      .returning();
    const sid = (s as { id: string }).id;
    await seedSchoolRoles(db, sid);
    await db.insert(entitlement).values({
      schoolId: sid,
      moduleKey: 'grades',
      subscriptionId: (sb as { id: string }).id,
      validUntil: (sb as { currentPeriodEnd: Date }).currentPeriodEnd,
    });
    return sid;
  };
  schoolId = await mkSchool('nil-a');
  otherId = await mkSchool('nil-b');
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = (y as { id: string }).id;
  const mkSem = async (name: string, a: string, b: string) => {
    const [s] = await db
      .insert(semester)
      .values({ schoolId, academicYearId: yearId, name, startsOn: a, endsOn: b })
      .returning();
    return (s as { id: string }).id;
  };
  semesterId = await mkSem('Ganjil', '2026-07-13', '2026-12-20');
  semester2Id = await mkSem('Genap', '2027-01-04', '2027-06-30');
  const mkClass = async (name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: '7' })
      .returning();
    return (c as { id: string }).id;
  };
  class7A = await mkClass('7A');
  class7B = await mkClass('7B');
  const mkStudent = async (name: string, classId: string) => {
    const [s] = await db.insert(student).values({ schoolId, name, gender: 'L' }).returning();
    const sid = (s as { id: string }).id;
    await db.insert(enrollment).values({ schoolId, studentId: sid, classId, academicYearId: yearId });
    return sid;
  };
  studentA1 = await mkStudent('Anak A1', class7A);
  studentA2 = await mkStudent('Anak A2', class7A);
  studentB1 = await mkStudent('Anak B1', class7B);

  const mkMember = async (label: string, sid: string, role: string) => {
    const u = await makeUser(label);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId: sid }).returning();
    const memberId = (m as { id: string }).id;
    await assignRoles(db, memberId, sid, [role]);
    cookies[label] = await login(u.email);
    return memberId;
  };
  const mkTeacher = async (label: string) => {
    const memberId = await mkMember(label, schoolId, 'teacher');
    const [t] = await db.insert(teacher).values({ schoolId, name: label, memberId }).returning();
    return (t as { id: string }).id;
  };
  await mkMember('admin', schoolId, 'school_admin');
  await mkMember('principal', schoolId, 'principal');
  await mkMember('guardian', schoolId, 'guardian');
  await mkMember('otherAdmin', otherId, 'school_admin');
  teacherCoord = await mkTeacher('coord');
  teacherFacA = await mkTeacher('facA');
  await mkTeacher('plain');

  const adopt = await call('POST', '/v1/cocurricular/profile-items/adopt', admin(), schoolId, {
    frameworkKey: 'profil_lulusan_2025',
  });
  itemIds = (adopt.json().items as { id: string }[]).map((i) => i.id);
  const lv = await call('PUT', '/v1/cocurricular/rubric-levels', admin(), schoolId, {
    levels: [
      { code: 'SB', label: 'Sangat Baik', sort: 1 },
      { code: 'B', label: 'Baik', sort: 2 },
      { code: 'X', label: 'Nonaktif', sort: 3, active: false },
    ],
  });
  levelIds = (lv.json().levels as { id: string }[]).map((l) => l.id);
  const prog = await call(
    'POST',
    '/v1/cocurricular/programs',
    admin(),
    schoolId,
    newProgram({
      semesterId: null,
      form: 'collaborative',
      title: 'Gaya Hidup Berkelanjutan',
      status: 'active',
      classIds: [class7A, class7B],
      profileItemIds: [itemIds[0], itemIds[1]],
      facilitators: [
        { teacherId: teacherCoord, classId: null, role: 'coordinator' },
        { teacherId: teacherFacA, classId: class7A, role: 'facilitator' },
      ],
    }),
  );
  expect(prog.statusCode, prog.body).toBe(201);
  programId = prog.json().id;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'cocurricular_evidence',
      'cocurricular_assessment',
      'cocurricular_facilitator',
      'cocurricular_program_target',
      'cocurricular_program_class',
      'cocurricular_program',
      'cocurricular_rubric_level',
      'school_profile_item',
      'report_card',
      'enrollment',
      'student',
      'class_room',
      'teacher',
      'semester',
      'academic_year',
      'entitlement',
      'member',
      'role',
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

describe('sekolah yang belum menilai', () => {
  it('lembar kosong dan tidak ada baris penilaian atau bukti', async () => {
    const res = await sheet(admin());
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.cells).toEqual([]);
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Anak A1', 'Anak A2']);
    expect(body).toMatchObject({ canAssess: true, locked: false, programClosed: false });
    expect(await count('cocurricular_assessment')).toBe(0);
    expect(await count('cocurricular_evidence')).toBe(0);
  });
});

describe('simpan, baca, dan hapus sel', () => {
  it('upsert idempoten, catatan saja diterima, sel kosong menghapus', async () => {
    const r1 = await save(admin(), [
      cell(studentA1, 0, 0),
      cell(studentA1, 1, null, 'aktif sekali'),
      cell(studentA2, 0, 1),
    ]);
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json()).toEqual({ saved: 3, cleared: 0 });
    const r2 = await save(admin(), [cell(studentA1, 0, 1)]);
    expect(r2.json()).toEqual({ saved: 1, cleared: 0 });
    expect(await count('cocurricular_assessment')).toBe(3);
    const got = (await sheet(admin())).json().cells as {
      studentId: string;
      profileItemId: string;
      rubricLevelId: string | null;
      note: string | null;
    }[];
    expect(got.find((c) => c.studentId === studentA1 && c.profileItemId === itemIds[0])?.rubricLevelId).toBe(
      levelIds[1],
    );
    expect(got.find((c) => c.studentId === studentA1 && c.profileItemId === itemIds[1])).toMatchObject({
      rubricLevelId: null,
      note: 'aktif sekali',
    });
    const r3 = await save(admin(), [cell(studentA2, 0, null, null)]);
    expect(r3.json()).toEqual({ saved: 0, cleared: 1 });
    expect(await count('cocurricular_assessment')).toBe(2);
  });

  it('menolak butir non-sasaran, tingkat nonaktif, murid di luar rombel, sel ganda, semester asing, dan batch > 500', async () => {
    expect((await save(admin(), [{ ...cell(studentA1), profileItemId: itemIds[5] }])).statusCode).toBe(400);
    expect((await save(admin(), [cell(studentA1, 0, 2)])).json().error.code).toBe('invalid_reference');
    const out = await save(admin(), [cell(studentB1)]);
    expect(out.statusCode).toBe(400);
    expect(out.json().error.code).toBe('student_not_in_class');
    expect((await save(admin(), [cell(studentA1), cell(studentA1)])).statusCode).toBe(400);
    expect((await save(admin(), [cell(studentA1)], { semesterId: unknownId })).statusCode).toBe(400);
    const big = await save(
      admin(),
      Array.from({ length: 501 }, () => cell(studentA1)),
    );
    expect(big.statusCode).toBe(400);
    expect(big.json().error.code).toBe('too_many_items');
  });
});

describe('hak menilai kontekstual', () => {
  it('fasilitator hanya rombelnya; koordinator semua; guru lain 403; kepala sekolah baca saja', async () => {
    const fac = cookies.facA as string;
    expect((await save(fac, [cell(studentA1, 0, 0)])).statusCode).toBe(200);
    expect((await save(fac, [cell(studentB1, 0, 0)], { classId: class7B })).statusCode).toBe(403);
    expect((await sheet(fac, class7B)).statusCode).toBe(403);
    expect((await sheet(fac, class7A)).json().canAssess).toBe(true);

    const coord = cookies.coord as string;
    expect((await save(coord, [cell(studentB1, 0, 0)], { classId: class7B })).statusCode).toBe(200);
    expect((await sheet(coord, class7B)).statusCode).toBe(200);

    const plain = cookies.plain as string;
    expect((await save(plain, [cell(studentA1, 0, 0)])).statusCode).toBe(403);
    expect((await sheet(plain)).statusCode).toBe(403);

    const principal = cookies.principal as string;
    const view = await sheet(principal);
    expect(view.statusCode).toBe(200);
    expect(view.json().canAssess).toBe(false);
    expect((await save(principal, [cell(studentA1, 0, 0)])).statusCode).toBe(403);

    expect((await save(cookies.guardian as string, [cell(studentA1)])).statusCode).toBe(403);
  });
});

describe('rapor final dan buka kembali', () => {
  it('report_final menolak tulis dan lepas butir/hapus program; setelah dibuka kembali boleh lagi', async () => {
    const db = app.platformDb;
    const [rc] = await db
      .insert(reportCard)
      .values({
        schoolId,
        semesterId,
        studentId: studentA1,
        classId: class7A,
        status: 'final',
        finalizedAt: new Date(),
      })
      .returning();
    const rcId = (rc as { id: string }).id;
    const w = await save(admin(), [cell(studentA1, 0, 0)]);
    expect(w.statusCode).toBe(409);
    expect(w.json().error.code).toBe('report_final');
    // Murid lain di rombel yang sama (rapor belum final) tetap boleh dinilai.
    expect((await save(admin(), [cell(studentA2, 0, 0)])).statusCode).toBe(200);
    expect((await sheet(admin())).json().locked).toBe(true);
    const rel = await call('PUT', `/v1/cocurricular/programs/${programId}/targets`, admin(), schoolId, {
      profileItemIds: [itemIds[1]],
    });
    expect(rel.statusCode).toBe(409);
    expect(rel.json().error.code).toBe('report_final');
    const del = await call('DELETE', `/v1/cocurricular/programs/${programId}`, admin(), schoolId);
    expect(del.json().error.code).toBe('report_final');
    await db.update(reportCard).set({ status: 'draft' }).where(eq(reportCard.id, rcId));
    expect((await save(admin(), [cell(studentA1, 0, 0)])).statusCode).toBe(200);
    expect((await sheet(admin())).json().locked).toBe(false);
    await db.delete(reportCard).where(eq(reportCard.id, rcId));
  });
});

describe('cocurricular_assessed dan item_in_use', () => {
  it('program, rombel, butir, dan tingkat yang sudah dinilai tidak bisa dilepas atau dihapus', async () => {
    const del = await call('DELETE', `/v1/cocurricular/programs/${programId}`, admin(), schoolId);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('cocurricular_assessed');
    const tgt = await call('PUT', `/v1/cocurricular/programs/${programId}/targets`, admin(), schoolId, {
      profileItemIds: [itemIds[1]],
    });
    expect(tgt.statusCode).toBe(409);
    expect(tgt.json().error.code).toBe('cocurricular_assessed');
    // Butir baru boleh ditambah dan dilepas lagi selama belum dinilai.
    const url = `/v1/cocurricular/programs/${programId}/targets`;
    expect(
      (await call('PUT', url, admin(), schoolId, { profileItemIds: [itemIds[0], itemIds[1], itemIds[2]] }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('PUT', url, admin(), schoolId, { profileItemIds: [itemIds[0], itemIds[1]] })).statusCode,
    ).toBe(200);

    const levels = (await call('GET', '/v1/cocurricular/rubric-levels', admin(), schoolId)).json().levels as {
      id: string;
      code: string;
      label: string;
      sort: number;
      active: boolean;
    }[];
    const plain = (l: (typeof levels)[number], active = l.active) => ({
      id: l.id,
      code: l.code,
      label: l.label,
      sort: l.sort,
      active,
    });
    const rmLevel = await call('PUT', '/v1/cocurricular/rubric-levels', admin(), schoolId, {
      levels: levels.filter((l) => l.id !== levelIds[0]).map((l) => plain(l)),
    });
    expect(rmLevel.statusCode).toBe(409);
    expect(rmLevel.json().error.code).toBe('item_in_use');
    const deact = await call('PUT', '/v1/cocurricular/rubric-levels', admin(), schoolId, {
      levels: levels.map((l) => plain(l, l.id === levelIds[0] ? false : l.active)),
    });
    expect(deact.statusCode).toBe(200);
    await call('PUT', '/v1/cocurricular/rubric-levels', admin(), schoolId, {
      levels: levels.map((l) => plain(l)),
    });
  });

  it('melepas rombel yang muridnya sudah dinilai ditolak; program tanpa penilaian bisa dihapus beserta buktinya', async () => {
    const p = await call(
      'POST',
      '/v1/cocurricular/programs',
      admin(),
      schoolId,
      newProgram({ title: 'Satu rombel', classIds: [class7A, class7B] }),
    );
    const id = p.json().id as string;
    expect((await save(admin(), [cell(studentB1, 0, 0)], { pid: id, classId: class7B })).statusCode).toBe(
      200,
    );
    const rel = await call('PUT', `/v1/cocurricular/programs/${id}/classes`, admin(), schoolId, {
      classIds: [class7A],
    });
    expect(rel.statusCode).toBe(409);
    expect(rel.json().error.code).toBe('cocurricular_assessed');
    // Melepas rombel lain yang belum punya penilaian murid diterima.
    expect(
      (
        await call('PUT', `/v1/cocurricular/programs/${id}/classes`, admin(), schoolId, {
          classIds: [class7A, class7B],
        })
      ).statusCode,
    ).toBe(200);
    await save(admin(), [cell(studentB1, 0, null)], { pid: id, classId: class7B });
    expect(
      (
        await call('PUT', `/v1/cocurricular/programs/${id}/classes`, admin(), schoolId, {
          classIds: [class7A],
        })
      ).statusCode,
    ).toBe(200);
    const ev = await call('POST', `/v1/cocurricular/programs/${id}/evidence`, admin(), schoolId, {
      title: 'Foto',
      url: 'https://contoh.id/a',
      classId: class7A,
    });
    expect(ev.statusCode).toBe(201);
    expect((await call('DELETE', `/v1/cocurricular/programs/${id}`, admin(), schoolId)).statusCode).toBe(200);
  });
});

describe('program selesai', () => {
  it('program_closed menolak simpan penilaian dan bukti, tetapi tetap bisa dibaca', async () => {
    const p = await call(
      'POST',
      '/v1/cocurricular/programs',
      admin(),
      schoolId,
      newProgram({ title: 'Ditutup', status: 'closed' }),
    );
    const id = p.json().id as string;
    const w = await save(admin(), [cell(studentA1)], { pid: id });
    expect(w.statusCode).toBe(409);
    expect(w.json().error.code).toBe('program_closed');
    const ev = await call('POST', `/v1/cocurricular/programs/${id}/evidence`, admin(), schoolId, {
      title: 'x',
      url: 'https://contoh.id/a',
      classId: class7A,
    });
    expect(ev.json().error.code).toBe('program_closed');
    expect((await sheet(admin(), class7A, semesterId, id)).json().programClosed).toBe(true);
  });
});

describe('bukti karya', () => {
  it('hanya tautan https; fasilitator hanya rombelnya; hapus mengikuti hak yang sama', async () => {
    const add = (cookie: string, body: object) =>
      call('POST', `/v1/cocurricular/programs/${programId}/evidence`, cookie, schoolId, body);
    const bads = [
      'http://contoh.id/a',
      'ftp://contoh.id/a',
      'javascript:alert(1)',
      'https://',
      'https://a b.id',
      `https://contoh.id/${'x'.repeat(500)}`,
    ];
    for (const url of bads) {
      const bad = await add(admin(), { title: 'x', url, classId: class7A });
      expect(bad.statusCode, url).toBe(400);
      expect(bad.json().error.code, url).toBe('invalid_url');
    }
    const fac = cookies.facA as string;
    const ok = await add(fac, {
      title: 'Foto karya',
      url: 'https://contoh.id/foto.jpg',
      classId: class7A,
      studentId: studentA1,
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json()).toMatchObject({ studentName: 'Anak A1', classId: class7A });
    const good = { title: 'x', url: 'https://contoh.id/b' };
    expect((await add(fac, { ...good, classId: class7B })).statusCode).toBe(403);
    expect((await add(fac, good)).statusCode).toBe(403);
    expect((await add(cookies.plain as string, { ...good, classId: class7A })).statusCode).toBe(403);
    expect((await add(admin(), { ...good, classId: class7A, studentId: studentB1 })).json().error.code).toBe(
      'student_not_in_class',
    );
    const listUrl = (c: string) => `/v1/cocurricular/programs/${programId}/evidence?classId=${c}`;
    const listed = await call('GET', listUrl(class7A), fac, schoolId);
    expect(listed.json().evidence).toHaveLength(1);
    expect((await call('GET', listUrl(class7B), fac, schoolId)).statusCode).toBe(403);
    const delUrl = `/v1/cocurricular/programs/${programId}/evidence/${ok.json().id}`;
    expect((await call('DELETE', delUrl, cookies.plain as string, schoolId)).statusCode).toBe(403);
    expect((await call('DELETE', delUrl, fac, schoolId)).statusCode).toBe(200);
    expect(await count('cocurricular_evidence')).toBe(0);
  });
});

describe('isolasi dan semester', () => {
  it('sekolah lain mendapat 404 atau 403 dan tidak mengubah apa pun', async () => {
    const other = cookies.otherAdmin as string;
    expect((await sheet(other, class7A, semesterId, programId, otherId)).statusCode).toBe(404);
    const w = await call('PUT', `/v1/cocurricular/programs/${programId}/assessments`, other, otherId, {
      semesterId,
      classId: class7A,
      cells: [cell(studentA1)],
    });
    expect(w.statusCode).toBe(404);
    expect(
      (await call('GET', `/v1/cocurricular/programs/${programId}/evidence`, other, otherId)).statusCode,
    ).toBe(404);
    expect((await sheet(other, class7A, semesterId, programId, schoolId)).statusCode).toBe(403);
  });

  it('semester kedua dinilai terpisah dari semester pertama', async () => {
    const before = (await sheet(admin())).json().cells.length;
    expect((await save(admin(), [cell(studentA1, 0, 1)], { semesterId: semester2Id })).statusCode).toBe(200);
    expect((await sheet(admin(), class7A, semester2Id)).json().cells).toHaveLength(1);
    expect((await sheet(admin())).json().cells).toHaveLength(before);
  });
});

describe('pilihan layar penilaian', () => {
  it('fasilitator hanya melihat rombelnya; semester program sepanjang tahun lengkap; tanpa izin tahun ajaran', async () => {
    const url = `/v1/cocurricular/programs/${programId}/assessment-options`;
    const fac = (await call('GET', url, cookies.facA as string, schoolId)).json();
    expect(fac.classes.map((c: { name: string }) => c.name)).toEqual(['7A']);
    expect(fac.semesters.map((s: { name: string }) => s.name)).toEqual(['Ganjil', 'Genap']);
    const all = (await call('GET', url, cookies.coord as string, schoolId)).json();
    expect(all.classes.map((c: { name: string }) => c.name)).toEqual(['7A', '7B']);
    expect((await call('GET', url, cookies.plain as string, schoolId)).json().classes).toEqual([]);
    expect((await call('GET', url, cookies.otherAdmin as string, otherId)).statusCode).toBe(404);
  });
});
