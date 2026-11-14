import {
  academicYear,
  assignRoles,
  classRoom,
  curriculumSubjectAllocation,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  subject,
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
 * Tahap 4.2: program kokurikuler. Menguji (1) sekolah tanpa program tidak mendapat baris apa pun, (2) buat/ubah/hapus program dan
 * validasi referensi (semester, rombel, butir, guru), (3) fasilitator vs koordinator, (4) rombel yang masih punya fasilitator tidak
 * bisa dilepas, (5) rencana JP vs alokasi, (6) 409 item_in_use pada butir, (7) izin, modul, dan isolasi antar sekolah.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherId = '';
let noModuleId = '';
let yearId = '';
let otherYearId = '';
let semesterId = '';
let class7A = '';
let class7B = '';
let class8A = '';
let otherSchoolClass = '';
let teacherA = '';
let teacherB = '';
let itemIds: string[] = [];
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

const newProgram = (extra: object = {}) => ({
  academicYearId: yearId,
  semesterId: null,
  form: 'collaborative',
  title: 'Gaya Hidup Berkelanjutan',
  plannedPeriods: 20,
  classIds: [class7A],
  profileItemIds: [itemIds[0]],
  ...extra,
});
const createProgram = async (extra: object = {}) => {
  const res = await call('POST', '/v1/cocurricular/programs', admin(), schoolId, newProgram(extra));
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; classes: unknown[]; targets: unknown[]; facilitators: unknown[] };
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Program Kokurikuler', slug: `ypk-${run}` })
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
  const mkSchool = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: 'smp' })
      .returning();
    const sid = (s as { id: string }).id;
    await seedSchoolRoles(db, sid);
    for (const moduleKey of modules) {
      await db.insert(entitlement).values({
        schoolId: sid,
        moduleKey,
        subscriptionId: (sb as { id: string }).id,
        validUntil: (sb as { currentPeriodEnd: Date }).currentPeriodEnd,
      });
    }
    return sid;
  };
  schoolId = await mkSchool('prog-a', ['grades']);
  otherId = await mkSchool('prog-b', ['grades']);
  noModuleId = await mkSchool('prog-nom', ['attendance']);

  const mkYear = async (sid: string, name: string, active: boolean) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: active })
      .returning();
    return (y as { id: string }).id;
  };
  yearId = await mkYear(schoolId, '2026/2027', true);
  otherYearId = await mkYear(schoolId, '2025/2026', false);
  const otherSchoolYear = await mkYear(otherId, '2026/2027', true);
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
    })
    .returning();
  semesterId = (sem as { id: string }).id;
  const mkClass = async (sid: string, y: string, name: string, level: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: y, name, level })
      .returning();
    return (c as { id: string }).id;
  };
  class7A = await mkClass(schoolId, yearId, '7A', '7');
  class7B = await mkClass(schoolId, yearId, '7B', '7');
  class8A = await mkClass(schoolId, yearId, '8A', '8');
  otherSchoolClass = await mkClass(otherId, otherSchoolYear, '7A', '7');
  const mkTeacher = async (sid: string, name: string) => {
    const [t] = await db.insert(teacher).values({ schoolId: sid, name }).returning();
    return (t as { id: string }).id;
  };
  teacherA = await mkTeacher(schoolId, 'Guru A');
  teacherB = await mkTeacher(schoolId, 'Guru B');

  const mkMember = async (label: string, sid: string, role: string) => {
    const u = await makeUser(label);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId: sid }).returning();
    await assignRoles(db, (m as { id: string }).id, sid, [role]);
    cookies[label] = await login(u.email);
  };
  await mkMember('admin', schoolId, 'school_admin');
  await mkMember('teacher', schoolId, 'teacher');
  await mkMember('guardian', schoolId, 'guardian');
  await mkMember('otherAdmin', otherId, 'school_admin');
  await mkMember('noModAdmin', noModuleId, 'school_admin');

  // Butir sekolah diadopsi lewat API (jalur nyata).
  const adopt = await call('POST', '/v1/cocurricular/profile-items/adopt', admin(), schoolId, {
    frameworkKey: 'profil_lulusan_2025',
  });
  itemIds = (adopt.json().items as { id: string }[]).map((i) => i.id);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId, noModuleId]) {
    for (const table of [
      'audit_log',
      'cocurricular_facilitator',
      'cocurricular_program_target',
      'cocurricular_program_class',
      'cocurricular_program',
      'school_profile_item',
      'curriculum_subject_allocation',
      'subject',
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

describe('sekolah yang belum memakai program', () => {
  it('daftar kosong dan tidak ada baris yang dibuat otomatis', async () => {
    const res = await call('GET', '/v1/cocurricular/programs', admin(), schoolId);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ academicYearId: yearId, programs: [] });
    for (const t of [
      'cocurricular_program',
      'cocurricular_program_target',
      'cocurricular_program_class',
      'cocurricular_facilitator',
    ]) {
      expect(await count(t), t).toBe(0);
    }
    const none = await call('GET', '/v1/cocurricular/programs', cookies.otherAdmin as string, otherId);
    expect(none.json().programs).toEqual([]);
  });
});

describe('buat, baca, ubah, hapus program', () => {
  it('membuat program lengkap dengan rombel, butir, dan fasilitator', async () => {
    const p = await createProgram({
      classIds: [class7A, class7B],
      profileItemIds: [itemIds[0], itemIds[1]],
      facilitators: [
        { teacherId: teacherA, role: 'coordinator' },
        { teacherId: teacherB, classId: class7B, role: 'facilitator' },
      ],
    });
    const d = (await call('GET', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).json();
    expect(d).toMatchObject({
      title: 'Gaya Hidup Berkelanjutan',
      status: 'draft',
      showInReport: true,
      classCount: 2,
    });
    expect(d.classes.map((c: { name: string }) => c.name)).toEqual(['7A', '7B']);
    expect(d.targets).toHaveLength(2);
    expect(d.facilitators.map((f: { role: string }) => f.role)).toEqual(['coordinator', 'facilitator']);
    const list = (await call('GET', '/v1/cocurricular/programs', admin(), schoolId)).json();
    expect(list.programs[0]).toMatchObject({ id: p.id, classCount: 2, targetCount: 2, facilitatorCount: 2 });
  });

  it('PUT mengubah data pokok (tahun tetap), status closed, dan saringan daftar', async () => {
    const p = await createProgram({ title: 'Program Semester' });
    const put = await call('PUT', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId, {
      semesterId,
      form: 'g7kaih',
      title: 'Program Semester 2',
      theme: 'Hidup sehat',
      plannedPeriods: 8,
      showInReport: false,
      status: 'active',
    });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({
      semesterId,
      form: 'g7kaih',
      status: 'active',
      showInReport: false,
      theme: 'Hidup sehat',
    });
    const closed = await call('GET', '/v1/cocurricular/programs?status=closed', admin(), schoolId);
    expect(closed.json().programs).toEqual([]);
    const active = await call(
      'GET',
      `/v1/cocurricular/programs?status=active&semesterId=${semesterId}`,
      admin(),
      schoolId,
    );
    expect(active.json().programs.map((x: { id: string }) => x.id)).toEqual([p.id]);
  });

  it('referensi tidak valid ditolak 400 invalid_reference', async () => {
    const bad = async (extra: object, url = '/v1/cocurricular/programs', method: 'POST' | 'PUT' = 'POST') => {
      const res = await call(method, url, admin(), schoolId, extra);
      expect(res.statusCode, JSON.stringify(extra) + res.body).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    };
    const before = await count('cocurricular_program');
    await bad(newProgram({ academicYearId: crypto.randomUUID() }));
    await bad(newProgram({ semesterId: crypto.randomUUID() }));
    await bad(newProgram({ academicYearId: otherYearId, semesterId }));
    await bad(newProgram({ academicYearId: otherYearId }));
    await bad(newProgram({ classIds: [otherSchoolClass] }));
    await bad(newProgram({ profileItemIds: [crypto.randomUUID()] }));
    await bad(newProgram({ facilitators: [{ teacherId: crypto.randomUUID(), role: 'coordinator' }] }));
    await bad(newProgram({ facilitators: [{ teacherId: teacherA, classId: class8A, role: 'facilitator' }] }));
    await bad(newProgram({ facilitators: [{ teacherId: teacherA, role: 'facilitator' }] }));
    await bad(newProgram({ facilitators: [{ teacherId: teacherA, classId: class7A, role: 'coordinator' }] }));
    expect(await count('cocurricular_program')).toBe(before);
    const p = await createProgram({ title: 'Untuk PUT' });
    await bad(
      { form: 'other', title: 'x', semesterId: crypto.randomUUID() },
      `/v1/cocurricular/programs/${p.id}`,
      'PUT',
    );
  });

  it('fasilitator ganda 409; field tidak sah (form, JP negatif) ditolak', async () => {
    const res = await call(
      'POST',
      '/v1/cocurricular/programs',
      admin(),
      schoolId,
      newProgram({
        facilitators: [
          { teacherId: teacherA, role: 'coordinator' },
          { teacherId: teacherA, role: 'coordinator' },
        ],
      }),
    );
    expect(res.statusCode).toBe(409);
    expect(
      (await call('POST', '/v1/cocurricular/programs', admin(), schoolId, newProgram({ form: 'x' })))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/cocurricular/programs', admin(), schoolId, newProgram({ plannedPeriods: -1 })))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/cocurricular/programs', admin(), schoolId, newProgram({ title: '  ' })))
        .statusCode,
    ).toBe(400);
  });

  it('endpoint khusus mengganti rombel, butir, dan fasilitator; rombel berfasilitator tak bisa dilepas', async () => {
    const p = await createProgram({ title: 'Anak program' });
    const cls = await call('PUT', `/v1/cocurricular/programs/${p.id}/classes`, admin(), schoolId, {
      classIds: [class7A, class7B],
    });
    expect(cls.json().classes).toHaveLength(2);
    const fac = await call('PUT', `/v1/cocurricular/programs/${p.id}/facilitators`, admin(), schoolId, {
      facilitators: [{ teacherId: teacherB, classId: class7B, role: 'facilitator' }],
    });
    expect(fac.statusCode, fac.body).toBe(200);
    const stuck = await call('PUT', `/v1/cocurricular/programs/${p.id}/classes`, admin(), schoolId, {
      classIds: [class7A],
    });
    expect(stuck.statusCode).toBe(409);
    expect(
      (await call('GET', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).json().classes,
    ).toHaveLength(2);
    const tg = await call('PUT', `/v1/cocurricular/programs/${p.id}/targets`, admin(), schoolId, {
      profileItemIds: [itemIds[2], itemIds[3], itemIds[2]],
    });
    expect(tg.json().targets).toHaveLength(2);
    const clear = await call('PUT', `/v1/cocurricular/programs/${p.id}/facilitators`, admin(), schoolId, {
      facilitators: [],
    });
    expect(clear.json().facilitators).toEqual([]);
    expect(
      (
        await call('PUT', `/v1/cocurricular/programs/${p.id}/classes`, admin(), schoolId, {
          classIds: [class7A],
        })
      ).statusCode,
    ).toBe(200);
  });

  it('hapus program ikut menghapus anak; id tak dikenal 404', async () => {
    const p = await createProgram({
      facilitators: [{ teacherId: teacherA, role: 'coordinator' }],
    });
    const before = await count('cocurricular_facilitator');
    expect((await call('DELETE', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).statusCode).toBe(
      200,
    );
    expect(await count('cocurricular_facilitator')).toBe(before - 1);
    expect((await call('GET', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).statusCode).toBe(
      404,
    );
  });
});

describe('butir sasaran dan nonaktif', () => {
  it('butir nonaktif tidak bisa dipilih baru, tetapi sasaran lama boleh tetap; butir terpakai tak bisa dihapus', async () => {
    const p = await createProgram({ profileItemIds: [itemIds[4]] });
    const all = (await call('GET', '/v1/cocurricular/profile-items', admin(), schoolId)).json().items as {
      id: string;
      code: string;
      label: string;
      frameworkKey: string;
      active: boolean;
    }[];
    const put = (items: typeof all) =>
      call('PUT', '/v1/cocurricular/profile-items', admin(), schoolId, {
        items: items.map((i) => ({
          id: i.id,
          frameworkKey: i.frameworkKey,
          code: i.code,
          label: i.label,
          active: i.active,
        })),
      });
    // Nonaktifkan butir yang dipakai: boleh.
    expect((await put(all.map((i) => (i.id === itemIds[4] ? { ...i, active: false } : i)))).statusCode).toBe(
      200,
    );
    // Menghapus butir yang dipakai: 409 item_in_use, tidak ada yang berubah.
    const del = await put(all.filter((i) => i.id !== itemIds[4]));
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('item_in_use');
    expect(
      (await call('GET', '/v1/cocurricular/profile-items', admin(), schoolId)).json().items,
    ).toHaveLength(all.length);
    // Sasaran lama yang nonaktif boleh tetap; butir nonaktif baru ditolak.
    const keep = await call('PUT', `/v1/cocurricular/programs/${p.id}/targets`, admin(), schoolId, {
      profileItemIds: [itemIds[4]],
    });
    expect(keep.statusCode, keep.body).toBe(200);
    const fresh = await call('PUT', `/v1/cocurricular/programs/${p.id}/targets`, admin(), schoolId, {
      profileItemIds: [itemIds[4], itemIds[5]],
    });
    expect(fresh.statusCode).toBe(200);
    await call('DELETE', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId);
    // Setelah program terhapus, butir bebas dihapus.
    expect((await put(all.filter((i) => i.id !== itemIds[4]))).statusCode).toBe(200);
    const inactiveTry = await call(
      'POST',
      '/v1/cocurricular/programs',
      admin(),
      schoolId,
      newProgram({ profileItemIds: [itemIds[4]] }),
    );
    expect(inactiveTry.statusCode).toBe(400);
  });
});

describe('rencana JP vs alokasi', () => {
  it('menjumlahkan rencana per tingkat dan memperingatkan bila melebihi alokasi', async () => {
    const db = app.platformDb;
    const [sub] = await db.insert(subject).values({ schoolId, code: 'IPAS', name: 'IPAS' }).returning();
    await db.insert(curriculumSubjectAllocation).values({
      schoolId,
      academicYearId: yearId,
      levelCode: '7',
      subjectId: (sub as { id: string }).id,
      cocurricularYearlyPeriods: 30,
    });
    const p1 = await createProgram({ title: 'JP1', plannedPeriods: 20, classIds: [class7A, class8A] });
    const p2 = await createProgram({ title: 'JP2', plannedPeriods: 15, classIds: [class7B] });
    const res = await call(
      'GET',
      `/v1/cocurricular/periods-summary?academicYearId=${yearId}`,
      admin(),
      schoolId,
    );
    expect(res.statusCode, res.body).toBe(200);
    const levels = res.json().levels as {
      levelCode: string;
      plannedPeriods: number;
      allocatedPeriods: number | null;
      exceeds: boolean;
      programCount: number;
    }[];
    const l7 = levels.find((l) => l.levelCode === '7');
    const l8 = levels.find((l) => l.levelCode === '8');
    // Tingkat 7 memuat semua program dari tes sebelumnya yang berrombel 7A/7B (rencana 20) ditambah JP1 dan JP2.
    expect(l7?.allocatedPeriods).toBe(30);
    expect(l7?.exceeds).toBe(true);
    expect(l7?.plannedPeriods).toBeGreaterThanOrEqual(35);
    expect(l8).toMatchObject({ plannedPeriods: 20, allocatedPeriods: null, exceeds: false, programCount: 1 });
    await call('DELETE', `/v1/cocurricular/programs/${p1.id}`, admin(), schoolId);
    await call('DELETE', `/v1/cocurricular/programs/${p2.id}`, admin(), schoolId);
    expect(
      (
        await call(
          'GET',
          `/v1/cocurricular/periods-summary?academicYearId=${crypto.randomUUID()}`,
          admin(),
          schoolId,
        )
      ).statusCode,
    ).toBe(400);
  });
});

describe('izin, modul, dan isolasi', () => {
  it('guru dengan read boleh melihat tetapi tidak menulis; wali murid ditolak', async () => {
    const p = await createProgram({ title: 'Izin' });
    const t = cookies.teacher as string;
    expect((await call('GET', '/v1/cocurricular/programs', t, schoolId)).statusCode).toBe(200);
    expect((await call('GET', `/v1/cocurricular/programs/${p.id}`, t, schoolId)).statusCode).toBe(200);
    expect(
      (await call('GET', `/v1/cocurricular/periods-summary?academicYearId=${yearId}`, t, schoolId))
        .statusCode,
    ).toBe(200);
    expect((await call('POST', '/v1/cocurricular/programs', t, schoolId, newProgram())).statusCode).toBe(403);
    expect(
      (await call('PUT', `/v1/cocurricular/programs/${p.id}`, t, schoolId, { form: 'other', title: 'x' }))
        .statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/cocurricular/programs/${p.id}`, t, schoolId)).statusCode).toBe(403);
    expect(
      (await call('PUT', `/v1/cocurricular/programs/${p.id}/classes`, t, schoolId, { classIds: [] }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', `/v1/cocurricular/programs/${p.id}/targets`, t, schoolId, { profileItemIds: [] }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', `/v1/cocurricular/programs/${p.id}/facilitators`, t, schoolId, { facilitators: [] }))
        .statusCode,
    ).toBe(403);
    const g = cookies.guardian as string;
    expect((await call('GET', '/v1/cocurricular/programs', g, schoolId)).statusCode).toBe(403);
    expect((await call('GET', `/v1/cocurricular/programs/${p.id}`, g, schoolId)).statusCode).toBe(403);
  });

  it('sekolah tanpa modul grades ditolak module_disabled', async () => {
    const res = await call('GET', '/v1/cocurricular/programs', cookies.noModAdmin as string, noModuleId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('module_disabled');
    expect(
      (
        await call(
          'POST',
          '/v1/cocurricular/programs',
          cookies.noModAdmin as string,
          noModuleId,
          newProgram(),
        )
      ).statusCode,
    ).toBe(403);
    expect(await count('cocurricular_program', noModuleId)).toBe(0);
  });

  it('sekolah lain tidak melihat atau menyentuh program; header sekolah lain ditolak', async () => {
    const p = await createProgram({ title: 'Milik A' });
    const other = cookies.otherAdmin as string;
    expect((await call('GET', '/v1/cocurricular/programs', other, otherId)).json().programs).toEqual([]);
    expect((await call('GET', `/v1/cocurricular/programs/${p.id}`, other, otherId)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/cocurricular/programs/${p.id}`, other, otherId)).statusCode).toBe(404);
    expect(
      (await call('PUT', `/v1/cocurricular/programs/${p.id}/classes`, other, otherId, { classIds: [] }))
        .statusCode,
    ).toBe(404);
    expect((await call('GET', '/v1/cocurricular/programs', other, schoolId)).statusCode).toBe(403);
    expect((await call('GET', `/v1/cocurricular/programs/${p.id}`, admin(), schoolId)).statusCode).toBe(200);
  });
});
